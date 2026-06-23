const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  const userId = '1333698f-c998-4db5-b317-4b1adc42de31';
  try {
    const range = '30d';
    let days = 30;
    
    // Exact logic from route.ts
    // Let's use the local time from the system, June 23, 2026
    const dateFilter = new Date(Date.now() - days * 86400000);
    console.log(`Current Date: ${new Date()}`);
    console.log(`Date Filter (30d): ${dateFilter}`);

    const postLogs = await prisma.post_logs.findMany({
      where: { 
        user_id: userId,
        created_at: { gte: dateFilter }
      },
      orderBy: { created_at: 'desc' },
    });

    console.log(`Query returned ${postLogs.length} postLogs:`);
    postLogs.forEach(l => {
      console.log(`- ID: ${l.id}, Platform: ${l.platform}, Created At: ${l.created_at}, Status: ${l.status}, Views: ${l.views}, Likes: ${l.likes}`);
    });
    
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
