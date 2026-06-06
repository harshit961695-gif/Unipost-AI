const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

async function run() {
    const prisma = new PrismaClient();
    try {
        console.log('=== STARTING TEST PUBLISHING ===');

        // 1. Publish Facebook test post
        console.log('\n--- 1. Publishing to Facebook ---');
        const fbForm = new FormData();
        fbForm.append('type', 'post');
        fbForm.append('caption', 'Production Audit Test Post - Facebook ' + new Date().toISOString());

        const fbRes = await fetch('http://localhost:3000/api/publish/facebook', {
            method: 'POST',
            body: fbForm
        });
        const fbData = await fbRes.json();
        console.log('Facebook Publish Response:', JSON.stringify(fbData));

        if (!fbData.success) {
            console.error('Facebook publish failed!');
        }

        // 2. Publish YouTube test video
        console.log('\n--- 2. Publishing to YouTube ---');
        const ytForm = new FormData();
        ytForm.append('title', 'Audit Test ' + Date.now());
        ytForm.append('description', 'Test upload from production audit script.');
        ytForm.append('privacy', 'private');
        ytForm.append('postType', 'long_video');

        // Read generated test video
        const videoBuffer = fs.readFileSync('temp_test_video.mp4');
        const videoBlob = new Blob([videoBuffer], { type: 'video/mp4' });
        ytForm.append('video', videoBlob, 'temp_test_video.mp4');

        const ytRes = await fetch('http://localhost:3000/api/publish/youtube', {
            method: 'POST',
            body: ytForm
        });
        const ytData = await ytRes.json();
        console.log('YouTube Publish Response:', JSON.stringify(ytData));

        if (!ytData.success) {
            console.error('YouTube publish failed!');
        }

        // 3. Verify Database Records
        console.log('\n--- 3. Verifying Database Records ---');
        const postRecords = await prisma.posts.findMany({
            orderBy: { created_at: 'desc' },
            take: 5
        });

        console.log('Latest 5 Post Records in Neon posts table:');
        postRecords.forEach(p => {
            console.log(`- Post ID: ${p.id}`);
            console.log(`  Caption/Title: ${p.caption}`);
            console.log(`  Platforms: ${JSON.stringify(p.platforms)}`);
            console.log(`  FB ID: ${p.facebook_post_id}`);
            console.log(`  YT ID: ${p.youtube_video_id}`);
            console.log(`  Created At: ${p.created_at}`);
        });

        const logRecords = await prisma.post_logs.findMany({
            orderBy: { created_at: 'desc' },
            take: 5
        });

        console.log('\nLatest 5 Log Records in Neon post_logs table:');
        logRecords.forEach(l => {
            console.log(`- Log ID: ${l.id}`);
            console.log(`  Platform: ${l.platform}`);
            console.log(`  Post ID: ${l.platform_post_id}`);
            console.log(`  Status: ${l.status}`);
            console.log(`  Created At: ${l.created_at}`);
        });

    } catch (e) {
        console.error('Test publishing script error:', e);
    } finally {
        await prisma.$disconnect();
    }
}

run();
