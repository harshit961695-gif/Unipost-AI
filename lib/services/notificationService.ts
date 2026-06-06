import prisma from '@/lib/prisma';

export interface NotificationMetadata {
  platform?: string;
  postId?: string;
  scheduledPostId?: string;
  [key: string]: any;
}

export const notificationService = {
  /**
   * Create a new notification for a user.
   * If it is a throttled notification type (analytics sync failures, token expirations, integrity alerts),
   * it prevents duplicate notifications within a 24-hour window.
   */
  async createNotification(
    userId: string,
    type: string,
    title: string,
    message: string,
    metadata?: NotificationMetadata
  ) {
    try {
      // 24h spam prevention logic for errors, token expirations, and integrity checks
      const throttledTypes = ['analytics_sync_failed', 'account_expired', 'daily_integrity_failed'];
      const isThrottled = throttledTypes.some(t => type.startsWith(t));

      if (isThrottled) {
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const existing = await prisma.notifications.findFirst({
          where: {
            user_id: userId,
            type,
            created_at: {
              gte: oneDayAgo,
            },
          },
        });

        if (existing) {
          console.log(`[NOTIFICATION SERVICE] Skipping creation of throttled notification type "${type}" for user ${userId} (sent within last 24h).`);
          return existing;
        }
      }

      const notification = await prisma.notifications.create({
        data: {
          user_id: userId,
          type,
          title,
          message,
          metadata: metadata ? (metadata as any) : undefined,
          is_read: false,
        },
      });

      console.log(`[NOTIFICATION SERVICE] Created notification ${notification.id} of type "${type}" for user ${userId}`);
      return notification;
    } catch (err: any) {
      console.error('[NOTIFICATION SERVICE] Error creating notification:', err.message);
      // Fail gracefully so core flows are not interrupted
      return null;
    }
  },

  /**
   * Mark a specific notification as read.
   */
  async markRead(notificationId: string, userId: string) {
    try {
      const result = await prisma.notifications.updateMany({
        where: {
          id: notificationId,
          user_id: userId,
        },
        data: {
          is_read: true,
        },
      });
      console.log(`[NOTIFICATION SERVICE] Marked notification ${notificationId} as read for user ${userId}. Affected: ${result.count}`);
      return result.count > 0;
    } catch (err: any) {
      console.error('[NOTIFICATION SERVICE] Error marking notification read:', err.message);
      return false;
    }
  },

  /**
   * Mark all notifications as read for a user.
   */
  async markAllRead(userId: string) {
    try {
      const result = await prisma.notifications.updateMany({
        where: {
          user_id: userId,
          is_read: false,
        },
        data: {
          is_read: true,
        },
      });
      console.log(`[NOTIFICATION SERVICE] Marked all notifications read for user ${userId}. Affected: ${result.count}`);
      return result.count;
    } catch (err: any) {
      console.error('[NOTIFICATION SERVICE] Error marking all notifications read:', err.message);
      return 0;
    }
  },

  /**
   * Fetch the latest notifications for a user.
   */
  async getNotifications(userId: string, limit: number = 20) {
    try {
      return await prisma.notifications.findMany({
        where: {
          user_id: userId,
        },
        orderBy: {
          created_at: 'desc',
        },
        take: limit,
      });
    } catch (err: any) {
      console.error('[NOTIFICATION SERVICE] Error fetching notifications:', err.message);
      return [];
    }
  },

  /**
   * Count unread notifications for a user.
   */
  async unreadCount(userId: string) {
    try {
      return await prisma.notifications.count({
        where: {
          user_id: userId,
          is_read: false,
        },
      });
    } catch (err: any) {
      console.error('[NOTIFICATION SERVICE] Error counting unread notifications:', err.message);
      return 0;
    }
  },
};
