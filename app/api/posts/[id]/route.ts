export const dynamic = 'force-dynamic';
/**
 * Single Post API Route
 * GET, PATCH, DELETE /api/posts/[id]
 * 
 * All operations use Prisma (Neon) — the single source of truth for posts.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/server'
import prisma from '@/lib/prisma'

export const runtime = 'nodejs'

/**
 * GET /api/posts/[id]
 * Get a single post by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth(request)
    const postId = params.id

    const post = await prisma.posts.findUnique({
      where: { id: postId }
    })

    if (!post || post.user_id !== user.id) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    return NextResponse.json({ post })
  } catch (error: any) {
    console.error('[POSTS API] GET /api/posts/[id] error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch post' },
      { status: error.message?.includes('Authentication') ? 401 : 500 }
    )
  }
}

/**
 * PATCH /api/posts/[id]
 * Update a post (save draft, reschedule, etc.)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth(request)
    const postId = params.id

    console.log(`[POSTS API] Updating post ${postId} for user ${user.id}`)

    // Verify post exists and belongs to user
    const existingPost = await prisma.posts.findUnique({
      where: { id: postId }
    })

    if (!existingPost || existingPost.user_id !== user.id) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    const body = await request.json()
    const allowedFields = ['caption', 'media_urls', 'platforms', 'status', 'scheduled_at', 'published_at']
    const updates: Record<string, any> = {}

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (field === 'scheduled_at' || field === 'published_at') {
          updates[field] = body[field] ? new Date(body[field]) : null
        } else {
          updates[field] = body[field]
        }
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const updatedPost = await prisma.posts.update({
      where: { id: postId },
      data: updates
    })

    console.log(`[POSTS API] Updated post ${postId} in Prisma`)

    return NextResponse.json({ post: updatedPost })
  } catch (error: any) {
    console.error('[POSTS API] PATCH /api/posts/[id] error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update post' },
      { status: error.message?.includes('Authentication') ? 401 : 500 }
    )
  }
}

/**
 * DELETE /api/posts/[id]
 * Delete a post
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth(request)
    const postId = params.id

    console.log(`[POSTS API] Deleting post ${postId} for user ${user.id}`)

    // Verify post exists and belongs to user
    const existingPost = await prisma.posts.findUnique({
      where: { id: postId }
    })

    if (!existingPost || existingPost.user_id !== user.id) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    await prisma.posts.delete({
      where: { id: postId }
    })

    console.log(`[POSTS API] Deleted post ${postId} from Prisma`)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[POSTS API] DELETE /api/posts/[id] error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete post' },
      { status: error.message?.includes('Authentication') ? 401 : 500 }
    )
  }
}
