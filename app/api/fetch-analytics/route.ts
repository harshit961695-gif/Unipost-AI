export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import prisma from '@/lib/prisma';
import { fetchFacebookMetrics, fetchInstagramMetrics, fetchYouTubeMetrics } from '@/lib/services/analyticsService';
import { logger } from '@/lib/logger';
import { notificationService } from '@/lib/services/notificationService';

export const runtime = 'nodejs';
export const maxDuration = 60;

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

    console.log('[FETCH START] ===== ANALYTICS FETCH STARTING =====');
    console.log('[FETCH] Timestamp:', new Date().toISOString());

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!supabaseUrl || !supabaseServiceKey) throw new Error('Missing Supabase env vars');

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // STEP 1 — Get all connected accounts
    const { data: accounts, error: accErr } = await supabase
      .from('connected_accounts').select('*').neq('access_token', '');
    if (accErr) throw accErr;
    const allAccounts = accounts || [];
    console.log(`[FETCH] Connected accounts: ${allAccounts.length}`);
    if (allAccounts.length === 0) return NextResponse.json({ success: true, message: 'No connected accounts' });

    // STEP 2 — Get post_logs from Neon (Prisma — sole owner)
    let neonLogs: any[] = [];
    try {
      neonLogs = await prisma.post_logs.findMany({ where: { status: { in: ['success', 'published'] } }, orderBy: { created_at: 'desc' } });
      console.log(`[FETCH] Neon post_logs: ${neonLogs.length}`);
    } catch (e: any) { console.warn('[FETCH] Neon post_logs failed:', e.message); }

    // STEP 3 — Get from Neon posts table (for platform IDs not yet in post_logs)
    let postTableLogs: any[] = [];
    try {
      const prismaPosts = await prisma.posts.findMany({ where: { status: 'published' } });
      console.log(`[FETCH] Neon posts table: ${prismaPosts.length}`);
      for (const post of prismaPosts) {
        const entries = [
          { platform: 'facebook', id: post.facebook_post_id },
          { platform: 'instagram', id: post.instagram_media_id },
          { platform: 'youtube', id: post.youtube_video_id },
        ];
        for (const e of entries) {
          if (!e.id) continue;
          const exists = neonLogs.find(l => l.platform_post_id === e.id);
          if (!exists) postTableLogs.push({ id: post.id + '_' + e.platform, user_id: post.user_id, platform: e.platform, platform_post_id: e.id, status: 'success', views: 0, likes: 0, comments: 0, reach: 0, impressions: 0, engagement: 0, shares: 0, created_at: post.created_at });
        }
      }
    } catch (e: any) { console.warn('[FETCH] posts table failed:', e.message); }

    // STEP 4 — Merge all Neon sources
    const allPostLogs = [...neonLogs, ...postTableLogs];
    console.log(`[FETCH START] Total posts to process: ${allPostLogs.length}, Total users: ${[...new Set([...allPostLogs.map(p => p.user_id), ...allAccounts.map(a => a.user_id)])].length}`);

    // STEP 6 — Group by user
    const accountsByUser: Record<string, any[]> = {};
    allAccounts.forEach(acc => { if (!accountsByUser[acc.user_id]) accountsByUser[acc.user_id] = []; accountsByUser[acc.user_id].push(acc); });
    const allUserIds = [...new Set([...allPostLogs.map(p => p.user_id), ...allAccounts.map(a => a.user_id)])];

    let processedUsersCount = 0;
    let snapshotsCreated = 0;

    for (const userId of allUserIds) {
      try {
        const userAccounts = accountsByUser[userId] || [];
        const userPosts = allPostLogs.filter(p => p.user_id === userId);
        
        const tokenMap: Record<string, any> = {};
        userAccounts.forEach(acc => { tokenMap[acc.platform.trim().toLowerCase()] = acc; });

        let totalReach = 0, totalImpressions = 0, totalEngagement = 0, totalViews = 0, totalLikes = 0, totalComments = 0;
        
        // Track per platform
        const platformMetrics: Record<string, any> = {
          facebook: { views: 0, likes: 0, comments: 0, shares: 0, reach: 0, impressions: 0, engagement: 0 },
          instagram: { views: 0, likes: 0, comments: 0, shares: 0, reach: 0, impressions: 0, engagement: 0 },
          youtube: { views: 0, likes: 0, comments: 0, shares: 0, reach: 0, impressions: 0, engagement: 0 }
        };

        if (userPosts.length > 0) {
          await Promise.allSettled(userPosts.map(async (post) => {
            const platform = post.platform?.trim().toLowerCase();
            const postId = post.platform_post_id;
            const token = tokenMap[platform]?.access_token;
            if (!postId || (!token && platform !== 'youtube')) { 
              console.warn(`[POST] Skip ${platform}/${postId}: missing token or postId`); return; 
            }

            let m: any = null;
            
            try {
              if (platform === 'facebook') {
                // page_id is stored inside metadata JSONB, NOT as a top-level column
                const fbAccount = tokenMap['facebook'];
                const fbPageId = fbAccount?.metadata?.page_id || fbAccount?.page_id;
                console.log(`[FB TOKEN TYPE] fetch-analytics: page_id='${fbPageId || 'MISSING'}', stored post_id='${postId}'`)
                m = await fetchFacebookMetrics(postId, token, fbPageId, post.user_id);
              } else if (platform === 'instagram') {
                m = await fetchInstagramMetrics(postId, token, post.user_id);
              } else if (platform === 'youtube') {
                m = await fetchYouTubeMetrics(postId, process.env.GOOGLE_API_KEY || '', post.user_id);
              }

              if (m === null) {
                console.warn(`[FETCH WARNING] Failed to fetch analytics for ${platform}/${postId}. Keeping previous metrics: views=${post.views}, likes=${post.likes}`);
                logger.analytics.warn(`Failed to fetch analytics for ${platform}/${postId}. Keeping previous metrics.`, {
                  platform,
                  platform_post_id: postId,
                  user_id: post.user_id
                });
                
                // Trigger Analytics Sync Failed notification (throttled to 24h)
                const platformName = platform.charAt(0).toUpperCase() + platform.slice(1);
                await notificationService.createNotification(
                  post.user_id,
                  `analytics_sync_failed_${platform.toLowerCase()}`,
                  'Analytics Sync Failed',
                  `Analytics could not be fetched from ${platformName}.`,
                  { platform, platformPostId: postId }
                );
                // Use previous metrics for totals
                totalViews += post.views || 0;
                totalLikes += post.likes || 0;
                totalComments += post.comments || 0;
                totalReach += post.reach || 0;
                totalImpressions += post.impressions || 0;
                totalEngagement += post.engagement || 0;

                if (platformMetrics[platform]) {
                  platformMetrics[platform].views += post.views || 0;
                  platformMetrics[platform].likes += post.likes || 0;
                  platformMetrics[platform].comments += post.comments || 0;
                  platformMetrics[platform].shares += post.shares || 0;
                  platformMetrics[platform].reach += post.reach || 0;
                  platformMetrics[platform].impressions += post.impressions || 0;
                  platformMetrics[platform].engagement += post.engagement || 0;
                }
                return;
              }

              // Update user totals
              totalViews += m.views; 
              totalLikes += m.likes; 
              totalComments += m.comments; 
              totalReach += m.reach; 
              totalImpressions += m.impressions; 
              totalEngagement += m.engagement;

              // Update platform totals
              if (platformMetrics[platform]) {
                platformMetrics[platform].views += m.views;
                platformMetrics[platform].likes += m.likes;
                platformMetrics[platform].comments += m.comments;
                platformMetrics[platform].shares += m.shares;
                platformMetrics[platform].reach += m.reach;
                platformMetrics[platform].impressions += m.impressions;
                platformMetrics[platform].engagement += m.engagement;
              }

              // Update post_logs
              const fetchedAt = new Date().toISOString();
              const updateData = { 
                views: m.views, 
                likes: m.likes, 
                comments: m.comments, 
                shares: m.shares,
                reach: m.reach, 
                impressions: m.impressions, 
                engagement: m.engagement,
                fetched_at: fetchedAt 
              };

              await prisma.post_logs.updateMany({ 
                where:{ platform_post_id:postId }, 
                data: { ...updateData, fetched_at: new Date(fetchedAt) }
              });
            } catch (e: any) { 
              console.error(`[POST] Error ${platform}/${postId}: ${e.message}`); 
              logger.analytics.error(`Exception while fetching analytics for ${platform}/${postId}`, {
                platform,
                platform_post_id: postId,
                error: e.message,
                stack: e.stack
              });
            }
          }));
        }

        console.log(`[MERGED TOTALS] User ${userId.slice(0,8)} views=${totalViews} likes=${totalLikes} reach=${totalReach} eng=${totalEngagement}`);

        const now = new Date();
        const snapshotPayload = {
          user_id: userId,
          platform: 'aggregated',
          total_reach: totalReach,
          total_impressions: totalImpressions,
          total_engagement: totalEngagement,
          total_views: totalViews,
          total_likes: totalLikes,
          total_comments: totalComments,
        };

        try {
          // 1. Write/Upsert to analytics_current
          const currentStats = await prisma.analytics_current.upsert({
            where: { user_id: userId },
            create: {
              user_id: userId,
              total_reach: totalReach,
              total_impressions: totalImpressions,
              total_engagement: totalEngagement,
              total_views: totalViews,
              total_likes: totalLikes,
              total_comments: totalComments,
              platform_metrics: platformMetrics,
            },
            update: {
              total_reach: totalReach,
              total_impressions: totalImpressions,
              total_engagement: totalEngagement,
              total_views: totalViews,
              total_likes: totalLikes,
              total_comments: totalComments,
              platform_metrics: platformMetrics,
              updated_at: now,
            }
          });
          console.log(`[CURRENT METRICS SAVED] Prisma id=${currentStats.id} userId=${userId.slice(0, 8)}`);

          // 2. Write/Update to analytics_daily (grouping by date)
          const startOfDay = new Date(now);
          startOfDay.setUTCHours(0, 0, 0, 0);

          const existingDaily = await prisma.analytics_daily.findFirst({
            where: {
              user_id: userId,
              snapshot_date: {
                gte: startOfDay,
                lt: new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000)
              }
            }
          });

          if (existingDaily) {
            await prisma.analytics_daily.update({
              where: { id: existingDaily.id },
              data: {
                total_reach: totalReach,
                total_impressions: totalImpressions,
                total_engagement: totalEngagement,
                total_views: totalViews,
                total_likes: totalLikes,
                total_comments: totalComments,
                platform_metrics: platformMetrics,
              }
            });
            console.log(`[DAILY METRICS UPDATED] id=${existingDaily.id} userId=${userId.slice(0, 8)}`);
          } else {
            const createdDaily = await prisma.analytics_daily.create({
              data: {
                user_id: userId,
                total_reach: totalReach,
                total_impressions: totalImpressions,
                total_engagement: totalEngagement,
                total_views: totalViews,
                total_likes: totalLikes,
                total_comments: totalComments,
                platform_metrics: platformMetrics,
                snapshot_date: startOfDay,
                created_at: now
              }
            });
            console.log(`[DAILY METRICS CREATED] id=${createdDaily.id} userId=${userId.slice(0, 8)}`);
          }

          // 3. Write to analytics_snapshots (Historical tracking with 100 snapshot retention)
          const created = await prisma.analytics_snapshots.create({
            data: {
              ...snapshotPayload,
              platform_metrics: platformMetrics,
              snapshot_date: now,
              created_at: now,
            }
          });
          console.log(`[SNAPSHOT SAVED] Prisma id=${created.id} userId=${userId.slice(0, 8)} platform_metrics=${JSON.stringify(platformMetrics)}`);
          snapshotsCreated++;

          // Immediate retention cleanup: keep only latest 1000 snapshots for this user
          try {
            const keepSnapshots = await prisma.analytics_snapshots.findMany({
              where: { user_id: userId },
              orderBy: { created_at: 'desc' },
              take: 1000,
              select: { id: true }
            });
            const keepIds = keepSnapshots.map((s: any) => s.id);
            if (keepIds.length > 0) {
              const deleted = await prisma.analytics_snapshots.deleteMany({
                where: {
                  user_id: userId,
                  id: { notIn: keepIds }
                }
              });
              console.log(`[RETENTION CLEANUP] Deleted ${deleted.count} older snapshots for user ${userId.slice(0, 8)}. Kept ${keepIds.length}.`);
            }
          } catch (cleanupErr: any) {
            console.error(`[RETENTION CLEANUP FAILED] Error for user ${userId.slice(0, 8)}:`, cleanupErr.message);
          }
        } catch (prismaErr: any) {
          console.error('[SNAPSHOT/AGGREGATION INSERT FAILED] Prisma error:', prismaErr.message);
        }



        processedUsersCount++;
      } catch (e: any) { console.error(`[USER ${userId.slice(0,8)}] failed:`, e.message); }
    }

    let totalSnapshots = 0;
    try { totalSnapshots = await prisma.analytics_snapshots.count(); } catch (_) {}

    console.log(`[DASHBOARD RESPONSE] processed=${processedUsersCount} snapshots=${snapshotsCreated}`);

    return NextResponse.json({
      success: true,
      processed_users: processedUsersCount,
      snapshots_created: snapshotsCreated,
      total_snapshots_in_db: totalSnapshots,
      total_posts: allPostLogs.length,
      timestamp: new Date().toISOString(),
    });

  } catch (err: any) {
    console.error('[FETCH] Fatal:', err.message);
    logger.analytics.error('Fatal error in fetch-analytics cron route', {
        error: err.message,
        stack: err.stack
    });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
