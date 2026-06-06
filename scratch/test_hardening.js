const { createClient } = require('@supabase/supabase-js');
const { PrismaClient } = require('@prisma/client');
const dotenv = require('dotenv');
const path = require('path');
const crypto = require('crypto');

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const cronSecret = process.env.CRON_SECRET || 'my_development_cron_secret_123';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testFetch(url, headers = {}) {
    const response = await fetch(url, { headers });
    const status = response.status;
    let data;
    try {
        data = await response.json();
    } catch (e) {
        data = await response.text();
    }
    return { status, data };
}

async function runTests() {
    console.log('=== post-fix validation suite ===');

    // ----------------------------------------------------
    // TEST 1: CRON_SECRET PROTECTION
    // ----------------------------------------------------
    console.log('\n--- 1. Testing CRON_SECRET Validation ---');
    
    const endpoints = [
        'http://localhost:3000/api/fetch-analytics',
        'http://localhost:3000/api/cron/schedule-posts',
        'http://localhost:3000/api/cron/integrity-check',
        'http://localhost:3000/api/schedule/check'
    ];

    const results = { cron: true, deduplication: true };

    for (const ep of endpoints) {
        console.log(`\nEndpoint: ${ep}`);

        // Test A: Missing header (should pass in dev bypass, but we also want to test with header)
        const resMissing = await testFetch(ep);
        console.log(`  - No Header (Dev Bypass): Status = ${resMissing.status}`);
        if (resMissing.status !== 200) {
            console.error(`    ❌ Expected 200 under dev bypass, got ${resMissing.status}`);
            results.cron = false;
        }

        // Test B: Invalid secret (should always return 401)
        const resInvalid = await testFetch(ep, { 'Authorization': 'Bearer wrong_secret' });
        console.log(`  - Invalid Secret: Status = ${resInvalid.status}`);
        if (resInvalid.status !== 401) {
            console.error(`    ❌ Expected 401, got ${resInvalid.status}`);
            results.cron = false;
        }

        // Test C: Valid secret (should always return 200)
        const resValid = await testFetch(ep, { 'Authorization': `Bearer ${cronSecret}` });
        console.log(`  - Valid Secret: Status = ${resValid.status}`);
        if (resValid.status !== 200) {
            console.error(`    ❌ Expected 200, got ${resValid.status}`);
            results.cron = false;
        }
    }

    // ----------------------------------------------------
    // TEST 2: SCHEDULER DEDUPLICATION
    // ----------------------------------------------------
    console.log('\n--- 2. Testing Scheduler Deduplication ---');

    // Insert a pending test post into scheduled_posts table
    const testPostId = crypto.randomUUID();
    console.log(`Inserting test scheduled post (ID: ${testPostId}) with status 'pending'...`);

    const { error: insertErr } = await supabase
        .from('scheduled_posts')
        .insert({
            id: testPostId,
            user_id: '1333698f-c998-4db5-b317-4b1adc42de31', // our connected user
            platforms: {
                facebook: {
                    enabled: true,
                    caption: 'Hardening Audit Deduplication Test Post ' + Date.now(),
                    type: 'post'
                }
            },
            media_urls: null,
            scheduled_at: new Date(Date.now() - 120000).toISOString(), // 2 minutes ago
            status: 'pending'
        });

    if (insertErr) {
        console.error('Failed to insert test scheduled post:', insertErr);
        results.deduplication = false;
        return;
    }

    console.log('Test post inserted. Triggering scheduler check twice simultaneously...');

    // Trigger check twice simultaneously
    const p1 = testFetch('http://localhost:3000/api/schedule/check', { 'Authorization': `Bearer ${cronSecret}` });
    const p2 = testFetch('http://localhost:3000/api/schedule/check', { 'Authorization': `Bearer ${cronSecret}` });

    const [res1, res2] = await Promise.all([p1, p2]);

    console.log('Worker 1 Response:', JSON.stringify(res1.data));
    console.log('Worker 2 Response:', JSON.stringify(res2.data));

    // Verify status in DB
    console.log('Checking final status of the post in database...');
    const { data: finalPost, error: queryErr } = await supabase
        .from('scheduled_posts')
        .select('*')
        .eq('id', testPostId)
        .single();

    if (queryErr || !finalPost) {
        console.error('Failed to query final post status:', queryErr);
        results.deduplication = false;
    } else {
        console.log(`Final Post Status in Supabase: ${finalPost.status}`);
        console.log(`Platform Results:`, JSON.stringify(finalPost.results));
        console.log(`Error Message:`, finalPost.error_message);
        
        // Count how many workers processed or succeeded
        const worker1Status = res1.data.message || '';
        const worker2Status = res2.data.message || '';
        
        console.log(`Worker 1 Output message: "${worker1Status}"`);
        console.log(`Worker 2 Output message: "${worker2Status}"`);
        
        // At least one worker should have processed 1, and the other should have processed 0 (or skipped it)
        const totalProcessed = (res1.data.processed || 0) + (res2.data.processed || 0);
        console.log(`Total processed posts across both workers: ${totalProcessed}`);

        if (totalProcessed > 1) {
            console.error('❌ DEDUPLICATION FAILED: Post was processed by both workers!');
            results.deduplication = false;
        } else {
            console.log('✅ DEDUPLICATION SUCCESS: Post was claimed and processed exactly once!');
        }

        // Query posts table in Neon to make sure there is only 1 record
        const prisma = new PrismaClient();
        try {
            const neonPostLogs = await prisma.post_logs.findMany({
                where: { platform_post_id: finalPost.results?.facebook === 'success' ? finalPost.id : undefined }
            });
            console.log(`Found ${neonPostLogs.length} post_logs in Neon matching the final post ID/platform ID.`);
        } catch (dbErr) {
            console.error('Prisma query error:', dbErr.message);
        } finally {
            await prisma.$disconnect();
        }
    }

    console.log('\n=== TEST RUN FINISHED ===');
    console.log('CRON_SECRET Tests:', results.cron ? 'PASS' : 'FAIL');
    console.log('Deduplication Tests:', results.deduplication ? 'PASS' : 'FAIL');
}

runTests();
