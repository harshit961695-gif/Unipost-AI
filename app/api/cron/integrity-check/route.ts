export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { notificationService } from '@/lib/services/notificationService';

export const runtime = 'nodejs';

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
    return handleCheck(request);
}

export async function POST(request: NextRequest) {
    return handleCheck(request);
}

async function handleCheck(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        const isDevBypass = process.env.BYPASS_AUTH_FOR_TESTING === 'true';

        if (!isDevBypass || authHeader) {
            if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
                logger.integrity.warn('Unauthorized access attempt to integrity check cron endpoint');
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }
        }

        logger.integrity.info('Starting scheduled database integrity check...');

        const posts = await prisma.posts.findMany();
        const postLogs = await prisma.post_logs.findMany();

        // 1. Successful posts with missing platform IDs
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
                    platforms: post.platforms,
                    missingFrom,
                    created_at: post.created_at
                });
            }
        });

        // 2. Orphan post logs
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

        const report = {
            timestamp: new Date().toISOString(),
            status: (missingPlatformIdsList.length === 0 && orphanPostLogsList.length === 0) ? 'PASS' : 'FAIL',
            counts: {
                missingPlatformIds: missingPlatformIdsList.length,
                orphanPostLogs: orphanPostLogsList.length,
            },
            details: {
                missingPlatformIds: missingPlatformIdsList,
                orphanPostLogs: orphanPostLogsList
            }
        };

        if (report.status === 'PASS') {
            logger.integrity.info('Database integrity check passed. No anomalies found.', report.counts);
        } else {
            logger.integrity.warn('Database integrity check failed. Anomalies detected!', report);

            // Trigger System Integrity Alert notifications
            const affectedUserIds = new Set<string>();
            missingPlatformIdsList.forEach(item => affectedUserIds.add(item.user_id));
            orphanPostLogsList.forEach(item => affectedUserIds.add(item.user_id));

            for (const userId of affectedUserIds) {
                await notificationService.createNotification(
                    userId,
                    'daily_integrity_failed',
                    'System Integrity Alert',
                    'An issue was detected and requires review.',
                    { timestamp: new Date().toISOString() }
                );
            }
        }

        return NextResponse.json({ success: true, report });

    } catch (error: any) {
        logger.integrity.error('Fatal error during database integrity check', { error: error.message, stack: error.stack });
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
