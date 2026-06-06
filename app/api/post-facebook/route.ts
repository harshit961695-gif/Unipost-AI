export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { connectionService } from '@/lib/services/connectionService';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
    try {
        const user = await requireAuth(request);
        const { message, pageId } = await request.json();

        if (!message || !pageId) {
            return NextResponse.json({ error: 'Missing message or pageId' }, { status: 400 });
        }

        const supabase = createSupabaseServerClient();

        // Retrieve stored connections for this user
        const { data: connections, error: connectionsError } = await supabase
            .from('platform_connections')
            .select('*')
            .eq('user_id', user.id)
            .eq('platform', 'facebook')
            .eq('status', 'connected');

        if (connectionsError || !connections || connections.length === 0) {
            return NextResponse.json({ error: 'Facebook account not connected' }, { status: 400 });
        }

        // Find the right token for the requested pageId
        const connection = connections.find(c => c.metadata?.pageId === pageId);

        if (!connection || !connection.access_token) {
            return NextResponse.json({ error: 'Page access token not found' }, { status: 404 });
        }

        const accessToken = connection.access_token;

        // Post to Facebook Graph API
        const fbResponse = await fetch(`https://graph.facebook.com/v25.0/${pageId}/feed`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: message,
                access_token: accessToken
            })
        });

        const fbData = await fbResponse.json();
        console.log(`[FB PUBLISH] Raw API response:`, JSON.stringify(fbData));

        if (!fbResponse.ok || fbData.error) {
            console.error('Facebook Graph API Error:', fbData.error);
            throw new Error(fbData.error?.message || 'Failed to post to Facebook');
        }

        // Prefer post_id (compound pageId_postId) for photos — it's queryable for engagement.
        // For feed text posts, only fbData.id is returned.
        const savedPostId = String(fbData.post_id || fbData.id);
        console.log(`[FB PUBLISH] Saved facebook post ID: ${savedPostId}`);

        return NextResponse.json({ success: true, postId: savedPostId });

    } catch (error: any) {
        console.error('Publish Facebook API Error:', error);
        return NextResponse.json(
            { error: error.message || 'Error occurred while publishing to Facebook' },
            { status: 500 }
        );
    }
}
