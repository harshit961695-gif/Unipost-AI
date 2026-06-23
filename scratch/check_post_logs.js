const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    const logs = await prisma.post_logs.findMany({
      where: {
        OR: [
          { views: { gt: 0 } },
          { likes: { gt: 0 } },
          { comments: { gt: 0 } },
          { reach: { gt: 0 } },
          { impressions: { gt: 0 } },
          { engagement: { gt: 0 } },
        ]
      }
    });
    console.log(`Found ${logs.length} post_logs with non-zero metrics:`);
    logs.forEach(l => {
      console.log(`- ID: ${l.id}, Platform: ${l.platform}, PostID: ${l.platform_post_id}, Status: ${l.status}`);
      console.log(`  Views: ${l.views}, Likes: ${l.likes}, Comments: ${l.comments}, Reach: ${l.reach}, Impressions: ${l.impressions}, Engagement: ${l.engagement}`);
    });
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
