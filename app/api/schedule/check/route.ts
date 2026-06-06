export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { connectionService } from '@/lib/services/connectionService';
import { instagramService } from '@/lib/services/instagram';
import { youtubeService } from '@/lib/services/youtube';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { notificationService } from '@/lib/services/notificationService';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET;
        const isDevBypass = process.env.BYPASS_AUTH_FOR_TESTING === 'true';

        if (!isDevBypass || authHeader) {
            if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }
        }

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL || '',
            process.env.SUPABASE_SERVICE_ROLE_KEY || '',
            { auth: { persistSession: false, autoRefreshToken: false } }
        );

        // Find all pending posts whose time has come
        const now = new Date().toISOString();
        const { data: pendingPosts, error: fetchError } = await supabase
            .from('scheduled_posts')
            .select('*')
            .eq('status', 'pending')
            .lte('scheduled_at', now);

        if (fetchError) throw fetchError;

        if (!pendingPosts || pendingPosts.length === 0) {
            return NextResponse.json({ message: 'No pending scheduled posts', processed: 0 });
        }

        console.log(`[SCHEDULE CRON] Found ${pendingPosts.length} posts to publish`);

        let processed = 0;

        for (const scheduledPost of pendingPosts) {
            // Atomic lock check: Claim the scheduled post only if it's still 'pending'
            const { data: claimedPost, error: claimError } = await supabase
                .from('scheduled_posts')
                .update({ status: 'publishing' })
                .eq('id', scheduledPost.id)
                .eq('status', 'pending')
                .select();

            if (claimError || !claimedPost || claimedPost.length === 0) {
                console.log(`[SCHEDULE CRON] Skipping post ${scheduledPost.id} - already claimed/publishing by another worker.`);
                continue;
            }

            const platformConfigs = scheduledPost.platforms;
            const enabledPlatforms = Object.keys(platformConfigs).filter(p => platformConfigs[p]?.enabled);
            const results: Record<string, string> = {};
            const errors: Record<string, string> = {};
            const platformPostIds: Record<string, string> = {};

            // Use a server client for DB operations needing RLS context
            const dbClient = createSupabaseServerClient();

            for (const platform of enabledPlatforms) {
                const config = platformConfigs[platform];
                let status = 'failure';
                let platformPostId = null;

                try {
                    if (platform === 'facebook') {
                        const { data: connection, error: connErr } = await connectionService.getConnection(scheduledPost.user_id, 'facebook', supabase);
                        if (connErr || !connection) throw new Error('Facebook not connected');

                        // page_id is stored inside metadata JSONB, NOT as a top-level column
                        const pageId = connection.metadata?.page_id || connection.page_id;
                        const pageAccessToken = connection.access_token;
                        if (!pageId || !pageAccessToken) throw new Error('Incomplete FB connection');

                        const mediaUrl = scheduledPost.media_urls?.facebook;
                        let fbRes;

                        if (mediaUrl) {
                            // If it's a video file, upload using /videos. Otherwise use /photos.
                            const isVideo = mediaUrl.toLowerCase().match(/\.(mp4|mov|avi|mkv|webm)/) || config.type === 'reel';
                            if (isVideo) {
                                const fbUrl = `https://graph.facebook.com/v25.0/${pageId}/videos`;
                                const params = new URLSearchParams({
                                    file_url: mediaUrl,
                                    description: config.caption || '',
                                    access_token: pageAccessToken
                                });
                                fbRes = await fetch(fbUrl, { method: 'POST', body: params });
                            } else {
                                const fbUrl = `https://graph.facebook.com/v25.0/${pageId}/photos`;
                                const params = new URLSearchParams({
                                    url: mediaUrl,
                                    caption: config.caption || '',
                                    access_token: pageAccessToken
                                });
                                fbRes = await fetch(fbUrl, { method: 'POST', body: params });
                            }
                        } else {
                            const fbUrl = `https://graph.facebook.com/v25.0/${pageId}/feed`;
                            const params = new URLSearchParams({
                                message: config.caption || '',
                                access_token: pageAccessToken
                            });
                            fbRes = await fetch(fbUrl, { method: 'POST', body: params });
                        }

                        const fbData = await fbRes.json();
                        console.log(`[SCHEDULE CRON] FB raw response:`, JSON.stringify(fbData));
                        if (!fbRes.ok) throw new Error(fbData.error?.message || 'FB API error');

                        // Prefer post_id (compound pageId_postId) — queryable for engagement
                        platformPostId = String(fbData.post_id || fbData.id || '');
                        console.log(`[SCHEDULE CRON] Saved facebook post ID: ${platformPostId}`);
                        status = 'success';

                    } else if (platform === 'instagram') {
                        // Instagram requires media - skip if no media URL provided
                        const mediaUrl = scheduledPost.media_urls?.instagram;
                        if (!mediaUrl) throw new Error('Instagram requires media for scheduled posts');

                        const { data: connection, error: connErr } = await connectionService.getConnection(scheduledPost.user_id, 'instagram', supabase);
                        if (connErr || !connection) throw new Error('Instagram not connected');

                        // instagram_business_id is stored inside metadata JSONB, NOT as a top-level column
                        const instagramId = connection.metadata?.instagram_business_id || connection.instagram_business_id;
                        const accessToken = connection.access_token;
                        if (!instagramId || !accessToken) throw new Error('Incomplete IG connection');

                        const isVideo = mediaUrl.toLowerCase().match(/\.(mp4|mov|avi|mkv|webm)/) || config.type === 'reel';
                        const mediaType = isVideo ? 'REELS' : 'IMAGE';
                        const igResponse = await instagramService.publishMedia(instagramId, accessToken, mediaUrl, config.caption || '', mediaType);
                        platformPostId = igResponse?.id || null;
                        status = 'success';

                    } else if (platform === 'youtube') {
                        const mediaUrl = scheduledPost.media_urls?.youtube;
                        if (!mediaUrl) throw new Error('YouTube scheduled posting requires media URL');

                        console.log(`[SCHEDULE CRON] Fetching video from: ${mediaUrl}`);
                        const response = await fetch(mediaUrl);
                        if (!response.ok) throw new Error(`Failed to fetch scheduled video from ${mediaUrl}`);
                        const mediaBuffer = Buffer.from(await response.arrayBuffer());
                        const mimeType = response.headers.get('content-type') || 'video/mp4';

                        const thumbnail = scheduledPost.media_urls?.youtube_thumbnail;
                        let thumbnailBuffer: Buffer | undefined;
                        if (thumbnail) {
                            console.log(`[SCHEDULE CRON] Fetching thumbnail from: ${thumbnail}`);
                            const thumbRes = await fetch(thumbnail);
                            if (thumbRes.ok) {
                                thumbnailBuffer = Buffer.from(await thumbRes.arrayBuffer());
                            }
                        }

                        const ytResponse = await youtubeService.uploadVideo(
                            scheduledPost.user_id,
                            mediaBuffer,
                            mimeType,
                            {
                                title: config.title || 'Scheduled Video',
                                description: config.description || '',
                                privacyStatus: (config.privacy as 'public' | 'unlisted' | 'private') || 'private'
                            },
                            thumbnailBuffer,
                            supabase
                        );
                        platformPostId = ytResponse?.id || null;
                        status = 'success';
                    }
                } catch (err: any) {
                    status = 'failure';
                    errors[platform] = err.message;
                    console.error(`[SCHEDULE CRON] ${platform} failed for post ${scheduledPost.id}:`, err.message);
                    logger.scheduler.error(`Failed to publish scheduled post ${scheduledPost.id} on platform ${platform}`, {
                        postId: scheduledPost.id,
                        userId: scheduledPost.user_id,
                        platform,
                        error: err.message,
                        stack: err.stack
                    });
                }

                results[platform] = status;
                if (status === 'success' && platformPostId) {
                    platformPostIds[platform] = String(platformPostId);
                }

                // Log to post_logs
                try {
                    const logStatus = status === 'success' ? 'published' : 'failed';
                    // Write to Neon (Prisma) as source of truth
                    try {
                        await prisma.post_logs.create({
                            data: {
                                user_id: scheduledPost.user_id,
                                platform,
                                status: logStatus,
                                platform_post_id: platformPostId || '',
                                content: logStatus === 'published' ? (config.caption || config.title || config.description || null) : (errors[platform] || 'Scheduled Post Failed'),
                            }
                        });
                        console.log(`[SCHEDULE CRON] Logged post to Neon: ${platform}, status: ${logStatus}`);
                    } catch (prismaErr: any) {
                        console.error(`[SCHEDULE CRON] Prisma post_logs insert failed:`, prismaErr.message);
                    }
                } catch (logErr) {
                    console.error(`[SCHEDULE CRON] Failed to log post for ${platform}:`, logErr);
                }
            }

            // Upsert post in Neon posts table
            const successfulPlatforms = enabledPlatforms.filter(p => results[p] === 'success');
            if (successfulPlatforms.length > 0) {
                try {
                    // Find first caption or title or description to use as caption
                    let caption = '';
                    for (const platform of enabledPlatforms) {
                        const config = platformConfigs[platform];
                        const cap = config?.caption || config?.title || config?.description;
                        if (cap) {
                            caption = cap;
                            break;
                        }
                    }

                    const mediaUrls: string[] = [];
                    if (scheduledPost.media_urls) {
                        Object.entries(scheduledPost.media_urls).forEach(([key, val]) => {
                            if (val && typeof val === 'string' && !key.endsWith('_thumbnail')) {
                                mediaUrls.push(val);
                            }
                        });
                    }

                    await prisma.posts.upsert({
                        where: { id: scheduledPost.id },
                        create: {
                            id: scheduledPost.id,
                            user_id: scheduledPost.user_id,
                            caption: caption,
                            media_urls: mediaUrls,
                            platforms: successfulPlatforms,
                            status: 'published',
                            published_at: new Date(),
                            scheduled_at: new Date(scheduledPost.scheduled_at),
                            facebook_post_id: platformPostIds.facebook || null,
                            instagram_media_id: platformPostIds.instagram || null,
                            youtube_video_id: platformPostIds.youtube || null,
                        },
                        update: {
                            status: 'published',
                            published_at: new Date(),
                            platforms: successfulPlatforms,
                            facebook_post_id: platformPostIds.facebook || null,
                            instagram_media_id: platformPostIds.instagram || null,
                            youtube_video_id: platformPostIds.youtube || null,
                        }
                    });
                    console.log(`[SCHEDULE CRON] Upserted post record in Neon posts table for post ${scheduledPost.id}`);
                } catch (postErr: any) {
                    console.error(`[SCHEDULE CRON] Failed to upsert post record in Neon:`, postErr.message);
                    logger.scheduler.error(`Failed to upsert posts record for scheduled post ${scheduledPost.id}`, {
                        error: postErr.message,
                        stack: postErr.stack
                    });
                }
            } else {
                // If all platforms failed, upsert post as status 'failed' to comply with constraints
                try {
                    await prisma.posts.upsert({
                        where: { id: scheduledPost.id },
                        create: {
                            id: scheduledPost.id,
                            user_id: scheduledPost.user_id,
                            caption: scheduledPost.platforms[enabledPlatforms[0]]?.caption || '',
                            media_urls: [],
                            platforms: enabledPlatforms,
                            status: 'failed',
                            scheduled_at: new Date(scheduledPost.scheduled_at),
                        },
                        update: {
                            status: 'failed'
                        }
                    });
                } catch (postErr: any) {
                    console.error(`[SCHEDULE CRON] Failed to upsert failed post record in Neon:`, postErr.message);
                }
            }

            // Determine overall status
            const allSuccess = Object.values(results).every(r => r === 'success');
            const allFailed = Object.values(results).every(r => r === 'failure');
            const finalStatus = allSuccess ? 'completed' : allFailed ? 'failed' : 'completed';

            await supabase
                .from('scheduled_posts')
                .update({
                    status: finalStatus,
                    results,
                    error_message: Object.keys(errors).length > 0 ? JSON.stringify(errors) : null
                })
                .eq('id', scheduledPost.id);

            // Trigger Notifications
            if (finalStatus === 'completed') {
                await notificationService.createNotification(
                    scheduledPost.user_id,
                    'scheduled_publish_success',
                    'Scheduled Post Published',
                    'Your scheduled post was published successfully.',
                    { scheduledPostId: scheduledPost.id }
                );
            } else {
                await notificationService.createNotification(
                    scheduledPost.user_id,
                    'scheduled_publish_failed',
                    'Scheduled Post Failed',
                    'Scheduled post failed. Check logs for details.',
                    { scheduledPostId: scheduledPost.id }
                );

                for (const platform of Object.keys(errors)) {
                    const errMsg = (errors[platform] || '').toLowerCase();
                    const isTokenExpired = errMsg.includes('token') || errMsg.includes('connect') || errMsg.includes('session') || errMsg.includes('auth') || errMsg.includes('grant');
                    if (isTokenExpired) {
                        const platformName = platform.charAt(0).toUpperCase() + platform.slice(1);
                        await notificationService.createNotification(
                            scheduledPost.user_id,
                            `account_expired_${platform}`,
                            `Reconnect ${platformName}`,
                            `${platformName} connection expired.\nReconnect your account.`
                        );
                    }
                }
            }

            processed++;
            console.log(`[SCHEDULE CRON] Post ${scheduledPost.id} processed: ${finalStatus}`);
        }

        return NextResponse.json({ message: `Processed ${processed} scheduled posts`, processed });

    } catch (error: any) {
        console.error('Schedule Check Error:', error);
        logger.scheduler.error('Fatal error in scheduled check cron route', {
            error: error.message,
            stack: error.stack
        });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
