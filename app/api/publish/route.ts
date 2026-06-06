export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { connectionService } from '@/lib/services/connectionService';
import { instagramService } from '@/lib/services/instagram';
import { youtubeService } from '@/lib/services/youtube';
import { syncPostAnalytics } from '@/lib/services/analyticsService';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { notificationService } from '@/lib/services/notificationService';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
    try {
        const user = await requireAuth(request);
        const supabase = process.env.BYPASS_AUTH_FOR_TESTING === 'true'
            ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
            : createSupabaseServerClient();
        const formData = await request.formData();

        const metadataStr = formData.get('metadata') as string;
        if (!metadataStr) {
            return NextResponse.json({ error: 'Missing metadata' }, { status: 400 });
        }

        let metadata: any;
        try {
            metadata = JSON.parse(metadataStr);
        } catch (e) {
            return NextResponse.json({ error: 'Invalid metadata format' }, { status: 400 });
        }

        const platforms = Object.keys(metadata).filter(p => metadata[p].enabled);
        if (platforms.length === 0) {
            return NextResponse.json({ error: 'No platforms selected' }, { status: 400 });
        }

        // Create a posts record for this publish
        console.log(`[PUBLISH API] Creating posts record for user ${user.id}`);
        let postData;
        try {
            postData = await prisma.posts.create({
                data: {
                    user_id: user.id,
                    caption: metadata[platforms[0]]?.caption || '',
                    media_urls: [],
                    platforms: platforms,
                    status: 'draft',
                    published_at: null,
                }
            });
            console.log(`[PUBLISH API] Created post record with ID: ${postData.id} via Prisma as draft`);
        } catch (prismaErr: any) {
            console.error(`[PUBLISH API] Failed to create post record:`, prismaErr.message);
            logger.publish.error(`Failed to create post record in database for user ${user.id}`, {
                error: prismaErr.message,
                stack: prismaErr.stack
            });
            return NextResponse.json({ error: 'Failed to create post record' }, { status: 500 });
        }

        const postId = postData.id;

        const results: Record<string, 'success' | 'failure'> = {};
        const errors: Record<string, string> = {};
        const platformPostIds: Record<string, string | null> = {
            facebook: null,
            instagram: null,
            youtube: null,
        };

        // Process each platform in parallel
        const promises = platforms.map(async (platform) => {
            let status: 'success' | 'failure' = 'failure';
            let errorMessage = '';
            let tempImagePath = '';
            let platformPostId = null;

            try {
                const config = metadata[platform];

                if (platform === 'facebook') {
                    const media = formData.get('media_facebook') as File | null;
                    console.log(`[Publish API] Facebook Media Received: ${media ? `Yes (${media.name}, ${media.size} bytes)` : 'No'}`);
                    if (!media && config.type !== 'post') {
                        throw new Error('Media file is required for Facebook');
                    }

                    const { data: connection, error: connectionError } = await connectionService.getConnection(user.id, 'facebook', supabase);
                    if (connectionError || !connection) throw new Error('Facebook account not connected');
                    console.log(`[CONNECTED ACCOUNT] user_id: ${user.id}, platform: facebook, has_token: ${!!connection.access_token}, has_page_id: ${!!(connection.metadata?.page_id || connection.page_id)}`);

                    // page_id is stored inside metadata JSONB, NOT as a top-level column
                    const pageId = connection.metadata?.page_id || connection.page_id;
                    const pageAccessToken = connection.access_token;
                    if (!pageId || !pageAccessToken) throw new Error('Incomplete Facebook connection data');

                    const isVideo = media?.type.startsWith('video');
                    const fbUrl = isVideo
                        ? `https://graph.facebook.com/v25.0/${pageId}/videos`
                        : `https://graph.facebook.com/v25.0/${pageId}/photos`;

                    const fbFormData = new FormData();
                    fbFormData.append('access_token', pageAccessToken);
                    if (config.caption) {
                        fbFormData.append(isVideo ? 'description' : 'caption', config.caption);
                    }
                    if (media) {
                        fbFormData.append('source', media);
                    }

                    const fbRes = await fetch(fbUrl, { method: "POST", body: fbFormData });
                    const fbData = await fbRes.json();
                    console.log(`[FB PUBLISH] Raw API response:`, JSON.stringify(fbData));
                    if (!fbRes.ok) throw new Error(fbData.error?.message || 'Facebook API error');

                    // Capture Post ID — prefer post_id (compound pageId_photoId) for photos,
                    // because that's the ID the Graph API can query for engagement metrics.
                    // For feed/video posts, fbData.id is the post ID.
                    // post_id is returned by /photos and /videos endpoints.
                    platformPostId = fbData.post_id || fbData.id || null;
                    if (platformPostId) platformPostId = String(platformPostId);
                    console.log(`[FB PUBLISH] Saved facebook post ID: ${platformPostId}`);
                    status = 'success';

                } else if (platform === 'instagram') {
                    const media = formData.get('media_instagram') as File | null;
                    console.log(`[Publish API] Instagram Media Received: ${media ? `Yes (${media.name}, ${media.size} bytes)` : 'No'}`);
                    if (!media) throw new Error('Media file is required for Instagram');

                    const { data: connection, error: connectionError } = await connectionService.getConnection(user.id, 'instagram', supabase);
                    if (connectionError || !connection) throw new Error('Instagram account not connected');
                    console.log(`[CONNECTED ACCOUNT] user_id: ${user.id}, platform: instagram, has_token: ${!!connection.access_token}, has_ig_id: ${!!connection.instagram_business_id}`);

                    const instagramId = connection.instagram_business_id;
                    const accessToken = connection.access_token;
                    if (!instagramId || !accessToken) throw new Error('Incomplete Instagram connection data');

                    // Temporary upload to Supabase for IG URL
                    const fileExt = media.name.split('.').pop() || 'tmp';
                    const fileName = `${user.id}_ig_${Date.now()}.${fileExt}`;
                    tempImagePath = `temp/${fileName}`;

                    const { error: uploadError } = await supabase.storage
                        .from('instagram_media')
                        .upload(tempImagePath, media);

                    if (uploadError) throw new Error(`Failed to upload temporary media: ${uploadError.message}`);

                    const { data: { publicUrl } } = supabase.storage
                        .from('instagram_media')
                        .getPublicUrl(tempImagePath);

                    let igResponseMap;
                    const isVideo = media.type.startsWith('video') || ['.mp4', '.mov'].some(ext => media.name.toLowerCase().endsWith(ext));
                    if (config.type === 'story') {
                        const storyMediaType = isVideo ? 'VIDEO' : 'IMAGE';
                        igResponseMap = await instagramService.publishStory(instagramId, accessToken, publicUrl, storyMediaType);
                    } else {
                        const mediaType = (config.type === 'reel' || isVideo) ? 'REELS' : 'IMAGE';
                        igResponseMap = await instagramService.publishMedia(instagramId, accessToken, publicUrl, config.caption || '', mediaType);
                    }
                    console.log(`[IG PUBLISH] Raw service response:`, JSON.stringify(igResponseMap));
                    platformPostId = igResponseMap?.id ? String(igResponseMap.id) : null;
                    console.log(`[IG PUBLISH] Saved instagram post ID: ${platformPostId}`);
                    status = 'success';

                } else if (platform === 'youtube') {
                    const media = formData.get('media_youtube') as File | null;
                    const thumbnail = formData.get('thumbnail_youtube') as File | null;
                    console.log(`[Publish API] YouTube Media Received: ${media ? `Yes (${media.name}, ${media.size} bytes)` : 'No'}`);
                    console.log(`[Publish API] YouTube Thumbnail Received: ${thumbnail ? `Yes (${thumbnail.name}, ${thumbnail.size} bytes)` : 'No'}`);

                    if (!media || !media.type.startsWith('video')) {
                        throw new Error('YouTube requires a video file');
                    }

                    const mediaBuffer = Buffer.from(await media.arrayBuffer());
                    let thumbnailBuffer: Buffer | undefined;

                    if (thumbnail) {
                        thumbnailBuffer = Buffer.from(await thumbnail.arrayBuffer());
                    }

                    const ytResponse: any = await youtubeService.uploadVideo(
                        user.id,
                        mediaBuffer,
                        media.type || 'video/mp4',
                        {
                            title: config.title || 'New Video',
                            description: config.description || '',
                            privacyStatus: config.privacy || 'private'
                        },
                        thumbnailBuffer,
                        supabase
                    );

                    console.log(`[YT PUBLISH] Raw service response keys:`, Object.keys(ytResponse || {}));
                    // uploadVideo returns videoResponse.data (the API body), so .id is the video ID directly
                    platformPostId = ytResponse?.id ? String(ytResponse.id) : null;
                    console.log(`[YT PUBLISH] Saved youtube video ID: ${platformPostId}`);
                    status = 'success';

                } else {
                    throw new Error(`Unsupported platform: ${platform}`);
                }
            } catch (err: any) {
                status = 'failure';
                errorMessage = err.message || `Failed to publish to ${platform}`;
                errors[platform] = errorMessage;
                logger.publish.error(`Failed to publish to ${platform} for user ${user.id}`, {
                    postId,
                    error: errorMessage,
                    stack: err.stack,
                    caption: metadata[platform]?.caption || ''
                });
            }

            results[platform] = status;
            if (status === 'success') {
                platformPostIds[platform] = platformPostId;
            }

            // Log to database (Prisma/Neon — sole owner of post_logs)
            const logStatus = status === 'success' ? 'published' : 'failed';
            try {
                const prismaLog = await prisma.post_logs.create({
                    data: {
                        user_id: user.id,
                        platform,
                        status: logStatus,
                        platform_post_id: platformPostId || '',
                        content: logStatus === 'published' ? (metadata[platform]?.caption || null) : (errorMessage || 'Publishing Failed'),
                    }
                });
                console.log(`[POST LOG CREATED] (Prisma) user_id: ${user.id}, platform: ${platform}, platform_post_id: ${platformPostId || ''}, content: ${metadata[platform]?.caption || ''}, status: ${logStatus}, created_at: ${prismaLog.created_at}`);
            } catch (dbErr) {
                console.error(`[PUBLISH API] Failed to log publish status for ${platform}:`, dbErr);
            }

            // Cleanup temp IG image if used
            if (tempImagePath) {
                await supabase.storage.from('instagram_media').remove([tempImagePath]).catch(() => { });
            }
        });

        await Promise.allSettled(promises);

        // Update posts record with platform IDs, successful platforms, and status
        const platformIdUpdates: Record<string, string | null> = {};
        if (platformPostIds.facebook) platformIdUpdates.facebook_post_id = platformPostIds.facebook;
        if (platformPostIds.instagram) platformIdUpdates.instagram_media_id = platformPostIds.instagram;
        if (platformPostIds.youtube) platformIdUpdates.youtube_video_id = platformPostIds.youtube;

        const successfulPlatforms = platforms.filter(p => results[p] === 'success');
        const finalStatus = successfulPlatforms.length > 0 ? 'published' : 'failed';

        console.log(`[PUBLISH API] Updating post ${postId} in Prisma with status: ${finalStatus}, successful platforms:`, successfulPlatforms);

        try {
            await prisma.posts.update({
                where: { id: postId },
                data: {
                    ...platformIdUpdates,
                    platforms: successfulPlatforms.length > 0 ? successfulPlatforms : platforms,
                    status: finalStatus,
                    published_at: successfulPlatforms.length > 0 ? new Date() : null
                }
            });
            console.log(`[PUBLISH API] Updated post ${postId} in Prisma with status and platform IDs`);
        } catch (prismaErr: any) {
            console.error(`[PUBLISH API] Failed to update post with platform IDs/status:`, prismaErr.message);
            logger.publish.error(`Failed to update post status in database for post ${postId}`, {
                error: prismaErr.message,
                stack: prismaErr.stack
            });
        }

        // Trigger Notifications
        if (successfulPlatforms.length > 0) {
            await notificationService.createNotification(
                user.id,
                'publish_success',
                'Post Published Successfully',
                'Your Facebook/Instagram/YouTube post has been published successfully.',
                { postId }
            );
        }

        for (const platform of platforms) {
            if (results[platform] === 'failure') {
                const platformName = platform.charAt(0).toUpperCase() + platform.slice(1);
                await notificationService.createNotification(
                    user.id,
                    `publish_failed_${platform}`,
                    'Post Publishing Failed',
                    `Publishing failed on ${platformName}.\nView logs for details.`,
                    { platform, postId, error: errors[platform] }
                );

                const errMsg = (errors[platform] || '').toLowerCase();
                const isTokenExpired = errMsg.includes('token') || errMsg.includes('connect') || errMsg.includes('session') || errMsg.includes('auth');
                if (isTokenExpired) {
                    await notificationService.createNotification(
                        user.id,
                        `account_expired_${platform}`,
                        `Reconnect ${platformName}`,
                        `${platformName} connection expired.\nReconnect your account.`
                    );
                }
            }
        }

        // Call syncPostAnalytics for successful publishes
        if (Object.values(results).some(r => r === 'success')) {
            console.log(`[PUBLISH API] Calling syncPostAnalytics for post ${postId}`);
            try {
                // Filter out null values from platformPostIds
                const cleanPlatformIds: Record<string, string> = {}
                Object.entries(platformPostIds).forEach(([k, v]) => {
                    if (v) cleanPlatformIds[k] = v
                })

                const syncResult = await syncPostAnalytics(
                    supabase,
                    postId,
                    user.id,
                    platforms.filter(p => results[p] === 'success'),
                    cleanPlatformIds
                );
                console.log(`[PUBLISH API] syncPostAnalytics result:`, syncResult);
            } catch (syncErr: any) {
                console.error('[PUBLISH API] Error calling syncPostAnalytics:', syncErr);
                // Don't fail the publish if analytics sync fails - it's a non-critical operation
            }
        }

        return NextResponse.json({ success: true, results, errors, postId });
    } catch (error: any) {
        console.error('Unified Publish Error:', error);
        logger.publish.error('Fatal error in unified publish route handler', {
            error: error.message,
            stack: error.stack
        });
        return NextResponse.json(
            { error: error.message || 'Failed to publish' },
            { status: 500 }
        );
    }
}
