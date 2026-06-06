export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import prisma from '@/lib/prisma';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
    let user = null;
    try {
        user = await requireAuth(request);
    } catch (authErr) {
        if (process.env.BYPASS_AUTH_FOR_TESTING === 'true') {
            console.warn('[AUDIT API] Bypassing authentication for testing');
        } else {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }
    }

    try {
        console.log('[AUDIT] Starting database audit...');

        // Fetch posts and post logs from Prisma (Neon)
        const posts = await prisma.posts.findMany();
        const postLogs = await prisma.post_logs.findMany();

        // 1. Successful posts with missing platform IDs
        // Successful post means status === 'published'.
        // Missing platform ID means platforms list contains a platform, but the corresponding ID column in posts is null or empty.
        const missingPlatformIdsList: any[] = [];
        posts.forEach(post => {
            if (post.status !== 'published') return;
            const platforms = post.platforms || [];
            let isMissing = false;
            const missingFrom: string[] = [];

            if (platforms.includes('facebook') && !post.facebook_post_id) {
                isMissing = true;
                missingFrom.push('facebook');
            }
            if (platforms.includes('youtube') && !post.youtube_video_id) {
                isMissing = true;
                missingFrom.push('youtube');
            }
            if (platforms.includes('instagram') && !post.instagram_media_id) {
                isMissing = true;
                missingFrom.push('instagram');
            }

            if (isMissing) {
                missingPlatformIdsList.push({
                    id: post.id,
                    user_id: post.user_id,
                    caption: post.caption,
                    platforms: post.platforms,
                    missingFrom,
                    created_at: post.created_at
                });
            }
        });

        // 2. Analytics fetch failures
        // Defined as post_logs with status success/published where fetched_at is null
        // or fetched_at is not null but views, likes, and comments are all 0 (indicates historical failure overwritten to 0).
        const analyticsFetchFailuresList: any[] = [];
        postLogs.forEach(log => {
            const status = log.status?.trim().toLowerCase();
            if (status !== 'published' && status !== 'success') return;

            const isZeroMetrics = log.views === 0 && log.likes === 0 && log.comments === 0 && log.reach === 0 && log.impressions === 0;
            const isFailure = log.fetched_at === null || isZeroMetrics;

            if (isFailure) {
                analyticsFetchFailuresList.push({
                    id: log.id,
                    user_id: log.user_id,
                    platform: log.platform,
                    platform_post_id: log.platform_post_id,
                    fetched_at: log.fetched_at,
                    is_never_fetched: log.fetched_at === null,
                    is_zero_metrics: isZeroMetrics,
                    created_at: log.created_at
                });
            }
        });

        // 3. Orphan post logs
        // Post logs whose platform_post_id does not match any record in the posts table
        const fbPostIds = new Set(posts.map(p => p.facebook_post_id).filter(Boolean));
        const ytVideoIds = new Set(posts.map(p => p.youtube_video_id).filter(Boolean));
        const igMediaIds = new Set(posts.map(p => p.instagram_media_id).filter(Boolean));

        const orphanPostLogsList: any[] = [];
        postLogs.forEach(log => {
            const platform = log.platform?.trim().toLowerCase();
            const pid = log.platform_post_id;
            if (!pid) return;

            let isOrphan = false;
            if (platform === 'facebook') {
                if (!fbPostIds.has(pid)) isOrphan = true;
            } else if (platform === 'youtube') {
                if (!ytVideoIds.has(pid)) isOrphan = true;
            } else if (platform === 'instagram') {
                if (!igMediaIds.has(pid)) isOrphan = true;
            } else {
                // If it is any other platform, check all of them
                if (!fbPostIds.has(pid) && !ytVideoIds.has(pid) && !igMediaIds.has(pid)) {
                    isOrphan = true;
                }
            }

            if (isOrphan) {
                orphanPostLogsList.push({
                    id: log.id,
                    user_id: log.user_id,
                    platform: log.platform,
                    platform_post_id: log.platform_post_id,
                    created_at: log.created_at
                });
            }
        });

        return NextResponse.json({
            success: true,
            counts: {
                missingPlatformIds: missingPlatformIdsList.length,
                analyticsFetchFailures: analyticsFetchFailuresList.length,
                orphanPostLogs: orphanPostLogsList.length
            },
            details: {
                missingPlatformIds: missingPlatformIdsList,
                analyticsFetchFailures: analyticsFetchFailuresList,
                orphanPostLogs: orphanPostLogsList
            }
        });

    } catch (error: any) {
        console.error('[AUDIT ERROR]', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
