const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log('=== DATABASE INSPECTION ===');
    
    const postLogsCount = await prisma.post_logs.count();
    console.log(`Total post_logs count: ${postLogsCount}`);
    
    const postLogs = await prisma.post_logs.findMany({
      orderBy: { created_at: 'desc' },
      take: 10
    });
    console.log('Recent 10 post_logs:');
    postLogs.forEach(l => {
      console.log(`- ID: ${l.id}, User: ${l.user_id}, Platform: ${l.platform}, Status: ${l.status}`);
      console.log(`  Views: ${l.views}, Likes: ${l.likes}, Comments: ${l.comments}, Reach: ${l.reach}, Impressions: ${l.impressions}, Engagement: ${l.engagement}`);
      console.log(`  Created At: ${l.created_at}, Fetched At: ${l.fetched_at}`);
    });
    
    const currentCount = await prisma.analytics_current.count();
    console.log(`\nTotal analytics_current count: ${currentCount}`);
    const current = await prisma.analytics_current.findMany();
    current.forEach(c => {
      console.log(`- User: ${c.user_id}, Views: ${c.total_views}, Likes: ${c.total_likes}, Comments: ${c.total_comments}, Reach: ${c.total_reach}, Impressions: ${c.total_impressions}, Engagement: ${c.total_engagement}`);
      console.log(`  Platform Metrics:`, JSON.stringify(c.platform_metrics, null, 2));
      console.log(`  Updated At: ${c.updated_at}`);
    });

    const dailyCount = await prisma.analytics_daily.count();
    console.log(`\nTotal analytics_daily count: ${dailyCount}`);
    const daily = await prisma.analytics_daily.findMany({
      orderBy: { snapshot_date: 'desc' },
      take: 5
    });
    daily.forEach(d => {
      console.log(`- Date: ${d.snapshot_date}, User: ${d.user_id}, Views: ${d.total_views}, Likes: ${d.total_likes}, Comments: ${d.total_comments}, Reach: ${d.total_reach}, Impressions: ${d.total_impressions}, Engagement: ${d.total_engagement}`);
    });

    const snapCount = await prisma.analytics_snapshots.count();
    console.log(`\nTotal analytics_snapshots count: ${snapCount}`);
    const snaps = await prisma.analytics_snapshots.findMany({
      orderBy: { snapshot_date: 'desc' },
      take: 5
    });
    snaps.forEach(s => {
      console.log(`- Date: ${s.snapshot_date}, User: ${s.user_id}, Platform: ${s.platform}, Views: ${s.total_views}, Likes: ${s.total_likes}, Comments: ${s.total_comments}, Reach: ${s.total_reach}, Impressions: ${s.total_impressions}, Engagement: ${s.total_engagement}`);
    });

  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
