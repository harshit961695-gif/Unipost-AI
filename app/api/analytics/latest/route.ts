export const dynamic = 'force-dynamic';
/**
 * Analytics Latest API Route
 * GET /api/analytics/latest
 * 
 * Reads analytics_snapshots from Neon (Prisma) — the single source of truth.
 * Reads connected_accounts from Supabase — the OAuth token store.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import prisma from '@/lib/prisma';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
    try {
        const user = await requireAuth(request);
        const supabase = createSupabaseServerClient();

        // Check if user has connected any accounts (Supabase — correct owner)
        const { count: accountCount, error: accountError } = await supabase
            .from('connected_accounts')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id);

        if (accountError) throw accountError;

        // Get latest snapshot from analytics_current with fallback (Neon)
        let latest: any = null;
        try {
            const currentStats = await prisma.analytics_current.findUnique({
                where: { user_id: user.id }
            });
            if (currentStats) {
                latest = {
                    ...currentStats,
                    snapshot_date: currentStats.updated_at
                };
            } else {
                latest = await prisma.analytics_snapshots.findFirst({
                    where: { user_id: user.id },
                    orderBy: { snapshot_date: 'desc' },
                });
            }
        } catch (currentErr) {
            console.error('[LATEST API] Failed to fetch analytics_current:', currentErr);
        }

        // Fetch historical for charts (last 20)
        const history = await prisma.analytics_snapshots.findMany({
            where: { user_id: user.id },
            orderBy: { snapshot_date: 'asc' },
            take: 20,
        });

        console.log(`[ANALYTICS] User: ${user.id} | Accounts: ${accountCount} | Snapshots: ${history.length}`);

        return NextResponse.json({
            success: true,
            hasAccounts: (accountCount || 0) > 0,
            latest: latest || null,
            lastUpdated: latest ? latest.snapshot_date : null,
            history: history || []
        });

    } catch (error: any) {
        console.error('[ANALYTICS DB FETCH] Error:', error);
        return NextResponse.json({ error: error.message || 'Failed to fetch snapshot' }, { status: 500 });
    }
}
