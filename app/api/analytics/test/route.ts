/**
 * ANALYTICS PIPELINE TEST ENDPOINT
 * This endpoint validates all components of the analytics system
 * without requiring authentication (for development/debugging)
 */

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const results: Record<string, any> = {
    timestamp: new Date().toISOString(),
    checks: {},
  }

  try {
    // ========================
    // 1. CHECK PRISMA CONNECTION
    // ========================
    console.log('[ANALYTICS TEST] 1. Testing Prisma connection...')
    try {
      const prismaTest = await prisma.$queryRaw`SELECT 1 as connection_test`
      results.checks.prisma_connection = { status: 'OK', message: 'Prisma connected to Neon', query_result: prismaTest }
      console.log('[ANALYTICS TEST] ✓ Prisma connection successful')
    } catch (err: any) {
      results.checks.prisma_connection = { status: 'ERROR', error: err.message }
      console.error('[ANALYTICS TEST] ✗ Prisma connection failed:', err.message)
    }

    // ========================
    // 2. CHECK ANALYTICS_SNAPSHOTS TABLE
    // ========================
    console.log('[ANALYTICS TEST] 2. Testing analytics_snapshots table...')
    try {
      const snapshots = await prisma.analytics_snapshots.findMany({ take: 5 })
      results.checks.analytics_snapshots_table = {
        status: 'OK',
        message: 'Table accessible',
        record_count: snapshots.length,
        sample_records: snapshots.slice(0, 2),
      }
      console.log('[ANALYTICS TEST] ✓ analytics_snapshots table OK, found', snapshots.length, 'records')
    } catch (err: any) {
      results.checks.analytics_snapshots_table = { status: 'ERROR', error: err.message }
      console.error('[ANALYTICS TEST] ✗ analytics_snapshots table error:', err.message)
    }

    // ========================
    // 2b. CHECK ANALYTICS_CURRENT TABLE
    // ========================
    console.log('[ANALYTICS TEST] 2b. Testing analytics_current table...')
    try {
      const current = await prisma.analytics_current.findMany({ take: 5 })
      results.checks.analytics_current_table = {
        status: 'OK',
        message: 'Table accessible',
        record_count: current.length,
        sample_records: current.slice(0, 2),
      }
      console.log('[ANALYTICS TEST] ✓ analytics_current table OK, found', current.length, 'records')
    } catch (err: any) {
      results.checks.analytics_current_table = { status: 'ERROR', error: err.message }
      console.error('[ANALYTICS TEST] ✗ analytics_current table error:', err.message)
    }

    // ========================
    // 2c. CHECK ANALYTICS_DAILY TABLE
    // ========================
    console.log('[ANALYTICS TEST] 2c. Testing analytics_daily table...')
    try {
      const daily = await prisma.analytics_daily.findMany({ take: 5 })
      results.checks.analytics_daily_table = {
        status: 'OK',
        message: 'Table accessible',
        record_count: daily.length,
        sample_records: daily.slice(0, 2),
      }
      console.log('[ANALYTICS TEST] ✓ analytics_daily table OK, found', daily.length, 'records')
    } catch (err: any) {
      results.checks.analytics_daily_table = { status: 'ERROR', error: err.message }
      console.error('[ANALYTICS TEST] ✗ analytics_daily table error:', err.message)
    }

    // ========================
    // 3. CHECK POST_LOGS TABLE
    // ========================
    console.log('[ANALYTICS TEST] 3. Testing post_logs table...')
    try {
      const postLogs = await prisma.post_logs.findMany({ take: 5 })
      results.checks.post_logs_table = {
        status: 'OK',
        message: 'Table accessible',
        record_count: postLogs.length,
        sample_records: postLogs.slice(0, 2),
      }
      console.log('[ANALYTICS TEST] ✓ post_logs table OK, found', postLogs.length, 'records')
    } catch (err: any) {
      results.checks.post_logs_table = { status: 'ERROR', error: err.message }
      console.error('[ANALYTICS TEST] ✗ post_logs table error:', err.message)
    }

    // ========================
    // 4. CHECK SUPABASE CONNECTION
    // ========================
    console.log('[ANALYTICS TEST] 4. Testing Supabase connection...')
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

      if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('Missing Supabase environment variables')
      }

      const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { persistSession: false, autoRefreshToken: false }
      })

      const { data: accounts, error } = await supabase
        .from('connected_accounts')
        .select('*')
        .limit(1)

      if (error) throw error

      results.checks.supabase_connection = {
        status: 'OK',
        message: 'Supabase connected',
        connected_accounts_sample: accounts?.length || 0,
      }
      console.log('[ANALYTICS TEST] ✓ Supabase connection OK')
    } catch (err: any) {
      results.checks.supabase_connection = { status: 'ERROR', error: err.message }
      console.error('[ANALYTICS TEST] ✗ Supabase connection error:', err.message)
    }

    // ========================
    // 5. CHECK ENVIRONMENT VARIABLES
    // ========================
    console.log('[ANALYTICS TEST] 5. Checking environment variables...')
    const envCheck = {
      DATABASE_URL: !!process.env.DATABASE_URL ? '✓' : '✗',
      NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL ? '✓' : '✗',
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY ? '✓' : '✗',
      CRON_SECRET: !!process.env.CRON_SECRET ? '✓' : '✗',
      GOOGLE_API_KEY: !!process.env.GOOGLE_API_KEY ? '✓' : '✗',
    }
    results.checks.environment_variables = {
      status: 'OK',
      variables: envCheck,
    }
    console.log('[ANALYTICS TEST] ✓ Environment variables check complete')

    // ========================
    // 6. CHECK FETCH-ANALYTICS ENDPOINT
    // ========================
    console.log('[ANALYTICS TEST] 6. Testing fetch-analytics endpoint...')
    try {
      const response = await fetch(
        `http://localhost:3001/api/fetch-analytics?test=true`,
        { headers: { 'User-Agent': 'Analytics-Test-Suite' } }
      )
      const data = await response.json()
      results.checks.fetch_analytics_endpoint = {
        status: response.ok ? 'OK' : 'ERROR',
        status_code: response.status,
        message: data.success ? 'Endpoint accessible' : 'Endpoint returned error',
        processed_users: data.processed_users || 0,
        platforms: data.platforms_checked || [],
      }
      console.log('[ANALYTICS TEST] ✓ fetch-analytics endpoint OK, processed', data.processed_users, 'users')
    } catch (err: any) {
      results.checks.fetch_analytics_endpoint = { status: 'ERROR', error: err.message }
      console.error('[ANALYTICS TEST] ✗ fetch-analytics endpoint error:', err.message)
    }

    // ========================
    // SUMMARY
    // ========================
    const allOK = Object.values(results.checks).every(
      (check: any) => check.status === 'OK'
    )

    results.summary = {
      overall_status: allOK ? 'HEALTHY' : 'WARNING',
      total_checks: Object.keys(results.checks).length,
      passed_checks: Object.values(results.checks).filter(
        (check: any) => check.status === 'OK'
      ).length,
      message: allOK
        ? 'All analytics pipeline components are operational'
        : 'Some components need attention - see checks for details',
    }

    console.log('[ANALYTICS TEST] ===== TEST COMPLETE =====')
    console.log('[ANALYTICS TEST] Status:', results.summary.overall_status)

    return NextResponse.json(results)
  } catch (error: any) {
    console.error('[ANALYTICS TEST] FATAL ERROR:', error)
    results.error = error.message
    return NextResponse.json({ ...results, status: 'CRITICAL_ERROR' }, { status: 500 })
  }
}
