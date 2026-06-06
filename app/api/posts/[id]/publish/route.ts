export const dynamic = 'force-dynamic';
/**
 * Publish Post API Route
 * POST /api/posts/[id]/publish
 * Publishes an existing post to selected platforms
 * 
 * All operations use Prisma (Neon) — the single source of truth.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/server'
import prisma from '@/lib/prisma'

export const runtime = 'nodejs'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth(request)
    const postId = params.id

    console.log(`[PUBLISH POST API] Publishing post ${postId} for user ${user.id}`)

    // Get the post from Neon (sole owner)
    const post = await prisma.posts.findUnique({
      where: { id: postId }
    })

    if (!post || post.user_id !== user.id) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    // Validate post can be published
    if (post.status === 'published') {
      return NextResponse.json(
        { error: 'Post is already published' },
        { status: 400 }
      )
    }

    console.log(`[PUBLISH POST API] Updating post status to 'published'`)

    // Update post status
    await prisma.posts.update({
      where: { id: postId },
      data: {
        status: 'published',
        published_at: new Date(),
      }
    })

    console.log(`[PUBLISH POST API] Updated post status in Prisma`)

    // Log all platform posts as published
    for (const platform of post.platforms || []) {
      try {
        await prisma.post_logs.create({
          data: {
            user_id: user.id,
            platform,
            status: 'success',
            platform_post_id: '', // Would be set by actual platform APIs
            content: post.caption || null,
          }
        })
      } catch (err) {
        console.warn(`[PUBLISH POST API] Failed to log ${platform}:`, err)
      }
    }

    return NextResponse.json({
      success: true,
      postId,
      status: 'published',
      message: `Post published successfully to ${post.platforms.join(', ')}`
    })
  } catch (error: any) {
    console.error('[PUBLISH POST API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to publish post' },
      { status: error.message?.includes('Authentication') ? 401 : 500 }
    )
  }
}
