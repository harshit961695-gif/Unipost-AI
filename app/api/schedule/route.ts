export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import { createClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
    let user = null;
    try {
        user = await requireAuth(request);
        const formData = await request.formData();

        const metadataStr = formData.get('metadata') as string;
        const scheduled_at_ist = formData.get('scheduled_at_ist') as string;

        if (!metadataStr || !scheduled_at_ist) {
            return NextResponse.json({ error: 'Missing platforms or scheduled time' }, { status: 400 });
        }

        let platforms: any;
        try {
            platforms = JSON.parse(metadataStr);
        } catch (e) {
            return NextResponse.json({ error: 'Invalid platforms format' }, { status: 400 });
        }

        // Convert IST datetime string to UTC
        // Frontend sends: "2026-03-30T14:30" (IST, UTC+5:30)
        // We need to store it as UTC in the DB
        // Force parsing as IST (+05:30) timezone to make it timezone-independent
        const scheduledAt = new Date(`${scheduled_at_ist}+05:30`);

        const [datePart, timePart] = scheduled_at_ist.split('T');
        console.log("[SCHEDULE INPUT]", {
            date: datePart,
            time: timePart,
            timezone: 'Asia/Kolkata (IST, UTC+5:30)'
        });
        console.log("[SCHEDULE PARSED]", scheduledAt.toISOString());
        console.log("[SERVER NOW]", new Date().toISOString());
        console.log("[TIME DIFFERENCE MINUTES]", (scheduledAt.getTime() - Date.now()) / 60000);

        if (scheduledAt.getTime() <= Date.now()) {
            return NextResponse.json({ error: 'Scheduled time must be in the future' }, { status: 400 });
        }

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL || '',
            process.env.SUPABASE_SERVICE_ROLE_KEY || '',
            { auth: { persistSession: false, autoRefreshToken: false } }
        );

        const media_urls: Record<string, string> = {};
        const enabledPlatforms = Object.keys(platforms).filter(p => platforms[p].enabled);

        // Upload media to Supabase Storage
        for (const platform of enabledPlatforms) {
            const config = platforms[platform];
            const mediaFile = formData.get(`media_${platform}`) as File | null;
            const thumbnailFile = formData.get(`thumbnail_${platform}`) as File | null;

            // Validation checks for required media
            if (platform === 'instagram' && !mediaFile) {
                return NextResponse.json({ error: 'Instagram requires a media file for scheduling' }, { status: 400 });
            }
            if (platform === 'youtube' && !mediaFile) {
                return NextResponse.json({ error: 'YouTube requires a video file for scheduling' }, { status: 400 });
            }
            if (platform === 'facebook' && (config.type === 'reel' || config.type === 'story') && !mediaFile) {
                return NextResponse.json({ error: `Facebook ${config.type} requires a media file for scheduling` }, { status: 400 });
            }

            if (mediaFile) {
                console.log("[SCHEDULE MEDIA UPLOAD]", { platform, fileName: mediaFile.name, size: mediaFile.size, type: mediaFile.type });
                const fileExt = mediaFile.name.split('.').pop() || 'tmp';
                const fileName = `${user.id}_${platform}_${Date.now()}.${fileExt}`;
                const filePath = `scheduled/${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from('instagram_media')
                    .upload(filePath, mediaFile);

                if (uploadError) {
                    console.error(`[SCHEDULE MEDIA UPLOAD] Error uploading for ${platform}:`, uploadError);
                    throw new Error(`Failed to upload ${platform} media: ${uploadError.message}`);
                }

                const { data: { publicUrl } } = supabase.storage
                    .from('instagram_media')
                    .getPublicUrl(filePath);

                media_urls[platform] = publicUrl;
            }

            if (thumbnailFile) {
                console.log("[SCHEDULE MEDIA UPLOAD]", { platform: `${platform}_thumbnail`, fileName: thumbnailFile.name, size: thumbnailFile.size });
                const fileExt = thumbnailFile.name.split('.').pop() || 'tmp';
                const fileName = `${user.id}_${platform}_thumb_${Date.now()}.${fileExt}`;
                const filePath = `scheduled/${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from('instagram_media')
                    .upload(filePath, thumbnailFile);

                if (uploadError) {
                    console.error(`[SCHEDULE MEDIA UPLOAD] Error uploading thumbnail for ${platform}:`, uploadError);
                    throw new Error(`Failed to upload ${platform} thumbnail: ${uploadError.message}`);
                }

                const { data: { publicUrl } } = supabase.storage
                    .from('instagram_media')
                    .getPublicUrl(filePath);

                media_urls[`${platform}_thumbnail`] = publicUrl;
            }
        }

        console.log("[SCHEDULE MEDIA URLS]", media_urls);

        const insertPayload = {
            user_id: user.id,
            platforms,
            media_urls,
            scheduled_at: scheduledAt.toISOString(),
            status: 'pending'
        };

        console.log("[SCHEDULE PAYLOAD]", insertPayload);

        const { data, error } = await supabase
            .from('scheduled_posts')
            .insert(insertPayload)
            .select()
            .single();

        if (error) throw error;

        console.log(`[SCHEDULE] Created scheduled post ${data.id} for ${scheduledAt.toISOString()} (IST: ${scheduled_at_ist})`);

        return NextResponse.json({
            success: true,
            scheduled_post: data,
            scheduled_at_utc: scheduledAt.toISOString(),
            scheduled_at_ist: scheduled_at_ist
        });

    } catch (error: any) {
        console.error('Schedule API Error:', error);
        logger.scheduler.error(`Failed to schedule post for user ${user ? user.id : 'unknown'}`, {
            error: error.message,
            stack: error.stack
        });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// GET: Fetch user's scheduled posts
export async function GET(request: NextRequest) {
    try {
        const user = await requireAuth(request);

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL || '',
            process.env.SUPABASE_SERVICE_ROLE_KEY || '',
            { auth: { persistSession: false, autoRefreshToken: false } }
        );

        const { data, error } = await supabase
            .from('scheduled_posts')
            .select('*')
            .eq('user_id', user.id)
            .order('scheduled_at', { ascending: true });

        if (error) throw error;

        return NextResponse.json({ scheduled_posts: data || [] });

    } catch (error: any) {
        console.error('Schedule GET Error:', error);
        logger.scheduler.error('Failed to fetch user scheduled posts', {
            error: error.message,
            stack: error.stack
        });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// DELETE: Cancel a scheduled post
export async function DELETE(request: NextRequest) {
    let postId = 'unknown';
    try {
        const user = await requireAuth(request);
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        if (id) postId = id;

        if (!id) {
            return NextResponse.json({ error: 'Missing post ID' }, { status: 400 });
        }

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL || '',
            process.env.SUPABASE_SERVICE_ROLE_KEY || '',
            { auth: { persistSession: false, autoRefreshToken: false } }
        );

        const { error } = await supabase
            .from('scheduled_posts')
            .delete()
            .eq('id', id)
            .eq('user_id', user.id)
            .eq('status', 'pending');

        if (error) throw error;

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Schedule DELETE Error:', error);
        logger.scheduler.error(`Failed to delete scheduled post ${postId}`, {
            error: error.message,
            stack: error.stack
        });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
