export const dynamic = 'force-dynamic'
/**
 * Posts API Route
 * Handles: GET (list posts), POST (create/save draft)
 * 
 * Migrated to Prisma (Neon) — the single source of truth for posts.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/server'
import prisma from '@/lib/prisma'

export const runtime = 'nodejs'

/**
 * GET /api/posts
 * List all posts for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request)

    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status') || undefined
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    const posts = await prisma.posts.findMany({
      where: {
        user_id: user.id,
        ...(status ? { status } : {}),
      },
      orderBy: { created_at: 'desc' },
      take: limit,
      skip: offset,
    })

    return NextResponse.json({ posts })
  } catch (error: any) {
    console.error('GET /api/posts error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch posts' },
      { status: error.message?.includes('Authentication') ? 401 : 500 }
    )
  }
}

/**
 * POST /api/posts
 * Create a new post or save as draft
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    const body = await request.json()
    const { caption, platforms, media_urls, scheduled_at, status = 'draft' } = body

    // Validation
    if (!caption?.trim()) {
      return NextResponse.json({ error: 'Caption is required' }, { status: 400 })
    }

    if (!platforms?.length) {
      return NextResponse.json({ error: 'At least one platform is required' }, { status: 400 })
    }

    // Determine status
    let finalStatus = status
    let scheduledAt = null

    if (scheduled_at) {
      const parsedDate = new Date(scheduled_at)
      if (isNaN(parsedDate.getTime())) {
        return NextResponse.json({ error: 'Invalid scheduled_at date format' }, { status: 400 })
      }
      scheduledAt = parsedDate
    }

    if (scheduledAt && scheduledAt > new Date()) {
      finalStatus = 'scheduled'
    } else if (status === 'draft') {
      scheduledAt = null
    }

    // Create post in Neon via Prisma
    const post = await prisma.posts.create({
      data: {
        user_id: user.id,
        caption: caption.trim(),
        media_urls: media_urls || [],
        platforms,
        status: finalStatus,
        scheduled_at: scheduledAt,
        published_at: finalStatus === 'published' ? new Date() : null,
      }
    })

    console.log(`[POSTS API] Created post ${post.id} (status: ${finalStatus}) via Prisma`)

    return NextResponse.json({ post }, { status: 201 })
  } catch (error: any) {
    console.error('POST /api/posts error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create post' },
      { status: error.message?.includes('Authentication') ? 401 : 500 }
    )
  }
}
