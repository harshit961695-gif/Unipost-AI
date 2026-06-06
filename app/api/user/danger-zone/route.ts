export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import prisma from "@/lib/prisma"

export async function POST(request: NextRequest) {
    try {
        const supabase = createSupabaseServerClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json()
        const { action } = body

        if (!action) {
            return NextResponse.json({ error: 'Missing action parameter' }, { status: 400 })
        }

        const userId = user.id

        if (action === 'disconnect-all') {
            console.log(`[DANGER ZONE] Disconnecting all platforms for user ${userId}`)
            
            // Query all active connections
            const { data: connections, error: fetchErr } = await supabase
                .from('connected_accounts')
                .select('platform')
                .eq('user_id', userId)
                .neq('access_token', '')

            if (fetchErr) throw fetchErr

            if (connections && connections.length > 0) {
                // Set tokens to empty for all platforms
                const { error: updateErr } = await supabase
                    .from('connected_accounts')
                    .update({
                        access_token: '',
                        refresh_token: '',
                        expires_at: null
                    })
                    .eq('user_id', userId)

                if (updateErr) throw updateErr
            }

            return NextResponse.json({ success: true, message: 'All platforms disconnected' })
        }

        if (action === 'delete-analytics') {
            console.log(`[DANGER ZONE] Deleting analytics snapshots for user ${userId}`)

            // Delete from Neon (Prisma — sole owner of analytics_snapshots, current, daily)
            try {
                await prisma.analytics_snapshots.deleteMany({
                    where: { user_id: userId }
                })
                await prisma.analytics_current.deleteMany({
                    where: { user_id: userId }
                })
                await prisma.analytics_daily.deleteMany({
                    where: { user_id: userId }
                })
            } catch (prismaErr: any) {
                console.error('[DANGER ZONE] Failed to delete analytics snapshots:', prismaErr.message)
                throw prismaErr
            }

            return NextResponse.json({ success: true, message: 'Analytics snapshots cleared successfully' })
        }

        if (action === 'delete-account') {
            console.log(`[DANGER ZONE] Purging all data and deleting account for user ${userId}`)

            // 1. Delete all Neon (Prisma) records
            try {
                await prisma.posts.deleteMany({ where: { user_id: userId } })
                await prisma.post_logs.deleteMany({ where: { user_id: userId } })
                await prisma.analytics_snapshots.deleteMany({ where: { user_id: userId } })
                await prisma.analytics_current.deleteMany({ where: { user_id: userId } })
                await prisma.analytics_daily.deleteMany({ where: { user_id: userId } })
            } catch (prismaErr: any) {
                console.error('[DANGER ZONE] Neon database cleanup failed:', prismaErr.message)
            }

            // 2. Delete connected_accounts from Supabase (sole owner)
            const { error: sbConnErr } = await supabase.from('connected_accounts').delete().eq('user_id', userId)
            if (sbConnErr) console.error('[DANGER ZONE] Supabase connected_accounts delete error:', sbConnErr.message)

            // 3. Delete auth account via Supabase admin service role
            const adminSupabase = createClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.SUPABASE_SERVICE_ROLE_KEY!,
                { auth: { persistSession: false, autoRefreshToken: false } }
            )

            const { error: adminDeleteErr } = await adminSupabase.auth.admin.deleteUser(userId)
            if (adminDeleteErr) {
                console.error('[DANGER ZONE] Supabase Auth user delete failed:', adminDeleteErr.message)
                throw adminDeleteErr
            }

            return NextResponse.json({ success: true, message: 'Account and all data deleted' })
        }

        return NextResponse.json({ error: 'Invalid action specified' }, { status: 400 })

    } catch (error: any) {
        console.error("[DANGER ZONE API] Exception:", error)
        return NextResponse.json({
            error: error.message || 'Action failed',
            success: false
        }, { status: 500 })
    }
}
