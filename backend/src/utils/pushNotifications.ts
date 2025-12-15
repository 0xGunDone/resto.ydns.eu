import webpush from 'web-push';
import prisma from './prisma';

// Инициализация VAPID ключей (должны быть в .env)
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@resto.local';

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
} else {
  console.warn('⚠️  VAPID keys not configured. Push notifications will not work.');
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  image?: string;
  tag?: string;
  data?: any;
  requireInteraction?: boolean;
  actions?: Array<{
    action: string;
    title: string;
    icon?: string;
  }>;
}

/**
 * Отправка push-уведомления одному пользователю
 */
export async function sendPushNotification(
  userId: string,
  payload: PushNotificationPayload
): Promise<void> {
  try {
    // Проверяем настройки уведомлений пользователя
    const settings = await prisma.notificationSettings.findUnique({
      where: { userId },
    });

    // Если push-уведомления отключены, не отправляем
    if (settings && !settings.enablePushNotifications) {
      return;
    }

    // Получаем все активные подписки пользователя
    const subscriptions = await prisma.pushSubscription.findMany({
      where: {
        userId,
        isActive: true,
      },
    });

    if (subscriptions.length === 0) {
      return; // Нет активных подписок
    }

    // Отправляем уведомление на все устройства пользователя
    const notificationPayload = JSON.stringify({
      ...payload,
      data: payload.data || {},
    });

    const promises = subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          notificationPayload
        );
      } catch (error: any) {
        // Если подписка недействительна, деактивируем её
        if (error.statusCode === 410 || error.statusCode === 404) {
          await prisma.pushSubscription.update({
            where: { endpoint: subscription.endpoint },
            data: { isActive: false },
          });
        }
        console.error('Error sending push notification:', error);
      }
    });

    await Promise.allSettled(promises);
  } catch (error) {
    console.error('Error in sendPushNotification:', error);
  }
}

/**
 * Отправка push-уведомления с фильтрацией по типу уведомления
 */
export async function sendPushNotificationByType(
  userId: string,
  type: string,
  payload: PushNotificationPayload
): Promise<void> {
  try {
    // Проверяем настройки уведомлений пользователя
    const settings = await prisma.notificationSettings.findUnique({
      where: { userId },
    });

    // Если push-уведомления отключены глобально
    if (settings && !settings.enablePushNotifications) {
      return;
    }

    // Проверяем конкретный тип уведомления
    if (type.startsWith('TASK')) {
      if (settings && !settings.enableTaskNotifications) {
        return;
      }
    } else if (type.startsWith('SHIFT')) {
      if (type.includes('SWAP')) {
        if (settings && !settings.enableSwapNotifications) {
          return;
        }
      } else {
        if (settings && !settings.enableShiftNotifications) {
          return;
        }
      }
    } else if (type.includes('TIMESHEET')) {
      if (settings && !settings.enableTimesheetNotifications) {
        return;
      }
    }

    // Отправляем уведомление
    await sendPushNotification(userId, payload);
  } catch (error) {
    console.error('Error in sendPushNotificationByType:', error);
  }
}

/**
 * Получить публичный VAPID ключ для клиента
 */
export function getVapidPublicKey(): string | null {
  return vapidPublicKey || null;
}

