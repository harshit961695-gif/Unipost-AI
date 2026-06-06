export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { youtubeService } from '@/lib/services/youtube';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { notificationService } from '@/lib/services/notificationService';
import fs from 'fs';
import path from 'path';

export async function POST(request: Request) {
    const logFile = path.join(process.cwd(), 'youtube_debug.log');
    const log = (msg: string) => {
        console.log(msg);
        try { fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`); } catch (e) { }
    };

    log('\n=======================================');
    log('[BACKEND] ENTERING /api/publish/youtube');
    log('=======================================');
    let user = null;
    try {
        log('[BACKEND] Checking Supabase user session...');
        const supabase = createSupabaseServerClient();
        const authRes = await supabase.auth.getUser();
        user = authRes.data?.user;
        const authError = authRes.error;

        if (authError) {
            console.error('[BACKEND] Auth check returned an error:', authError);
        }

        if (!user) {
            log('[BACKEND] Unauthorized access attempt: No active session found.');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        log(`[BACKEND] Valid session found for User ID: ${user.id}`);

        const formData = await request.formData();
        log('[YOUTUBE PUBLISH] Received formData with keys: ' + Array.from(formData.keys()).join(', '));

        const title = formData.get('title') as string;
        const description = formData.get('description') as string;
        const privacyStatus = formData.get('privacy') as 'public' | 'unlisted' | 'private';
        const videoFile = formData.get('video') as File;
        const thumbnailFile = formData.get('thumbnail') as File | null;
        const type = formData.get('postType') as string;

        if (!videoFile || !title) {
            log('[YOUTUBE PUBLISH] Error: Missing required video or title fields');
            return NextResponse.json({ error: 'Missing required video or title fields' }, { status: 400 });
        }

        log(`[YOUTUBE PUBLISH] Parsed metadata - Title: "${title}", Privacy: ${privacyStatus}, Video Size: ${videoFile.size} bytes`);

        const videoBuffer = Buffer.from(await videoFile.arrayBuffer());
        let thumbnailBuffer: Buffer | undefined;

        // Only process thumbnail for long videos
        if (thumbnailFile && type === 'long_video') {
            thumbnailBuffer = Buffer.from(await thumbnailFile.arrayBuffer());
        }

        log(`[YOUTUBE PUBLISH] Dispatching to youtubeService. uploadVideo starting...`);

        const videoData = await youtubeService.uploadVideo(
            user.id,
            videoBuffer,
            videoFile.type || 'video/mp4',
            {
                title,
                description: description || '',
                privacyStatus: privacyStatus || 'private'
            },
            thumbnailBuffer,
            supabase  // ← pass authenticated client so RLS is satisfied when reading tokens
        );

        log(`[YOUTUBE PUBLISH] Upload complete. Video Data: ${JSON.stringify(videoData)}`);

        // Save to post_logs so analytics can find this video
        const ytVideoId = (videoData as any)?.id;
        if (ytVideoId) {
            try {
                await prisma.post_logs.create({
                    data: {
                        user_id: user.id,
                        platform: 'youtube',
                        platform_post_id: String(ytVideoId),
                        status: 'published',
                        content: title || '',
                    }
                });
                log(`[YT PUBLISH] Saved post_log with platform_post_id: ${ytVideoId}`);
            } catch (logErr: any) {
                log(`[YT PUBLISH] Failed to save post_log: ${logErr.message}`);
                logger.publish.error(`Failed to save post_log in database for YouTube publish`, {
                    userId: user.id,
                    ytVideoId,
                    error: logErr.message,
                    stack: logErr.stack
                });
            }

            // Save to posts table as well
            try {
                await prisma.posts.create({
                    data: {
                        user_id: user.id,
                        caption: title || '',
                        media_urls: [],
                        platforms: ['youtube'],
                        status: 'published',
                        published_at: new Date(),
                        youtube_video_id: String(ytVideoId),
                    }
                });
                log(`[YT PUBLISH] Saved posts record with youtube_video_id: ${ytVideoId}`);
            } catch (postErr: any) {
                log(`[YT PUBLISH] Failed to save posts record: ${postErr.message}`);
                logger.publish.error(`Failed to save posts record in database for YouTube publish`, {
                    userId: user.id,
                    ytVideoId,
                    error: postErr.message,
                    stack: postErr.stack
                });
            }

            // Trigger Success Notification
            await notificationService.createNotification(
                user.id,
                'publish_success',
                'Post Published Successfully',
                'Your Facebook/Instagram/YouTube post has been published successfully.',
                { ytVideoId: String(ytVideoId) }
            );
        }

        return NextResponse.json({ success: true, video: videoData });

    } catch (error: any) {
        log('\n[BACKEND] FATAL ERROR IN ROUTE:');
        log(error.stack || error.toString());
        if (error.response?.data) {
            log('[BACKEND] YouTube API Details: ' + JSON.stringify(error.response.data));
        }
        log('=======================================\n');
        logger.publish.error(`Failed to publish to YouTube for user ${user ? user.id : 'unknown'}`, {
            error: error.message,
            stack: error.stack,
            youtube_api_details: error.response?.data
        });
        if (user) {
            const errMsg = (error.message || '').toLowerCase();
            const isTokenExpired = errMsg.includes('token') || errMsg.includes('connect') || errMsg.includes('session') || errMsg.includes('auth') || errMsg.includes('grant');
            
            await notificationService.createNotification(
                user.id,
                'publish_failed_youtube',
                'Post Publishing Failed',
                'Publishing failed on YouTube.\nView logs for details.',
                { platform: 'youtube', error: error.message }
            );

            if (isTokenExpired) {
                await notificationService.createNotification(
                    user.id,
                    'account_expired_youtube',
                    'Reconnect YouTube',
                    'YouTube connection expired.\nReconnect your account.'
                );
            }
        }
        return NextResponse.json(
            { error: error.message || 'Failed to publish to YouTube' },
            { status: 500 }
        );
    }
}
