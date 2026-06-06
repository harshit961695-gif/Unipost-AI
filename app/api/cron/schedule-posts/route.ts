export const dynamic = 'force-dynamic'
/**
 * Scheduler & Analytics Sync Cron Job API Route
 * POST /api/cron/schedule-posts
 * 
 * This endpoint should be called periodically (e.g., every 5-10 minutes) by:
 * - Vercel Cron Jobs
 * - External cron service (cron-job.org, etc.)
 * - Or manually for testing
 * 
 * It performs one task:
 * Checks for scheduled posts that are due and publishes them
 */
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import prisma from '@/lib/prisma'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'

// Optional: Add a secret token to prevent unauthorized access
const CRON_SECRET = process.env.CRON_SECRET

/**
 * POST /api/cron/schedule-posts
 * Processes scheduled posts that are due
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    const isDevBypass = process.env.BYPASS_AUTH_FOR_TESTING === 'true';

    if (!isDevBypass || authHeader) {
      if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        logger.scheduler.warn('Unauthorized access attempt to deprecated schedule-posts cron endpoint');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    console.log('[CRON] schedule-posts is deprecated. Use /api/schedule/check instead to prevent duplicate execution risk.');
    return NextResponse.json({
      success: true,
      message: 'Deprecated. This endpoint is disabled. Use /api/schedule/check as the single source of truth for scheduling.',
      results: {
        scheduled: { processed: 0, published: 0, failed: 0, errors: [] }
      }
    });
  } catch (error: any) {
    console.error('[CRON] Fatal error:', error)
    logger.scheduler.error('Fatal error in deprecated schedule-posts cron handler', {
        error: error.message,
        stack: error.stack
    });
    return NextResponse.json(
      { error: error.message || 'Cron job failed' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/cron/schedule-posts
 * Health check endpoint
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    const isDevBypass = process.env.BYPASS_AUTH_FOR_TESTING === 'true';

    if (!isDevBypass || authHeader) {
      if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        logger.scheduler.warn('Unauthorized GET access attempt to deprecated schedule-posts cron endpoint');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    return NextResponse.json({
      message: 'Scheduler endpoint is active (Deprecated. Use /api/schedule/check instead)',
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

