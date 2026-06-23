const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  const userId = '1333698f-c998-4db5-b317-4b1adc42de31';
  try {
    const range = '30d';
    let days = 30;
    const dateFilter = new Date(Date.now() - days * 86400000);

    const [snapshots, postLogs] = await Promise.all([
      prisma.analytics_daily.findMany({
        where: { 
          user_id: userId,
          snapshot_date: { gte: dateFilter }
        },
        orderBy: { snapshot_date: 'asc' },
      }),
      prisma.post_logs.findMany({
        where: { 
          user_id: userId,
          created_at: { gte: dateFilter }
        },
        orderBy: { created_at: 'desc' },
      })
    ]);

    const platforms = {
      youtube: { views: 0, likes: 0, comments: 0, shares: 0, reach: 0, impressions: 0, engagement: 0, count: 0 },
      facebook: { views: 0, likes: 0, comments: 0, shares: 0, reach: 0, impressions: 0, engagement: 0, count: 0 },
      instagram: { views: 0, likes: 0, comments: 0, shares: 0, reach: 0, impressions: 0, engagement: 0, count: 0 },
    };

    let total_shares = 0;

    postLogs.forEach((log) => {
      const platform = (log.platform || '').trim().toLowerCase()
      if (platforms[platform]) {
        const isSuccessful = log.status === 'success' || log.status === 'published';
        if (isSuccessful) {
          platforms[platform].views += log.views || 0
          platforms[platform].likes += log.likes || 0
          platforms[platform].comments += log.comments || 0
          platforms[platform].shares += log.shares || 0
          platforms[platform].reach += log.reach || 0
          platforms[platform].impressions += log.impressions || 0
          platforms[platform].engagement += log.engagement || 0
          platforms[platform].count += 1
        }
      }
      if (log.status === 'success' || log.status === 'published') {
        total_shares += log.shares || 0
      }
    });

    console.log('Platforms computed inside advanced route:');
    console.log(JSON.stringify(platforms, null, 2));

  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
