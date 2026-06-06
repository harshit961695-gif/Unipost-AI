export const dynamic = 'force-dynamic'
/**
 * Analytics API Route
 * GET /api/analytics
 * 
 * Fetches real analytics data from Neon (Prisma)
 * Aggregates metrics by platform
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/server'
import prisma from '@/lib/prisma'

export const runtime = 'nodejs'

/**
 * GET /api/analytics
 * Get analytics data for the authenticated user
 * Query params: 
 *   - period: '7d', '30d', '90d', 'all' (default: '30d')
 *   - platform: filter by platform (optional)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)

    const searchParams = request.nextUrl.searchParams
    const period = searchParams.get('period') || '30d'
    const platformFilter = searchParams.get('platform') // Optional platform filter

    // Fetch all post logs for this user
    const postLogs = await prisma.post_logs.findMany({
      where: {
        user_id: user.id,
        status: { in: ['success', 'published'] },
      },
      orderBy: { created_at: 'desc' },
    })

    console.log(`[Analytics] Fetched ${postLogs.length} post logs for user ${user.id}`)

    // If no posts, return empty analytics
    if (!postLogs || postLogs.length === 0) {
      return NextResponse.json({
        merged_totals: {
          totalPosts: 0,
          views: 0,
          likes: 0,
          comments: 0,
          shares: 0,
          reach: 0,
          impressions: 0,
          engagement: 0,
          averageEngagementRate: 0,
        },
        platforms: {},
        recentPosts: [],
        trends: { views: [], engagement: [] },
      })
    }

    // Filter by platform if specified
    const filteredLogs = platformFilter
      ? postLogs.filter((log: any) => log.platform.toLowerCase() === platformFilter.toLowerCase())
      : postLogs

    // Aggregate by platform
    const platformMetricsMap: Record<string, { views: number; likes: number; comments: number; shares: number; reach: number; impressions: number; engagement: number; posts: number }> = {}

    filteredLogs.forEach((log: any) => {
      const platform = log.platform.toLowerCase()

      if (!platformMetricsMap[platform]) {
        platformMetricsMap[platform] = { views: 0, likes: 0, comments: 0, shares: 0, reach: 0, impressions: 0, engagement: 0, posts: 0 }
      }
      platformMetricsMap[platform].views += log.views || 0
      platformMetricsMap[platform].likes += log.likes || 0
      platformMetricsMap[platform].comments += log.comments || 0
      platformMetricsMap[platform].shares += log.shares || 0 
      platformMetricsMap[platform].reach += log.reach || 0 
      platformMetricsMap[platform].impressions += log.impressions || 0 
      platformMetricsMap[platform].engagement += log.engagement || 0
      platformMetricsMap[platform].posts++
    })

    // Calculate totals
    const totals = {
      views: Object.values(platformMetricsMap).reduce((sum, m) => sum + m.views, 0),
      likes: Object.values(platformMetricsMap).reduce((sum, m) => sum + m.likes, 0),
      comments: Object.values(platformMetricsMap).reduce((sum, m) => sum + m.comments, 0),
      shares: Object.values(platformMetricsMap).reduce((sum, m) => sum + m.shares, 0),
      reach: Object.values(platformMetricsMap).reduce((sum, m) => sum + m.reach, 0),
      impressions: Object.values(platformMetricsMap).reduce((sum, m) => sum + m.impressions, 0),
      engagement: Object.values(platformMetricsMap).reduce((sum, m) => sum + m.engagement, 0),
    }

    const totalEngagement = totals.engagement
    const averageEngagementRate = totals.impressions > 0 ? (totalEngagement / totals.impressions) * 100 : (totals.views > 0 ? (totalEngagement / totals.views) * 100 : 0)

    // Platform breakdown
    const platforms: Record<string, any> = {}
    Object.entries(platformMetricsMap).forEach(([platform, metrics]: [string, any]) => {
      const totalEng = metrics.engagement
      platforms[platform] = {
        posts: metrics.posts,
        views: metrics.views,
        likes: metrics.likes,
        comments: metrics.comments,
        shares: metrics.shares,
        reach: metrics.reach,
        impressions: metrics.impressions,
        engagement: metrics.engagement,
        engagementRate: metrics.impressions > 0 ? Math.round((totalEng / metrics.impressions) * 100 * 100) / 100 : (metrics.views > 0 ? Math.round((totalEng / metrics.views) * 100 * 100) / 100 : 0),
      }
    })

    // Recent posts with analytics
    const recentPosts = filteredLogs.slice(0, 10).map((log: any) => ({
      id: log.id,
      title: log.content?.substring(0, 50) + '...' || 'Post',
      platform: log.platform,
      publishedAt: log.created_at,
      analytics: {
        views: log.views || 0,
        likes: log.likes || 0,
        comments: log.comments || 0,
        shares: log.shares || 0,
        reach: log.reach || 0,
        impressions: log.impressions || 0,
        engagement: log.engagement || 0,
      },
    }))

    return NextResponse.json({
      merged_totals: {
        totalPosts: filteredLogs.length,
        views: totals.views,
        likes: totals.likes,
        comments: totals.comments,
        shares: totals.shares,
        reach: totals.reach,
        impressions: totals.impressions,
        engagement: totals.engagement,
        averageEngagementRate: Math.round(averageEngagementRate * 100) / 100,
      },
      platforms,
      recentPosts,
      trends: { views: [], engagement: [] },
      period,
    })
  } catch (error: any) {
    console.error('[Analytics] GET error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch analytics' },
      { status: error.message?.includes('Authentication') ? 401 : 500 }
    )
  }
}
