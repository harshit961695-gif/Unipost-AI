/**
 * Analytics Snapshot Sync Endpoint
 * POST /api/analytics/snapshot
 * 
 * Manually sync all platform metrics for published posts in the last 7 days
 * Can be called manually to trigger immediate analytics collection
 */
export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/server'
import prisma from '@/lib/prisma'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { syncPostAnalytics } from '@/lib/services/analyticsService'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    const supabase = createSupabaseServerClient()

    console.log(`[ANALYTICS SNAPSHOT] Syncing for user ${user.id}`)

    // Fetch published posts from last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    // Fetch published posts from Neon (Prisma — sole owner of posts table)
    const posts = await prisma.posts.findMany({
      where: {
        user_id: user.id,
        status: 'published',
        created_at: {
          gte: sevenDaysAgo
        }
      },
      orderBy: { created_at: 'desc' }
    });
    console.log(`[ANALYTICS SNAPSHOT] Found ${posts.length} posts in Prisma`);

    console.log(`[ANALYTICS SNAPSHOT] Found ${posts.length} posts to sync`)

    if (posts.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No posts to sync',
        synced: 0,
        results: {},
      })
    }

    // Sync analytics for each post
    const syncResults: Record<string, Record<string, boolean>> = {}
    let totalSynced = 0

    for (const post of posts) {
      try {
        // Get platform-specific post IDs from post data
        const platformPostIds: Record<string, string> = {}

        if (post.facebook_post_id) platformPostIds.facebook = post.facebook_post_id
        if (post.instagram_media_id) platformPostIds.instagram = post.instagram_media_id
        if (post.youtube_video_id) platformPostIds.youtube = post.youtube_video_id

        const platforms = Object.keys(platformPostIds)

        if (platforms.length === 0) {
          console.log(`[ANALYTICS SNAPSHOT] Post ${post.id} has no platform IDs`)
          continue
        }

        console.log(`[ANALYTICS SNAPSHOT] Syncing post ${post.id} on platforms: ${platforms.join(', ')}`)

        const results = await syncPostAnalytics(
          supabase,
          post.id,
          user.id,
          platforms,
          platformPostIds
        )

        syncResults[post.id] = results
        totalSynced += Object.values(results).filter(r => r).length

        console.log(`[Analytics Snapshot] Post ${post.id} sync complete:`, results)
      } catch (error) {
        console.error(`[Analytics Snapshot] Error syncing post ${post.id}:`, error)
        syncResults[post.id] = { error: true }
      }
    }

    console.log(`[Analytics Snapshot] Sync complete. Total metrics synced: ${totalSynced}`)

    return NextResponse.json({
      success: true,
      message: `Synced analytics for ${posts.length} posts`,
      synced: totalSynced,
      results: syncResults,
    })
  } catch (error: any) {
    console.error('[Analytics Snapshot] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to sync analytics' },
      { status: error.message?.includes('Authentication') ? 401 : 500 }
    )
  }
}

/**
 * GET /api/analytics/snapshot
 * Get sync status and information
 * 
 * Reads posts from Neon (Prisma) and post_logs for sync info.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)

    // Get user's posts from last 7 days (Neon — sole owner)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const userPosts = await prisma.posts.findMany({
      where: {
        user_id: user.id,
        status: 'published',
        created_at: { gte: sevenDaysAgo },
      },
      select: { id: true },
    })

    const postIds = userPosts.map(p => p.id)

    // Get latest sync times from post_logs (Neon — sole owner)
    const postLogs = await prisma.post_logs.findMany({
      where: {
        user_id: user.id,
        fetched_at: { not: null },
      },
      orderBy: { fetched_at: 'desc' },
      take: 50,
      select: {
        platform: true,
        platform_post_id: true,
        fetched_at: true,
        views: true,
        likes: true,
        comments: true,
        shares: true,
      },
    })

    return NextResponse.json({
      status: 'ok',
      postsAnalyzed: postIds.length,
      analyticsRecords: postLogs.length,
      lastSyncs: postLogs,
      message: 'POST /api/analytics/snapshot to trigger immediate sync for all posts',
    })
  } catch (error: any) {
    console.error('[Analytics Snapshot] GET error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get sync status' },
      { status: 500 }
    )
  }
}
