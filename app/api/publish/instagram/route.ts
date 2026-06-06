export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import { instagramService } from '@/lib/services/instagram';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import prisma from '@/lib/prisma';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
    let user: any;
    try {
        user = await requireAuth(request);
        const formData = await request.formData();

        const mediaFile = formData.get('media') as File;
        const caption = (formData.get('caption') as string) || '';
        const type = formData.get('type') as 'reel' | 'post' | 'story';

        if (!mediaFile || !type) {
            return NextResponse.json({ error: 'Missing media or type' }, { status: 400 });
        }

        // 1. Get Instagram Credentials
        const supabase = createSupabaseServerClient();
        const { instagramId, accessToken } = await instagramService.getInstagramAccountId(user.id, supabase);

        // 2. Upload file temporarily to Supabase Storage to get a Public URL
        // Meta Graph API requires public URLs for media
        const fileExt = mediaFile.name.split('.').pop();
        const fileName = `${user.id}_${Date.now()}.${fileExt}`;
        const filePath = `temp/${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('instagram_media') // IMPORTANT: User must create a public bucket named "instagram_media"
            .upload(filePath, mediaFile);

        if (uploadError) {
            console.error('Supabase Storage Error:', uploadError);
            throw new Error(`Failed to upload media to storage: ${uploadError.message}`);
        }

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
            .from('instagram_media')
            .getPublicUrl(filePath);

        // 3. Publish to Instagram
        let responseObj;
        try {
            const isVideo = mediaFile.type.startsWith('video') || ['.mp4', '.mov'].some(ext => mediaFile.name.toLowerCase().endsWith(ext));
            if (type === 'story') {
                const storyMediaType = isVideo ? 'VIDEO' : 'IMAGE';
                responseObj = await instagramService.publishStory(instagramId, accessToken, publicUrl, storyMediaType);
            } else {
                const mediaType = (type === 'reel' || isVideo) ? 'REELS' : 'IMAGE';
                responseObj = await instagramService.publishMedia(instagramId, accessToken, publicUrl, caption, mediaType);
            }
        } catch (igError: any) {
            // Clean up temp file on failure
            await supabase.storage.from('instagram_media').remove([filePath]);
            throw igError;
        }

        const creationId = responseObj?.id;

        // Save to post_logs so analytics can track this Instagram post
        if (creationId) {
            try {
                await prisma.post_logs.create({
                    data: {
                        user_id: user.id,
                        platform: 'instagram',
                        platform_post_id: String(creationId),
                        status: 'published',
                        content: caption || '',
                    }
                });
                console.log(`[IG PUBLISH] Saved post_log with platform_post_id: ${creationId}`);
            } catch (logErr: any) {
                console.error(`[IG PUBLISH] Failed to save post_log:`, logErr.message);
            }
        }

        // 4. Clean up temp file on success
        await supabase.storage.from('instagram_media').remove([filePath]);

        return NextResponse.json({ success: true, creationId });

    } catch (error: any) {
        console.error('Instagram Publish Error:', error);

        let errorMessage = error.message || 'Failed to publish to Instagram';

        // Check if our service threw the structured APP_DELETED JSON error
        try {
            const parsedError = JSON.parse(errorMessage);
            if (parsedError.type === 'APP_DELETED') {
                try {
                    const supabase = createSupabaseServerClient();

                    console.log(`[INSTAGRAM PUBLISH] App deleted detected. Dropping legacy DB connections for user ${user.id}`);

                    // Clean up bad connections immediately so they don't persist in Settings
                    await supabase.from('connected_accounts').delete().eq('user_id', user.id).eq('platform', 'instagram');
                    await supabase.from('connected_accounts').delete().eq('user_id', user.id).eq('platform', 'facebook');

                } catch (dbError) {
                    console.error('[INSTAGRAM PUBLISH] Failed to drop deleted DB app tokens', dbError);
                }

                // Return exact failure response requested
                return NextResponse.json({
                    success: false,
                    error: parsedError.message
                }, { status: 400 });
            }
        } catch (e) {
            // Not JSON or parse failed, continue to standard error formatting below
        }

        return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
    }
}
