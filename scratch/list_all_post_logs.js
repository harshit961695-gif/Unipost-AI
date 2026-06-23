const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    const logs = await prisma.post_logs.findMany({
      orderBy: { created_at: 'desc' }
    });
    console.log(`=== ALL POST LOGS (Count: ${logs.length}) ===`);
    logs.forEach(l => {
      console.log(`- Platform: ${l.platform}, PostID: ${l.platform_post_id}, Status: ${l.status}, Views: ${l.views}, Likes: ${l.likes}, Comments: ${l.comments}, Created: ${l.created_at.toDateString()}`);
    });
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
