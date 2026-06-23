/**
 * Analytics Service — Multi-Platform Merged Analytics Engine
 * Fetches REAL metrics from Instagram, Facebook, YouTube APIs
 * Provides per-post, per-platform, and merged analytics
 */
import { SupabaseClient, createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
import { logger } from '../logger'
import { notificationService } from './notificationService'
import { youtubeService } from './youtube'

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 1500): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

export interface PlatformMetrics {
  views: number
  likes: number
  comments: number
  shares: number
  reach: number
  impressions: number
  engagement: number
  engagement_rate: number
}

const EMPTY_METRICS: PlatformMetrics = {
  views: 0,
  likes: 0,
  comments: 0,
  shares: 0,
  reach: 0,
  impressions: 0,
  engagement: 0,
  engagement_rate: 0,
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FACEBOOK — Post-level analytics via Graph API v25.0
// ONLY uses /{post-id}?fields= — NO /insights calls
// Token MUST be a Page Access Token (not a User token)
// Post ID MUST be full compound format: {pageId}_{postId}
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function fetchFacebookMetrics(
  postId: string,
  accessToken: string,
  pageId?: string,
  userId?: string
): Promise<PlatformMetrics | null> {
  try {
    console.log(`[FB STORED POST ID] Raw stored ID: ${postId}`)
    console.log(`[FB STORED POST ID] Page ID available: ${pageId || 'NOT PROVIDED'}`)

    let fullPostId = postId
    if (pageId && !postId.includes('_')) {
      fullPostId = `${pageId}_${postId}`
      console.log(`[FB FULL POST ID] Reconstructed: ${fullPostId} (was fragment-only: ${postId})`)
    } else if (!postId.includes('_') && !pageId) {
      console.error(`[FB FULL POST ID] PROBLEM: Post ID "${postId}" is a fragment (no underscore) but no pageId was provided to reconstruct it. API call will likely fail.`)
    } else {
      console.log(`[FB FULL POST ID] Already compound format: ${fullPostId}`)
    }

    if (!accessToken) {
      console.error(`[FB POST FETCH] ABORT: No access token provided for post ${fullPostId}`)
      return null
    }

    console.log('[FB] Using basic fields endpoint (no App Review needed)')
    const url = `https://graph.facebook.com/v21.0/${fullPostId}?fields=likes.summary(true),comments.summary(true),shares,created_time&access_token=${accessToken}`
    const redactedUrl = url.replace(accessToken, 'PAGE_TOKEN_REDACTED')
    console.log(`[FB REQUEST URL] ${redactedUrl}`)

    const res = await fetchWithTimeout(url)
    const data = await res.json()

    console.log(`[FB RAW RESPONSE] HTTP ${res.status} for post ${fullPostId}:`, JSON.stringify(data))

    if (data.error) {
      console.warn(`[FB POST FETCH] Primary query failed. Attempting post confirmation fallback...`)
      
      const confirmUrl = `https://graph.facebook.com/v21.0/${fullPostId}?fields=id,message,created_time&access_token=${accessToken}`
      const confirmRes = await fetchWithTimeout(confirmUrl)
      const confirmData = await confirmRes.json()
      
      console.log(`[FB CONFIRM RESPONSE] HTTP ${confirmRes.status} for post ${fullPostId}:`, JSON.stringify(confirmData))
      
      if (confirmData.error) {
        console.error(`[FB POST FETCH] Confirmation fallback also failed: ${JSON.stringify(confirmData.error)}`)
        // Trigger Reconnect Facebook notification if token is expired/invalid
        if (userId && (confirmData.error.code === 190 || confirmData.error.message?.includes('access token') || confirmData.error.message?.includes('validate'))) {
            await notificationService.createNotification(
                userId,
                'account_expired_facebook',
                'Reconnect Facebook',
                'Facebook connection expired.\nReconnect your account.'
            );
        }
        return null
      }
      
      // Post exists but primary metrics query failed (e.g. missing permissions). Return null to keep existing DB values.
      console.log(`[FB POST FETCH] Post confirmed to exist but metrics query failed. Returning null to keep existing values.`)
      return null
    }

    const likes = data.likes?.summary?.total_count || 0
    const comments = data.comments?.summary?.total_count || 0
    const shares = data.shares?.count || 0
    const engagement = likes + comments + shares
    const views = engagement
    const reach = engagement
    const impressions = engagement
    const engagement_rate = impressions > 0 ? (engagement / impressions) * 100 : 0

    const metrics: PlatformMetrics = {
      views: Math.max(views, 0),
      likes: Math.max(likes, 0),
      comments: Math.max(comments, 0),
      shares: Math.max(shares, 0),
      reach: Math.max(reach, 0),
      impressions: Math.max(impressions, 0),
      engagement: Math.max(engagement, 0),
      engagement_rate: Math.round(engagement_rate * 100) / 100,
    }

    console.log(`[FB FINAL METRICS] post=${fullPostId} likes=${likes} comments=${comments} shares=${shares} engagement=${engagement}`)
    return metrics

  } catch (error: any) {
    console.error(`[FB POST FETCH] Exception for post ${postId}:`, error.message)
    logger.analytics.error(`Exception in fetchFacebookMetrics for post ${postId}`, {
      error: error.message,
      stack: error.stack
    })
    return null
  }
}




// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// INSTAGRAM — Graph API v25.0 media fields
// Uses media-type-aware insights metrics
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function fetchInstagramMetrics(
  mediaId: string,
  accessToken: string,
  userId?: string
): Promise<PlatformMetrics | null> {
  try {
    console.log(`[IG POST FETCH] Starting metrics fetch for media: ${mediaId}`)

    // Step 1: Fetch basic media fields including media_type for metric selection
    const detailUrl = `https://graph.facebook.com/v25.0/${mediaId}?fields=like_count,comments_count,media_type,media_product_type&access_token=${accessToken}`
    console.log(`[IG POST FETCH] Detail URL: ${detailUrl.replace(accessToken, 'ACCESS_TOKEN_REDACTED')}`)
    const detailRes = await fetchWithTimeout(detailUrl)
    const detailData = await detailRes.json()

    console.log(`[IG RESPONSE] Detail:`, JSON.stringify(detailData))

    if (detailData.error) {
      console.error(`[IG RESPONSE] API Error: ${detailData.error.message} (code: ${detailData.error.code})`)
      logger.analytics.error(`Instagram API Error in fetchInstagramMetrics details for media ${mediaId}`, {
        error: detailData.error
      })
      
      // Trigger Reconnect Instagram notification if token is expired/invalid
      if (userId && (detailData.error.code === 190 || detailData.error.message?.includes('access token') || detailData.error.message?.includes('validate'))) {
          await notificationService.createNotification(
              userId,
              'account_expired_instagram',
              'Reconnect Instagram',
              'Instagram connection expired.\nReconnect your account.'
          );
      }
      return null
    }

    const likes = Number(detailData.like_count || 0)
    const comments = Number(detailData.comments_count || 0)
    let shares = 0
    let saved = 0
    const mediaType = (detailData.media_type || '').toUpperCase()
    const mediaProductType = (detailData.media_product_type || '').toUpperCase()

    console.log(`[IG MEDIA TYPE] media=${mediaId} mediaType=${mediaType} mediaProductType=${mediaProductType}`)

    // Step 2: Try to fetch insights — use media-type-aware metrics
    // Graph API v22.0 deprecated impressions and plays in favor of views
    let reach = 0
    let impressions = 0

    let metricsToTry: string[] = []
    if (mediaType === 'REEL' || mediaProductType === 'REEL') {
      metricsToTry = ['views', 'reach', 'saved', 'shares']
    } else if (mediaType === 'VIDEO') {
      metricsToTry = ['views', 'reach', 'saved']
    } else {
      metricsToTry = ['views', 'reach', 'saved', 'shares']
    }

    let insightsData: any = null
    try {
      const insightsUrl = `https://graph.facebook.com/v25.0/${mediaId}/insights?metric=${metricsToTry.join(',')}&access_token=${accessToken}`
      console.log(`[IG METRICS REQUEST] ${insightsUrl.replace(accessToken, 'ACCESS_TOKEN_REDACTED')}`)
      const insightsRes = await fetchWithTimeout(insightsUrl)
      insightsData = await insightsRes.json()

      console.log(`[IG API RESPONSE] HTTP ${insightsRes.status}:`, JSON.stringify(insightsData))

      // Fallback 1: If primary query fails (e.g. because "views" or "shares" is unsupported)
      if (insightsData.error) {
        console.warn(`[IG POST FETCH] Primary query failed: ${insightsData.error.message}. Retrying with fallback...`)
        
        let fallbackMetrics: string[] = []
        if (mediaType === 'REEL' || mediaProductType === 'REEL') {
          fallbackMetrics = ['plays', 'reach', 'saved', 'shares']
        } else if (mediaType === 'VIDEO') {
          fallbackMetrics = ['plays', 'reach', 'saved']
        } else {
          fallbackMetrics = ['reach', 'saved']
        }

        const fallbackUrl = `https://graph.facebook.com/v25.0/${mediaId}/insights?metric=${fallbackMetrics.join(',')}&access_token=${accessToken}`
        console.log(`[IG METRICS REQUEST (FALLBACK)] ${fallbackUrl.replace(accessToken, 'ACCESS_TOKEN_REDACTED')}`)
        const fallbackRes = await fetchWithTimeout(fallbackUrl)
        insightsData = await fallbackRes.json()
        console.log(`[IG API RESPONSE (FALLBACK)] HTTP ${fallbackRes.status}:`, JSON.stringify(insightsData))
      }

      // Fallback 2: Core safe metrics only (never fails)
      if (insightsData && insightsData.error) {
        console.warn(`[IG POST FETCH] Fallback query failed. Fetching safe core metrics only...`)
        const safeMetrics = ['reach', 'saved']
        const safeUrl = `https://graph.facebook.com/v25.0/${mediaId}/insights?metric=${safeMetrics.join(',')}&access_token=${accessToken}`
        console.log(`[IG METRICS REQUEST (SAFE)] ${safeUrl.replace(accessToken, 'ACCESS_TOKEN_REDACTED')}`)
        const safeRes = await fetchWithTimeout(safeUrl)
        insightsData = await safeRes.json()
        console.log(`[IG API RESPONSE (SAFE)] HTTP ${safeRes.status}:`, JSON.stringify(insightsData))
      }

      // Parse insights values
      if (insightsData && insightsData.data && !insightsData.error) {
        insightsData.data.forEach((insight: any) => {
          const value = Number(insight.values?.[0]?.value || 0)
          if (insight.name === 'views' || insight.name === 'plays') impressions = value
          if (insight.name === 'reach') reach = value
          if (insight.name === 'saved') saved = value
          if (insight.name === 'shares') shares = value
        })
      }
    } catch (insightErr: any) {
      console.warn(`[IG POST FETCH] Insights unavailable for ${mediaId}: ${insightErr.message}`)
    }

    // Fallback: if no insights, approximate from engagement
    if (reach === 0) reach = likes + comments
    if (impressions === 0) impressions = likes + comments

    const totalEngagement = likes + comments + shares + saved
    const engagementRate = reach > 0 ? (totalEngagement / reach) * 100 : 0

    const metrics: PlatformMetrics = {
      views: Math.max(impressions, 0),
      likes: Math.max(likes, 0),
      comments: Math.max(comments, 0),
      shares: Math.max(shares, 0),
      reach: Math.max(reach, 0),
      impressions: Math.max(impressions, 0),
      engagement: Math.max(totalEngagement, 0),
      engagement_rate: Math.round(engagementRate * 100) / 100,
    }

    console.log(`[IG FINAL METRICS] media=${mediaId} type=${mediaType} likes=${metrics.likes} comments=${metrics.comments} reach=${metrics.reach} views/impressions=${metrics.views} engagement=${metrics.engagement}`)

    return metrics
  } catch (error: any) {
    console.error(`[IG POST FETCH] Exception for media ${mediaId}:`, error.message)
    logger.analytics.error(`Exception in fetchInstagramMetrics for media ${mediaId}`, {
      error: error.message,
      stack: error.stack
    })
    return null
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// YOUTUBE — Data API v3 statistics
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function fetchYouTubeMetrics(
  videoId: string,
  apiKey: string,
  userId?: string
): Promise<PlatformMetrics | null> {
  try {
    console.log(`[YT POST FETCH] Starting metrics fetch for video: ${videoId}`)
    console.log(`[YT POST FETCH] Using API key: ${apiKey ? apiKey.slice(0, 8) + '...' : 'MISSING'}`)

    let stats: any = null
    let fetched = false
    let oauthAccessToken: string | null = null

    if (userId) {
      try {
        console.log(`[YT POST FETCH] Fetching connected account access_token for user ${userId}`)
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (supabaseUrl && supabaseServiceKey) {
          const supabase = createClient(supabaseUrl, supabaseServiceKey, {
            auth: { persistSession: false, autoRefreshToken: false },
          })
          
          const { data: connection } = await supabase
            .from('connected_accounts')
            .select('*')
            .eq('user_id', userId)
            .eq('platform', 'youtube')
            .neq('access_token', '')
            .limit(1)

          if (connection && connection.length > 0) {
            oauthAccessToken = connection[0].access_token
          }
        }
      } catch (err: any) {
        console.warn(`[YT POST FETCH] Error fetching connection from database: ${err.message}`)
      }
    }

    // Try OAuth first
    if (oauthAccessToken) {
      try {
        console.log(`[YT POST FETCH] Attempting OAuth fetch for video ${videoId}`)
        const url = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoId}`
        const res = await fetchWithTimeout(url, {
          headers: {
            Authorization: `Bearer ${oauthAccessToken}`
          },
          cache: 'no-store'
        })
        const data = await res.json()
        console.log(`[YT OAUTH RESPONSE] HTTP ${res.status}:`, JSON.stringify(data))

        if (data.error) {
          console.warn(`[YT OAUTH RESPONSE] API Error: ${data.error.message} (code: ${data.error.code})`)
          // Trigger Reconnect YouTube notification if token is expired/invalid
          if (userId && (data.error.code === 401 || data.error.message?.includes('expired') || data.error.message?.includes('invalid_grant'))) {
              await notificationService.createNotification(
                  userId,
                  'account_expired_youtube',
                  'Reconnect YouTube',
                  'YouTube connection expired.\nReconnect your account.'
              )
          }
        } else if (!data.items || data.items.length === 0) {
          console.log('[YT] Video not found or private — statistics unavailable')
        } else {
          stats = data.items[0].statistics || {}
          fetched = true
          console.log(`[YT POST FETCH] Successfully fetched statistics via OAuth for video ${videoId}`)
        }
      } catch (oauthErr: any) {
        console.warn(`[YT POST FETCH] OAuth fetch failed for video ${videoId}: ${oauthErr.message}`)
      }
    }

    // Fallback to API Key if OAuth failed or wasn't available
    if (!fetched) {
      console.log(`[YT POST FETCH] Falling back to API key fetch for video ${videoId}`)
      if (apiKey) {
        try {
          const url = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoId}&key=${apiKey}`
          const res = await fetchWithTimeout(url, { cache: 'no-store' })
          const data = await res.json()
          console.log(`[YT API KEY RESPONSE] HTTP ${res.status}:`, JSON.stringify(data))

          if (data.error) {
            console.error(`[YT API RESPONSE] API Error: ${data.error.message} (code: ${data.error.code})`)
          } else if (!data.items || data.items.length === 0) {
            console.log('[YT] Video not found or private — statistics unavailable')
          } else {
            stats = data.items[0].statistics || {}
            fetched = true
            console.log(`[YT POST FETCH] Successfully fetched statistics via API key for video ${videoId}`)
          }
        } catch (apiKeyErr: any) {
          console.error(`[YT POST FETCH] API key fetch failed for video ${videoId}: ${apiKeyErr.message}`)
        }
      } else {
        console.warn(`[YT POST FETCH] GOOGLE_API_KEY is missing or empty, cannot fallback.`)
      }
    }

    if (!fetched) {
      console.log('[YT] Note: Private/Unlisted videos return 0 stats. Returning null to keep existing values.')
      return null
    }

    const views = Number(stats.viewCount || 0)
    const likes = Number(stats.likeCount || 0)
    const comments = Number(stats.commentCount || 0)
    const shares = 0

    const totalEngagement = likes + comments
    const engagementRate = views > 0 ? (totalEngagement / views) * 100 : 0

    const metrics: PlatformMetrics = {
      views: Math.max(views, 0),
      likes: Math.max(likes, 0),
      comments: Math.max(comments, 0),
      shares: Math.max(shares, 0),
      reach: Math.max(views, 0),
      impressions: Math.max(views, 0),
      engagement: Math.max(totalEngagement, 0),
      engagement_rate: Math.round(engagementRate * 100) / 100,
    }

    console.log(`[YT PARSED METRICS] views=${metrics.views} likes=${metrics.likes} comments=${metrics.comments} shares=${metrics.shares}`)
    return metrics
  } catch (error: any) {
    console.error(`[YT POST FETCH] Exception for video ${videoId}:`, error.message)
    logger.analytics.error(`Exception in fetchYouTubeMetrics for video ${videoId}`, {
      error: error.message,
      stack: error.stack
    })
    console.log('[YT] Note: Exception caught. Returning null to keep existing values.')
    return null
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SAVE POST ANALYTICS — per-post, per-platform
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function savePostAnalytics(
  supabase: SupabaseClient,
  postId: string,
  platform: string,
  metrics: PlatformMetrics
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('post_analytics')
      .upsert(
        {
          post_id: postId,
          platform,
          views: metrics.views,
          likes: metrics.likes,
          comments: metrics.comments,
          shares: metrics.shares,
          reach: metrics.reach,
          impressions: metrics.impressions,
          engagement_rate: metrics.engagement_rate,
          last_synced_at: new Date().toISOString(),
        },
        {
          onConflict: 'post_id,platform',
        }
      )

    if (error) {
      console.error('[Analytics] Save analytics error:', error)
      return false
    }

    console.log(`[Analytics] Saved metrics for post ${postId} on ${platform}`)
    return true
  } catch (error) {
    console.error('[Analytics] Save analytics exception:', error)
    return false
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SYNC POST ANALYTICS — fetch + save all platforms
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function syncPostAnalytics(
  supabase: SupabaseClient,
  postId: string,
  userId: string,
  platforms: string[],
  platformPostIds: Record<string, string>
): Promise<Record<string, boolean>> {
  const results: Record<string, boolean> = {}

  // Get user's platform connections
  const { data: connections, error: connectError } = await supabase
    .from('connected_accounts')
    .select('*')
    .eq('user_id', userId)

  if (connectError || !connections) {
    console.error('[Analytics] Failed to fetch platform connections:', connectError)
    return results
  }

  const connectionMap: Record<string, any> = {}
  connections.forEach((conn) => {
    connectionMap[conn.platform.toLowerCase()] = conn
  })

  // Fetch metrics for each platform
  for (const platform of platforms) {
    const platformLower = platform.toLowerCase()
    const connection = connectionMap[platformLower]
    const platformId = platformPostIds[platformLower]

    if (!connection || !platformId) {
      console.warn(`[Analytics] Missing connection or platform ID for ${platform}`)
      continue
    }

    let metrics: PlatformMetrics | null = null

    try {
      if (platformLower === 'facebook') {
        // page_id is stored inside metadata JSONB, NOT as a top-level column
        const fbPageId = connection.metadata?.page_id || connection.page_id
        console.log(`[FB TOKEN TYPE] syncPostAnalytics: page_id='${fbPageId || 'MISSING'}'`)
        metrics = await fetchFacebookMetrics(platformId, connection.access_token, fbPageId, userId)
      } else if (platformLower === 'instagram') {
        metrics = await fetchInstagramMetrics(platformId, connection.access_token, userId)
      } else if (platformLower === 'youtube') {
        metrics = await fetchYouTubeMetrics(platformId, process.env.GOOGLE_API_KEY || '', userId)
      }

      if (metrics) {
        const saved = await savePostAnalytics(supabase, postId, platform, metrics)
        results[platform] = saved
      }
    } catch (error) {
      console.error(`[Analytics] Error syncing ${platform}:`, error)
      results[platform] = false
    }
  }

  return results
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MERGE MULTI-PLATFORM METRICS — utility
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function mergeMultiPlatformMetrics(
  platformMetrics: Record<string, PlatformMetrics>
): PlatformMetrics {
  const merged: PlatformMetrics = { ...EMPTY_METRICS }

  Object.values(platformMetrics).forEach((m) => {
    merged.views += m.views
    merged.likes += m.likes
    merged.comments += m.comments
    merged.shares += m.shares
    merged.reach += m.reach
    merged.impressions += m.impressions
    merged.engagement += m.engagement
  })

  // Calculate merged engagement rate
  merged.engagement_rate = merged.impressions > 0
    ? Math.round(((merged.engagement / merged.impressions) * 100) * 100) / 100
    : 0

  return merged
}
