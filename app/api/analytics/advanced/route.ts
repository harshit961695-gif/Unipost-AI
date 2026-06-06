export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/server'
import prisma from '@/lib/prisma'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    const userId = user.id

    // Get date range from query params
    const range = request.nextUrl.searchParams.get('range') || '30d'
    let days = 30
    if (range === '7d') days = 7
    else if (range === '90d') days = 90

    const dateFilter = new Date(Date.now() - days * 86400000)

    // 1. Fetch historical snapshots and post logs concurrently to reduce network latency
    const [snapshots, postLogs] = await Promise.all([
      prisma.analytics_daily.findMany({
        where: { 
          user_id: userId,
          snapshot_date: { gte: dateFilter }
        },
        orderBy: { snapshot_date: 'asc' },
      }),
      prisma.post_logs.findMany({
        where: { 
          user_id: userId,
          created_at: { gte: dateFilter }
        },
        orderBy: { created_at: 'desc' },
      })
    ]);

    console.log(`[ADVANCED API] Daily snapshots fetched for range ${range}: ${snapshots.length} records`)
    console.log(`[ADVANCED API] Post logs fetched for range ${range}: ${postLogs.length}`)

    // 3. Date-wise formatting (timeline analytics)
    const date_wise = snapshots.map((snap: any) => ({
      date: new Date(snap.snapshot_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      views: snap.total_views,
      likes: snap.total_likes,
      comments: snap.total_comments,
      shares: snap.total_shares || 0,
      reach: snap.total_reach,
      impressions: snap.total_impressions,
      engagement: snap.total_engagement,
    }))

    // 4. Platform-wise grouping
    const platforms: Record<string, any> = {
      youtube: { views: 0, likes: 0, comments: 0, shares: 0, reach: 0, impressions: 0, engagement: 0, count: 0 },
      facebook: { views: 0, likes: 0, comments: 0, shares: 0, reach: 0, impressions: 0, engagement: 0, count: 0 },
      instagram: { views: 0, likes: 0, comments: 0, shares: 0, reach: 0, impressions: 0, engagement: 0, count: 0 },
    }

    let total_shares = 0;

    postLogs.forEach((log: any) => {
      const platform = (log.platform || '').trim().toLowerCase()
      if (platforms[platform]) {
        const isSuccessful = log.status === 'success' || log.status === 'published';
        if (isSuccessful) {
          platforms[platform].views += log.views || 0
          platforms[platform].likes += log.likes || 0
          platforms[platform].comments += log.comments || 0
          platforms[platform].shares += log.shares || 0
          platforms[platform].reach += log.reach || 0
          platforms[platform].impressions += log.impressions || 0
          platforms[platform].engagement += log.engagement || 0
          platforms[platform].count += 1
        }
      }
      if (log.status === 'success' || log.status === 'published') {
        total_shares += log.shares || 0
      }
    })

    // 5. Top Performing Posts (by likes and engagement)
    const topByLikes = [...postLogs]
      .filter((log: any) => log.status === 'success' || log.status === 'published')
      .sort((a, b) => b.likes - a.likes)
      .slice(0, 5)

    const topByEngagement = [...postLogs]
      .filter((log: any) => log.status === 'success' || log.status === 'published')
      .sort((a, b) => b.engagement - a.engagement)
      .slice(0, 5)

    // 6. Latest snapshot stats (reading from analytics_current with fallback to snapshots)
    let currentSnap: any = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null
    let prevSnap: any = snapshots.length >= 2 ? snapshots[snapshots.length - 2] : null

    try {
      const currentStats = await prisma.analytics_current.findUnique({
        where: { user_id: userId }
      });
      if (currentStats) {
        currentSnap = {
          ...currentStats,
          snapshot_date: currentStats.updated_at,
          created_at: currentStats.updated_at
        };
        prevSnap = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
      }
    } catch (currentStatsErr) {
      console.warn('[ADVANCED API] Failed to fetch analytics_current, using snapshots history fallback:', currentStatsErr);
    }

    const viewsGrowth =
      currentSnap && prevSnap && prevSnap.total_views > 0
        ? ((currentSnap.total_views - prevSnap.total_views) / prevSnap.total_views) * 100
        : 0

    const engRate =
      currentSnap && currentSnap.total_impressions > 0
        ? (currentSnap.total_engagement / currentSnap.total_impressions) * 100
        : 0

    let bestPlatform = 'none'
    let worstPlatform = 'none'
    let highestEng = -1
    let lowestEng = Infinity

    Object.keys(platforms).forEach((key) => {
      const pEng = platforms[key].engagement
      if (platforms[key].count > 0) {
        if (pEng > highestEng) {
          highestEng = pEng
          bestPlatform = key
        }
        if (pEng < lowestEng) {
          lowestEng = pEng
          worstPlatform = key
        }
      }
    })

    if (highestEng <= 0) {
      bestPlatform = 'none'
      worstPlatform = 'none'
    }

    // 7. Global totals -> merged_totals
    const merged_totals = {
      views: currentSnap?.total_views || 0,
      likes: currentSnap?.total_likes || 0,
      comments: currentSnap?.total_comments || 0,
      shares: total_shares,
      reach: currentSnap?.total_reach || 0,
      impressions: currentSnap?.total_impressions || 0,
      engagement: currentSnap?.total_engagement || 0,
    }

    return NextResponse.json({
      success: true,
      hasData: snapshots.length > 0,
      hasPosts: postLogs.length > 0,
      postLogs, // complete live logs
      allPostLogs: postLogs, // full array for CSV and post listings
      merged_totals,
      platforms, // renamed from platform_wise
      date_wise,
      topPosts: {
        byLikes: topByLikes,
        byEngagement: topByEngagement,
      },
      latestSnapshot: currentSnap,
      combined: {
        total_growth_percentage: viewsGrowth,
        engagement_rate: engRate,
        best_platform: bestPlatform,
        worst_platform: worstPlatform,
      },
    })
  } catch (error: any) {
    console.error('[ADVANCED API] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
