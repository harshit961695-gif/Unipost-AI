import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Applying PostgreSQL check constraints to the database...');

    const queries = [
        `ALTER TABLE posts DROP CONSTRAINT IF EXISTS check_facebook_post_id;`,
        `ALTER TABLE posts ADD CONSTRAINT check_facebook_post_id CHECK (
            status <> 'published' OR NOT ('facebook' = ANY(platforms)) OR (facebook_post_id IS NOT NULL AND facebook_post_id <> '')
        );`,
        `ALTER TABLE posts DROP CONSTRAINT IF EXISTS check_instagram_media_id;`,
        `ALTER TABLE posts ADD CONSTRAINT check_instagram_media_id CHECK (
            status <> 'published' OR NOT ('instagram' = ANY(platforms)) OR (instagram_media_id IS NOT NULL AND instagram_media_id <> '')
        );`,
        `ALTER TABLE posts DROP CONSTRAINT IF EXISTS check_youtube_video_id;`,
        `ALTER TABLE posts ADD CONSTRAINT check_youtube_video_id CHECK (
            status <> 'published' OR NOT ('youtube' = ANY(platforms)) OR (youtube_video_id IS NOT NULL AND youtube_video_id <> '')
        );`
    ];

    for (const query of queries) {
        console.log(`Executing SQL: ${query}`);
        await prisma.$executeRawUnsafe(query);
    }

    console.log('Database constraints applied successfully.');
}

main()
    .catch(e => {
        console.error('Error applying constraints:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
