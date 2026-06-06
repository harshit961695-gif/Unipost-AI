const { PrismaClient } = require('@prisma/client');
const http = require('http');

async function getUrl(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
                } catch (e) {
                    resolve({ status: res.statusCode, raw: data });
                }
            });
        }).on('error', reject);
    });
}

async function verify() {
    console.log('=== STARTING VERIFICATION ===');
    const prisma = new PrismaClient();

    try {
        // 1. Verify notifications
        console.log('\n--- 1. Checking Recent Notifications ---');
        const notifications = await prisma.notifications.findMany({
            orderBy: { created_at: 'desc' },
            take: 5
        });
        notifications.forEach(n => {
            console.log(`- Type: ${n.type}`);
            console.log(`  Title: ${n.title}`);
            console.log(`  Message: ${n.message}`);
            console.log(`  Created At: ${n.created_at}`);
        });

        // 2. Fetch recent post logs
        console.log('\n--- 2. Checking Post Logs for Latest Publish ---');
        // Let's get the latest posts
        const latestPosts = await prisma.posts.findMany({
            orderBy: { created_at: 'desc' },
            take: 1
        });
        
        let targetPostId = null;
        if (latestPosts.length > 0) {
            const latestPost = latestPosts[0];
            targetPostId = latestPost.id;
            console.log(`Latest Post ID: ${latestPost.id}`);
            console.log(`Caption: ${latestPost.caption}`);
            console.log(`Platforms: ${JSON.stringify(latestPost.platforms)}`);
            console.log(`FB ID: ${latestPost.facebook_post_id}`);
            console.log(`IG ID: ${latestPost.instagram_media_id}`);
            console.log(`YT ID: ${latestPost.youtube_video_id}`);
        }

        // Get post logs
        const postLogs = await prisma.post_logs.findMany({
            orderBy: { created_at: 'desc' },
            take: 6
        });
        
        console.log('Recent Post Logs:');
        postLogs.forEach(l => {
            console.log(`- Platform: ${l.platform}, Post ID: ${l.platform_post_id}, Status: ${l.status}`);
            console.log(`  Views: ${l.views}, Likes: ${l.likes}, Comments: ${l.comments}, Reach: ${l.reach}, Impressions: ${l.impressions}, Engagement: ${l.engagement}`);
            console.log(`  Fetched At: ${l.fetched_at}`);
        });

        // 3. Verify Dashboard Stats
        console.log('\n--- 3. Verifying Dashboard Numbers (/api/dashboard/stats) ---');
        const statsRes = await getUrl('http://localhost:3000/api/dashboard/stats');
        console.log('Dashboard Stats Status:', statsRes.status);
        console.log('Dashboard Stats Payload:', JSON.stringify(statsRes.data, null, 2));

        // 4. Verify Advanced Analytics (Platform Cards)
        console.log('\n--- 4. Verifying Platform Cards (/api/analytics/advanced) ---');
        const advancedRes = await getUrl('http://localhost:3000/api/analytics/advanced');
        console.log('Advanced Analytics Status:', advancedRes.status);
        console.log('Advanced Analytics Payload (Platform Wise):', JSON.stringify(advancedRes.data?.platform_wise || advancedRes.data, null, 2));

    } catch (e) {
        console.error('Verification failed with error:', e);
    } finally {
        await prisma.$disconnect();
    }
}

verify();
