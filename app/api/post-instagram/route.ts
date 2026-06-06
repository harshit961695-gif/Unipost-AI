export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { connectionService } from '@/lib/services/connectionService';
import prisma from '@/lib/prisma';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
    try {
        const user = await requireAuth(request);
        const { imageUrl, caption } = await request.json();

        if (!imageUrl) {
            return NextResponse.json({ error: 'Missing imageUrl' }, { status: 400 });
        }

        const supabase = createSupabaseServerClient();

        // Retrieve stored connections for this user
        const { data: connections, error: connectionsError } = await supabase
            .from('platform_connections')
            .select('*')
            .eq('user_id', user.id)
            .eq('platform', 'instagram')
            .eq('status', 'connected');

        if (connectionsError || !connections || connections.length === 0) {
            return NextResponse.json({ error: 'Instagram account not connected' }, { status: 400 });
        }

        const connection = connections[0]; // Assuming one IG connection per user for now

        if (!connection || !connection.access_token || !connection.metadata?.instagramId) {
            return NextResponse.json({ error: 'Instagram token or ID not found' }, { status: 404 });
        }

        const accessToken = connection.access_token;
        const igUserId = connection.metadata.instagramId;

        // Step 1: Create media container
        const createMediaResponse = await fetch(`https://graph.facebook.com/v25.0/${igUserId}/media`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                image_url: imageUrl,
                caption: caption || '',
                access_token: accessToken
            })
        });

        const createMediaData = await createMediaResponse.json();

        if (!createMediaResponse.ok || createMediaData.error) {
            console.error('Instagram Media Creation API Error:', createMediaData.error);
            throw new Error(createMediaData.error?.message || 'Failed to create Instagram media container');
        }

        const creationId = createMediaData.id;
        console.log("IG Creation ID:", creationId);

        // Step 2: Publish the media container
        const publishResponse = await fetch(`https://graph.facebook.com/v25.0/${igUserId}/media_publish`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                creation_id: creationId,
                access_token: accessToken
            })
        });

        const publishData = await publishResponse.json();

        if (!publishResponse.ok || publishData.error) {
            console.error('Instagram Media Publish API Error:', publishData.error);
            throw new Error(publishData.error?.message || 'Failed to publish to Instagram');
        }

        console.log("IG Final Post ID:", publishData.id);

        if (!publishData.id) {
            throw new Error('IG Final Post ID is missing from publish response');
        }

        const savedMediaId = String(publishData.id);
        console.log(`[IG PUBLISH] Saved instagram post ID: ${savedMediaId}`);

        await prisma.post_logs.create({
            data: {
                user_id: user.id,
                platform: 'instagram',
                platform_post_id: savedMediaId,
                status: 'published'
            }
        });

        return NextResponse.json({ success: true, postId: savedMediaId });

    } catch (error: any) {
        console.error('Publish Instagram API Error:', error);
        return NextResponse.json(
            { error: error.message || 'Error occurred while publishing to Instagram' },
            { status: 500 }
        );
    }
}
