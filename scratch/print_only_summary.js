const { PrismaClient } = require('@prisma/client');
const http = require('http');

async function getUrl(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve(data);
                }
            });
        }).on('error', reject);
    });
}

async function printSummary() {
    console.log('=== SUMMARY OF RESULTS ===');
    const prisma = new PrismaClient();

    try {
        const latestPost = await prisma.posts.findFirst({
            orderBy: { created_at: 'desc' }
        });
        console.log('\n--- LATEST POST RECORD ---');
        if (latestPost) {
            console.log(`ID: ${latestPost.id}`);
            console.log(`Caption/Title: ${latestPost.caption}`);
            console.log(`Platforms: ${JSON.stringify(latestPost.platforms)}`);
            console.log(`FB Post ID: ${latestPost.facebook_post_id}`);
            console.log(`IG Media ID: ${latestPost.instagram_media_id}`);
            console.log(`YT Video ID: ${latestPost.youtube_video_id}`);
        } else {
            console.log('No posts found!');
        }

        console.log('\n--- POST LOGS FOR LATEST POST ---');
        if (latestPost) {
            const logs = await prisma.post_logs.findMany({
                where: {
                    platform_post_id: {
                        in: [latestPost.facebook_post_id, latestPost.instagram_media_id, latestPost.youtube_video_id].filter(Boolean)
                    }
                }
            });
            logs.forEach(l => {
                console.log(`Platform: ${l.platform}`);
                console.log(`  Post/Media ID: ${l.platform_post_id}`);
                console.log(`  Status: ${l.status}`);
                console.log(`  Views: ${l.views}, Likes: ${l.likes}, Comments: ${l.comments}, Reach: ${l.reach}, Impressions: ${l.impressions}, Engagement: ${l.engagement}`);
                console.log(`  Fetched At: ${l.fetched_at}`);
            });
        }

        console.log('\n--- RECENT NOTIFICATIONS ---');
        const notifications = await prisma.notifications.findMany({
            orderBy: { created_at: 'desc' },
            take: 4
        });
        notifications.forEach(n => {
            console.log(`- Type: ${n.type}`);
            console.log(`  Title: ${n.title}`);
            console.log(`  Message: ${n.message}`);
        });

        console.log('\n--- DASHBOARD AGGREGATED STATS ---');
        const stats = await getUrl('http://localhost:3000/api/dashboard/stats');
        console.log(`Total Posts: ${stats.totalPosts}`);
        console.log(`Success Posts: ${stats.successPosts}`);
        console.log(`Failed Posts: ${stats.failedPosts}`);
        console.log(`Total Views: ${stats.totalViews}`);
        console.log(`Total Likes: ${stats.totalLikes}`);
        console.log(`Total Comments: ${stats.totalComments}`);
        console.log(`Total Reach: ${stats.totalReach}`);
        console.log(`Total Impressions: ${stats.totalImpressions}`);
        console.log(`Total Engagement: ${stats.totalEngagement}`);
        console.log('Platform Stats:', JSON.stringify(stats.platformStats, null, 2));

    } catch (e) {
        console.error('Error printing summary:', e);
    } finally {
        await prisma.$disconnect();
    }
}

printSummary();
