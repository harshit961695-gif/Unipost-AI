export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { connectionService } from '@/lib/services/connectionService';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { notificationService } from '@/lib/services/notificationService';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
    let user = null;
    try {
        user = await requireAuth(request);

        const formData = await request.formData();
        const type = formData.get('type') as string;
        const caption = formData.get('caption') as string;
        const media = formData.get('media') as File;

        if (!type || !['post', 'reel', 'story'].includes(type)) {
            return NextResponse.json({ error: 'Invalid post type' }, { status: 400 });
        }

        if (!media && type !== 'post') { // allow text only posts theoretically, but our UI requires media for now
            return NextResponse.json({ error: 'Media file is required' }, { status: 400 });
        }

        const supabase = createSupabaseServerClient();
        const { data: connection, error: connectionError } = await connectionService.getConnection(user.id, 'facebook', supabase);

        if (connectionError || !connection) {
            return NextResponse.json({ error: 'Facebook account not connected' }, { status: 400 });
        }

        // page_id is stored inside metadata JSONB, NOT as a top-level column
        const pageId = connection.metadata?.page_id || connection.page_id;
        const pageAccessToken = connection.access_token;

        if (!pageId || !pageAccessToken) {
            return NextResponse.json({ error: 'Incomplete Facebook connection data' }, { status: 500 });
        }

        let fbUrl = `https://graph.facebook.com/v25.0/${pageId}/feed`;

        // If media is present, the spec allows hitting /photos endpoint. 
        // For text-only, we strictly use URLSearchParams to /feed.
        let fbBody: any;

        if (media && type === 'post') {
            fbUrl = `https://graph.facebook.com/v25.0/${pageId}/photos`;
            const fbFormData = new FormData();
            fbFormData.append('access_token', pageAccessToken);
            if (caption) fbFormData.append('caption', caption);
            fbFormData.append('source', media);
            fbBody = fbFormData;
        } else {
            fbBody = new URLSearchParams({
                message: caption || '',
                access_token: pageAccessToken,
            });
        }

        const response = await fetch(fbUrl, {
            method: "POST",
            body: fbBody,
        });

        const data = await response.json();

        if (!response.ok) {
            logger.publish.error(`Facebook API error on direct publish for user ${user.id}`, {
                error: data,
                status: response.status
            });
            return NextResponse.json({ success: false, error: data }, { status: response.status });
        }

        // Save to post_logs — use post_id (compound pageId_postId) if available, else id
        const fbPostId = String(data.post_id || data.id);
        console.log(`[FB PUBLISH] Returned post ID: ${fbPostId}`);

        try {
            await prisma.post_logs.create({
                data: {
                    user_id: user.id,
                    platform: 'facebook',
                    platform_post_id: fbPostId,
                    status: 'published',
                    content: caption || '',
                }
            });
            console.log(`[FB PUBLISH] Saved post_log with platform_post_id: ${fbPostId}`);
        } catch (logErr: any) {
            console.error(`[FB PUBLISH] Failed to save post_log:`, logErr.message);
            logger.publish.error(`Failed to save post_log in database for Facebook publish`, {
                userId: user.id,
                fbPostId,
                error: logErr.message,
                stack: logErr.stack
            });
        }

        // Save to posts table as well
        try {
            await prisma.posts.create({
                data: {
                    user_id: user.id,
                    caption: caption || '',
                    media_urls: [],
                    platforms: ['facebook'],
                    status: 'published',
                    published_at: new Date(),
                    facebook_post_id: fbPostId,
                }
            });
            console.log(`[FB PUBLISH] Saved posts record with facebook_post_id: ${fbPostId}`);
        } catch (postErr: any) {
            console.error(`[FB PUBLISH] Failed to save posts record:`, postErr.message);
            logger.publish.error(`Failed to save posts record in database for Facebook publish`, {
                userId: user.id,
                fbPostId,
                error: postErr.message,
                stack: postErr.stack
            });
        }

        // Trigger Success Notification
        await notificationService.createNotification(
            user.id,
            'publish_success',
            'Post Published Successfully',
            'Your Facebook/Instagram/YouTube post has been published successfully.',
            { fbPostId }
        );

        return NextResponse.json({ success: true, data });

    } catch (error: any) {
        console.error('Publish Facebook Error:', error);
        logger.publish.error(`Failed to publish to Facebook for user ${user ? user.id : 'unknown'}`, {
            error: error.message,
            stack: error.stack
        });
        if (user) {
            const errMsg = (error.message || '').toLowerCase();
            const isTokenExpired = errMsg.includes('token') || errMsg.includes('connect') || errMsg.includes('session') || errMsg.includes('auth');
            
            await notificationService.createNotification(
                user.id,
                'publish_failed_facebook',
                'Post Publishing Failed',
                'Publishing failed on Facebook.\nView logs for details.',
                { platform: 'facebook', error: error.message }
            );

            if (isTokenExpired) {
                await notificationService.createNotification(
                    user.id,
                    'account_expired_facebook',
                    'Reconnect Facebook',
                    'Facebook connection expired.\nReconnect your account.'
                );
            }
        }
        return NextResponse.json(
            { error: error.message || 'Failed to publish to Facebook' },
            { status: 500 }
        );
    }
}
