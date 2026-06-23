export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import prisma from '@/lib/prisma';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
    try {
        const user = await requireAuth(request);
        const userId = user.id;

        console.log(`[DASHBOARD STATS] Verified User ID: ${userId}`);

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL || '',
            process.env.SUPABASE_SERVICE_ROLE_KEY || '',
            { auth: { persistSession: false, autoRefreshToken: false } }
        );

        // Run all four main database queries concurrently to minimize network latency impact
        const [accountsResult, postsResult, currentStatsResult, snapCountResult] = await Promise.all([
            supabase
                .from('connected_accounts')
                .select('*')
                .eq('user_id', userId),
            prisma.post_logs.findMany({
                where: { user_id: userId },
                orderBy: { created_at: 'desc' }
            }).catch((prismaErr) => {
                console.error('[DASHBOARD STATS] Neon post_logs fetch failed:', prismaErr.message);
                return [] as any[];
            }),
            prisma.analytics_current.findUnique({
                where: { user_id: userId }
            }).catch((prismaErr) => {
                console.error('[DASHBOARD STATS] Neon analytics_current fetch failed:', prismaErr.message);
                return null;
            }),
            prisma.analytics_snapshots.count({
                where: { user_id: userId }
            }).catch((prismaErr) => {
                console.error('[DASHBOARD STATS] Neon snapshot count failed:', prismaErr.message);
                return 0;
            })
        ]);

        const accounts = accountsResult.data;
        const accErr = accountsResult.error;
        console.log(`[DASHBOARD STATS] connected_accounts query:`, { count: accounts?.length, error: accErr?.message });

        const allPosts = postsResult as any[];
        console.log(`[DASHBOARD STATS] post_logs query:`, { count: allPosts.length });

        const successPosts = allPosts.filter(p => p.status === 'success' || p.status === 'published').length;
        const totalPosts = successPosts; // Only successful posts count as Total Posts under Rule 6
        const failedPosts = allPosts.filter(p => p.status === 'failed' || p.status === 'failure').length;
        const recentPosts = allPosts.slice(0, 8);

        // Aggregate live totals directly from post_logs (allPosts)
        const totalViews = allPosts.reduce((sum, p) => sum + (p.views || 0), 0);
        const totalLikes = allPosts.reduce((sum, p) => sum + (p.likes || 0), 0);
        const totalComments = allPosts.reduce((sum, p) => sum + (p.comments || 0), 0);
        const totalReach = allPosts.reduce((sum, p) => sum + (p.reach || 0), 0);
        const totalImpressions = allPosts.reduce((sum, p) => sum + (p.impressions || 0), 0);
        const totalEngagement = allPosts.reduce((sum, p) => sum + (p.engagement || 0), 0);

        // Derive connected platforms from BOTH connected_accounts AND post_logs
        const platformsFromAccounts = (accounts || []).map(a => a.platform?.toLowerCase()).filter(Boolean);
        const platformsFromPosts = [...new Set(allPosts.map(p => p.platform?.toLowerCase()).filter(Boolean))];
        const connectedPlatforms = [...new Set([...platformsFromAccounts, ...platformsFromPosts])];

        // If we have connected_accounts OR posts, user has accounts
        const hasAccounts = connectedPlatforms.length > 0;

        console.log(`[DASHBOARD STATS] hasAccounts: ${hasAccounts}, platforms: ${connectedPlatforms}`);

        // 3. Platform breakdown from post_logs
        const platformStats: Record<string, any> = {};
        connectedPlatforms.forEach(p => {
            platformStats[p] = { posts: 0, success: 0, views: 0, likes: 0, comments: 0, reach: 0, impressions: 0, engagement: 0 };
        });

        allPosts.forEach(post => {
            const p = (post.platform || '').toLowerCase();
            if (!platformStats[p]) {
                platformStats[p] = { posts: 0, success: 0, views: 0, likes: 0, comments: 0, reach: 0, impressions: 0, engagement: 0 };
            }
            const isSuccessful = post.status === 'success' || post.status === 'published';
            if (isSuccessful) {
                platformStats[p].posts += 1;
                platformStats[p].success += 1;
                platformStats[p].views += (post.views || 0);
                platformStats[p].likes += (post.likes || 0);
                platformStats[p].comments += (post.comments || 0);
                platformStats[p].reach += (post.reach || 0);
                platformStats[p].impressions += (post.impressions || 0);
                platformStats[p].engagement += (post.engagement || 0);
            }
        });

        console.log(`[DASHBOARD STATS] Platform Stats computed:`, JSON.stringify(platformStats, null, 2));

        // 4. Latest analytics snapshot via analytics_current with fallback (Neon)
        const currentStats = currentStatsResult;
        let latestSnap: any = null;
        if (currentStats) {
            latestSnap = {
                ...currentStats,
                snapshot_date: currentStats.updated_at
            };
        } else {
            try {
                latestSnap = await prisma.analytics_snapshots.findFirst({
                    where: { user_id: userId },
                    orderBy: { created_at: 'desc' }
                });
            } catch (prismaErr: any) {
                console.error('[DASHBOARD STATS] Neon analytics_snapshots fallback findFirst failed:', prismaErr.message);
            }
        }

        // 5. Snapshot count via Prisma (Neon)
        const snapCount = snapCountResult as number;

        return NextResponse.json({
            success: true,
            hasAccounts,
            connectedPlatforms,
            totalPosts,
            successPosts,
            failedPosts,
            totalAttempts: successPosts + failedPosts,
            platformStats,
            recentPosts,
            latestSnapshot: latestSnap || null,
            snapshotCount: snapCount || 0,
            lastUpdated: new Date().toISOString(),
            totalViews,
            totalLikes,
            totalComments,
            totalReach,
            totalImpressions,
            totalEngagement
        });

    } catch (error: any) {
        console.error('Dashboard Stats API Error:', error);
        return NextResponse.json({ error: error.message || 'Failed to fetch dashboard stats' }, { status: 500 });
    }
}
