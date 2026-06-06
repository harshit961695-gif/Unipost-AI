const { createClient } = require('@supabase/supabase-js');
const { PrismaClient } = require('@prisma/client');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env.local
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function check() {
    console.log('=== DB CHECK ===');
    console.log('Supabase URL:', supabaseUrl);
    console.log('Has Service Key:', !!supabaseServiceKey);
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false
        }
    });

    try {
        // Fetch users from auth.users (requires service role key or admin client)
        console.log('\n--- Checking Supabase Users ---');
        const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers();
        if (usersError) {
            console.error('Error fetching users:', usersError);
        } else {
            console.log(`Found ${users.length} users:`);
            users.forEach(u => {
                console.log(`- ID: ${u.id}, Email: ${u.email}`);
            });
        }

        // Fetch connected accounts
        console.log('\n--- Checking Connected Accounts ---');
        const { data: connections, error: connError } = await supabase
            .from('connected_accounts')
            .select('*');
        if (connError) {
            console.error('Error fetching connections:', connError);
        } else {
            console.log(`Found ${connections.length} connections:`);
            connections.forEach(c => {
                console.log(`- ID: ${c.id}`);
                console.log(`  User ID: ${c.user_id}`);
                console.log(`  Platform: ${c.platform}`);
                console.log(`  Has Access Token: ${!!c.access_token}`);
                console.log(`  Has Refresh Token: ${!!c.refresh_token}`);
                console.log(`  Metadata: ${JSON.stringify(c.metadata)}`);
            });
        }
    } catch (err) {
        console.error('Supabase query error:', err);
    }

    // Checking Neon DB
    console.log('\n--- Checking Neon Database ---');
    const prisma = new PrismaClient();
    try {
        const postLogsCount = await prisma.post_logs.count();
        const postsCount = await prisma.posts.count();
        const snapshotsCount = await prisma.analytics_snapshots.count();
        const notificationsCount = await prisma.notifications.count();
        console.log(`Posts Count: ${postsCount}`);
        console.log(`Post Logs Count: ${postLogsCount}`);
        console.log(`Snapshots Count: ${snapshotsCount}`);
        console.log(`Notifications Count: ${notificationsCount}`);
    } catch (prismaErr) {
        console.error('Prisma query error:', prismaErr);
    } finally {
        await prisma.$disconnect();
    }
}

check();
