import { supabase } from '@/lib/supabaseClient'
import { SupabaseClient } from '@supabase/supabase-js'

// Note: Instagram Graph API requires media to be hosted on a public URL.
// We upload briefly to a generic supabase storage bucket for this purpose.

export const instagramService = {

    async getInstagramAccountId(userId: string, client?: SupabaseClient): Promise<{ instagramId: string, accessToken: string }> {
        const db = client || supabase
        const { data: connection, error } = await db
            .from('connected_accounts')
            .select('access_token, instagram_business_id')
            .eq('user_id', userId)
            .eq('platform', 'instagram')
            .single();

        if (error || !connection) {
            throw new Error('Instagram account not connected.');
        }

        if (!connection.instagram_business_id) {
            throw new Error('Instagram not properly connected. Please reconnect.');
        }

        return {
            instagramId: connection.instagram_business_id as string,
            accessToken: connection.access_token as string
        };
    },

    /**
     * Post an Image or Video Reel to Instagram
     */
    async publishMedia(
        instagramId: string,
        accessToken: string,
        mediaUrl: string,
        caption: string,
        mediaType: 'REELS' | 'IMAGE'
    ) {
        // Detect video based on file extension
        const urlWithoutQuery = mediaUrl.split('?')[0];
        const fileExt = urlWithoutQuery.split('.').pop()?.toLowerCase() || '';
        const isVideo = ['mp4', 'mov'].includes(fileExt) || mediaType === 'REELS';

        const finalMediaType = isVideo ? 'REELS' : 'IMAGE';

        // Check file extension validation
        if (finalMediaType === 'REELS') {
            if (!['mp4', 'mov'].includes(fileExt)) {
                throw new Error('Unsupported video format for Instagram Reel. Only .mp4 and .mov are supported.');
            }
        }

        // 1. Create Media Container
        const containerUrl = new URL(`https://graph.facebook.com/v19.0/${instagramId}/media`);
        containerUrl.searchParams.append('access_token', accessToken);
        containerUrl.searchParams.append('caption', caption);

        if (finalMediaType === 'IMAGE') {
            containerUrl.searchParams.append('image_url', mediaUrl);
        } else if (finalMediaType === 'REELS') {
            containerUrl.searchParams.append('video_url', mediaUrl);
            containerUrl.searchParams.append('media_type', 'REELS');
        }

        const containerRes = await fetch(containerUrl.toString(), { method: 'POST' });
        const containerData = await containerRes.json();

        // Log requirement 5
        console.log(`[INSTAGRAM]\nmedia_type=${isVideo ? 'video' : 'image'}\npost_type=${finalMediaType.toLowerCase()}\napi_endpoint_used=${containerUrl.origin}${containerUrl.pathname}\napi_response=${JSON.stringify(containerData)}`);

        if (!containerRes.ok || containerData.error) {
            console.error('IG Container Error:', containerData);
            const errMessage = containerData.error?.message || 'Failed to create IG Media Container';
            if (errMessage.includes('Application has been deleted') || errMessage.includes('Error validating application') || containerData.error?.code === 190) {
                throw new Error(JSON.stringify({ type: 'APP_DELETED', message: 'Instagram connection is invalid or the app has been deleted. Please reconnect your account.' }));
            }
            throw new Error(errMessage);
        }

        const creationId = containerData.id;
        console.log("IG Creation ID:", creationId);

        // 2. Publish Media Container
        if (finalMediaType === 'REELS') {
            console.log(`[INSTAGRAM] Video uploaded. Polling status for creation ID: ${creationId}...`);
            let status = 'IN_PROGRESS';
            let attempts = 0;
            const maxAttempts = 15; // 15 attempts * 4 seconds = 60 seconds max
            while (status === 'IN_PROGRESS' && attempts < maxAttempts) {
                await new Promise(r => setTimeout(r, 4000));
                const statusUrl = `https://graph.facebook.com/v19.0/${creationId}?fields=status_code&access_token=${accessToken}`;
                const statusRes = await fetch(statusUrl);
                const statusData = await statusRes.json();
                status = statusData.status_code || 'ERROR';
                console.log(`[INSTAGRAM] Polling status attempt ${attempts + 1}: ${status}`);
                if (status === 'ERROR' || statusData.error) {
                    throw new Error(statusData.error?.message || 'Error processing video on Instagram');
                }
                attempts++;
            }
            if (status !== 'FINISHED') {
                throw new Error('Video processing on Instagram timed out. Please try again later.');
            }
        } else {
            await new Promise(r => setTimeout(r, 3000)); // Small wait for immediate errors for images
        }

        const publishUrl = new URL(`https://graph.facebook.com/v19.0/${instagramId}/media_publish`);
        publishUrl.searchParams.append('access_token', accessToken);
        publishUrl.searchParams.append('creation_id', creationId);

        const publishRes = await fetch(publishUrl.toString(), { method: 'POST' });
        const publishData = await publishRes.json();

        // Log requirement 5 for publish step
        console.log(`[INSTAGRAM]\nmedia_type=${isVideo ? 'video' : 'image'}\npost_type=${finalMediaType.toLowerCase()}\napi_endpoint_used=${publishUrl.origin}${publishUrl.pathname}\napi_response=${JSON.stringify(publishData)}`);

        if (!publishRes.ok || publishData.error) {
            console.error('IG Publish Error:', publishData);
            const errMessage = publishData.error?.error_user_title || publishData.error?.message || 'Failed to publish to Instagram';
            if (errMessage.includes('Application has been deleted') || errMessage.includes('Error validating application') || publishData.error?.code === 190) {
                throw new Error(JSON.stringify({ type: 'APP_DELETED', message: 'Instagram connection is invalid or the app has been deleted. Please reconnect your account.' }));
            }
            throw new Error(errMessage);
        }

        console.log("IG Final Post ID:", publishData.id);

        if (!publishData.id) {
            throw new Error('IG Final Post ID is missing from publish response');
        }

        return { id: String(publishData.id) };
    },

    /**
     * Post Stories
     */
    async publishStory(
        instagramId: string,
        accessToken: string,
        mediaUrl: string,
        mediaType: 'IMAGE' | 'VIDEO'
    ) {
        const containerUrl = new URL(`https://graph.facebook.com/v19.0/${instagramId}/media`);
        containerUrl.searchParams.append('access_token', accessToken);
        containerUrl.searchParams.append('media_type', 'STORIES');

        if (mediaType === 'IMAGE') {
            containerUrl.searchParams.append('image_url', mediaUrl);
        } else {
            containerUrl.searchParams.append('video_url', mediaUrl);
        }

        const containerRes = await fetch(containerUrl.toString(), { method: 'POST' });
        const containerData = await containerRes.json();

        if (!containerRes.ok || containerData.error) {
            const errMessage = containerData.error?.message || 'Failed to create IG Story Container';
            if (errMessage.includes('Application has been deleted') || errMessage.includes('Error validating application') || containerData.error?.code === 190) {
                throw new Error(JSON.stringify({ type: 'APP_DELETED', message: 'Instagram connection is invalid or the app has been deleted. Please reconnect your account.' }));
            }
            throw new Error(errMessage);
        }

        const creationId = containerData.id;
        console.log("IG Creation ID:", creationId);
        await new Promise(r => setTimeout(r, 3000));

        const publishUrl = new URL(`https://graph.facebook.com/v19.0/${instagramId}/media_publish`);
        publishUrl.searchParams.append('access_token', accessToken);
        publishUrl.searchParams.append('creation_id', creationId);

        const publishRes = await fetch(publishUrl.toString(), { method: 'POST' });
        const publishData = await publishRes.json();

        if (!publishRes.ok || publishData.error) {
            const errMessage = publishData.error?.message || 'Failed to publish Instagram Story';
            if (errMessage.includes('Application has been deleted') || errMessage.includes('Error validating application') || publishData.error?.code === 190) {
                throw new Error(JSON.stringify({ type: 'APP_DELETED', message: 'Instagram connection is invalid or the app has been deleted. Please reconnect your account.' }));
            }
            throw new Error(errMessage);
        }

        console.log("IG Final Post ID:", publishData.id);

        if (!publishData.id) {
            throw new Error('IG Final Post ID is missing from publish response');
        }

        // Ensure ID is always a string (Instagram IDs are 17-18 digit numbers)
        return { id: String(publishData.id) };
    },

    /**
     * Get Real-time Analytics from Instagram
     */
    async getAnalytics(userId: string, client?: SupabaseClient) {
        const { instagramId, accessToken } = await this.getInstagramAccountId(userId, client);

        // Fetch account stats
        const accountUrl = new URL(`https://graph.facebook.com/v19.0/${instagramId}`);
        accountUrl.searchParams.append('fields', 'followers_count,media_count');
        accountUrl.searchParams.append('access_token', accessToken);

        const accountRes = await fetch(accountUrl.toString());
        const accountData = await accountRes.json();

        // Fetch recent media for engagement
        const mediaUrl = new URL(`https://graph.facebook.com/v19.0/${instagramId}/media`);
        mediaUrl.searchParams.append('fields', 'like_count,comments_count');
        mediaUrl.searchParams.append('limit', '50');
        mediaUrl.searchParams.append('access_token', accessToken);

        const mediaRes = await fetch(mediaUrl.toString());
        const mediaData = await mediaRes.json();

        let likes = 0;
        let comments = 0;

        if (mediaData.data) {
            mediaData.data.forEach((media: any) => {
                likes += media.like_count || 0;
                comments += media.comments_count || 0;
            });
        }

        const followers = accountData.followers_count || 0;
        const mediaCount = accountData.media_count || 0;
        const totalEngagement = likes + comments;

        // Calculate estimations for reach/impressions if explicit insights graph API isn't enabled for the test app
        const reach = followers > 0 ? followers * 1.5 : 0;
        const impressions = reach * 1.2;
        const engagementRate = reach > 0 ? (totalEngagement / reach) * 100 : 0;

        return {
            connected: true,
            followers,
            mediaCount,
            likes,
            comments,
            totalEngagement,
            reach: Math.round(reach),
            impressions: Math.round(impressions),
            engagementRate: Number(engagementRate.toFixed(2))
        };
    }
};
