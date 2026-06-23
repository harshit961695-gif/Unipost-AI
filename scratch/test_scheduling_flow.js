const { createClient } = require('@supabase/supabase-js');
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const http = require('http');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const prisma = new PrismaClient();

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

async function main() {
  console.log('=== TEST SCHEDULED POST WORKFLOW ===');
  const userId = '1333698f-c998-4db5-b317-4b1adc42de31';

  try {
    // 1. Upload a test image to Supabase Storage to get a public URL
    const imagePath = path.join(__dirname, 'test_image.jpg');
    if (!fs.existsSync(imagePath)) {
      console.error('test_image.jpg not found. Run "node scratch/create_test_media.js" first.');
      return;
    }

    console.log('Uploading test image to Supabase Storage...');
    const imageBuffer = fs.readFileSync(imagePath);
    const fileName = `test_schedule_${Date.now()}.jpg`;
    const filePath = `scheduled/${fileName}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('instagram_media')
      .upload(filePath, imageBuffer, { contentType: 'image/jpeg' });

    if (uploadError) {
      throw new Error(`Failed to upload test image: ${uploadError.message}`);
    }

    const { data: { publicUrl } } = supabase.storage
      .from('instagram_media')
      .getPublicUrl(filePath);

    console.log(`Uploaded test image public URL: ${publicUrl}`);

    // 2. Create a test scheduled post row in the past (e.g. 5 minutes ago)
    const scheduledTime = new Date(Date.now() - 5 * 60000).toISOString();
    console.log(`Creating scheduled post row. Scheduled At: ${scheduledTime}...`);

    const insertPayload = {
      user_id: userId,
      platforms: {
        facebook: {
          enabled: true,
          caption: `Scheduled Flow Test Post (Facebook) - ${Date.now()}`,
          type: 'post'
        }
      },
      media_urls: {
        facebook: publicUrl
      },
      scheduled_at: scheduledTime,
      status: 'pending'
    };

    const { data: scheduledPost, error: insertError } = await supabase
      .from('scheduled_posts')
      .insert(insertPayload)
      .select()
      .single();

    if (insertError) {
      throw new Error(`Failed to insert scheduled post: ${insertError.message}`);
    }

    console.log(`✓ Row created successfully in Supabase! ID: ${scheduledPost.id}, Status: ${scheduledPost.status}`);

    // 3. Trigger scheduler check API
    console.log('Triggering scheduler check endpoint (/api/schedule/check)...');
    const scheduleCheckRes = await getUrl('http://localhost:3000/api/schedule/check');
    console.log('Scheduler Check API Response:', JSON.stringify(scheduleCheckRes, null, 2));

    // 4. Verify post status update in Supabase
    console.log('Verifying post status update in Supabase...');
    const { data: updatedPost, error: getPostError } = await supabase
      .from('scheduled_posts')
      .select('*')
      .eq('id', scheduledPost.id)
      .single();

    if (getPostError) {
      throw new Error(`Failed to get updated post: ${getPostError.message}`);
    }

    console.log(`Updated post status: ${updatedPost.status}`);
    console.log(`Updated post results:`, JSON.stringify(updatedPost.results, null, 2));
    console.log(`Updated post error_message:`, updatedPost.error_message);

    // 5. Verify post_logs row created in Neon (Prisma)
    console.log('Checking Neon (Prisma) for post_logs...');
    // Allow a small delay for Prisma async processing
    await new Promise(r => setTimeout(r, 2000));
    
    // Find logs created in the last 10 seconds for this user
    const recentLogs = await prisma.post_logs.findMany({
      where: {
        user_id: userId,
        created_at: {
          gte: new Date(Date.now() - 10000)
        }
      }
    });

    console.log(`Found ${recentLogs.length} recent post logs:`);
    recentLogs.forEach(l => {
      console.log(`- Platform: ${l.platform}, Status: ${l.status}, Platform Post ID: ${l.platform_post_id}, Content: ${l.content}`);
    });

    if (recentLogs.length > 0) {
      console.log('✓ Post logs verified successfully in Neon!');
    } else {
      console.log('⚠️ No post logs found in Neon (Prisma) for this run.');
    }

  } catch (err) {
    console.error('Error during test execution:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
