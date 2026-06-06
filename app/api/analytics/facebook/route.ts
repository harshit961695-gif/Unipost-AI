export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"

// Basic in-memory cache to prevent hitting Meta Graph API rate limits
// Key: userId, Value: { data: any, timestamp: number }
const CACHE_DURATION_MS = 60 * 1000 // 60 seconds
const analyticsCache = new Map<string, { data: any, timestamp: number }>()

export async function GET(request: NextRequest) {
    try {
        const supabase = createSupabaseServerClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const userId = user.id

        // 1. Check Cache
        const cachedEntry = analyticsCache.get(userId)
        const now = Date.now()

        if (cachedEntry && (now - cachedEntry.timestamp < CACHE_DURATION_MS)) {
            return NextResponse.json({ ...cachedEntry.data, _cached: true, _timestamp: cachedEntry.timestamp }, { status: 200 })
        }

        // 2. Fetch connection from DB
        const { data: connection, error: connError } = await supabase
            .from('connected_accounts')
            .select('*')
            .eq('user_id', userId)
            .eq('platform', 'facebook')
            .neq('access_token', '')
            .limit(1)
            .maybeSingle()

        if (connError || !connection) {
            return NextResponse.json({
                connected: false,
                followers: 0,
                pageName: '',
                _timestamp: now
            }, { status: 200 })
        }

        const pageId = connection.metadata?.page_id || connection.page_id
        const pageAccessToken = connection.metadata?.page_access_token || connection.access_token

        if (!pageId || !pageAccessToken) {
            return NextResponse.json({
                connected: false,
                followers: 0,
                pageName: '',
                _timestamp: now
            }, { status: 200 })
        }

        // 3. Fetch from Facebook Graph API
        const url = `https://graph.facebook.com/v25.0/${pageId}?fields=fan_count,followers_count,name&access_token=${pageAccessToken}`
        const res = await fetch(url)
        const data = await res.json()

        if (data.error) {
            console.error('[FACEBOOK ANALYTICS API] Graph API Error:', data.error)
            // If token is invalid/expired, return blank state but connected: false
            if (data.error.code === 190) {
                return NextResponse.json({
                    connected: false,
                    followers: 0,
                    pageName: connection.metadata?.page_name || 'Facebook Page',
                    error: 'Token expired',
                    _timestamp: now
                }, { status: 200 })
            }
            throw new Error(data.error.message || 'Facebook API Error')
        }

        const followers = data.fan_count || data.followers_count || 0
        const pageName = data.name || connection.metadata?.page_name || 'Facebook Page'

        const result = {
            connected: true,
            followers,
            pageName,
            _timestamp: now
        }

        // 4. Update Cache
        analyticsCache.set(userId, { data: result, timestamp: now })

        return NextResponse.json({ ...result, _cached: false }, { status: 200 })

    } catch (error: any) {
        console.error("[FACEBOOK ANALYTICS API] Error Boundary Caught Exception:", error)
        return NextResponse.json({
            error: error.message || 'Unknown Facebook API failure during analytics fetch',
            type: 'FACEBOOK_API_ERROR'
        }, { status: 500 })
    }
}
