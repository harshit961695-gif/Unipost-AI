export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/server';
import { notificationService } from '@/lib/services/notificationService';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
    let user = null;
    try {
        user = await requireAuth(request);
    } catch (authErr) {
        if (process.env.BYPASS_AUTH_FOR_TESTING === 'true') {
            console.warn('[NOTIFICATIONS API] Bypassing authentication for testing');
            user = { id: '1333698f-c998-4db5-b317-4b1adc42de31' };
        } else {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }
    }

    try {
        const notifications = await notificationService.getNotifications(user.id);
        const unreadCount = await notificationService.unreadCount(user.id);

        return NextResponse.json({
            success: true,
            notifications,
            unreadCount
        });
    } catch (err: any) {
        console.error('GET /api/notifications error:', err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
