import dbClient from './db';

export type NotificationType =
  | 'TASK_ASSIGNED'
  | 'TASK_COMMENT'
  | 'TASK_UPDATED'
  | 'SHIFT_CREATED'
  | 'SHIFT_UPDATED'
  | 'SHIFT_SWAP_REQUEST'
  | 'SHIFT_SWAP_ACCEPTED'
  | 'SHIFT_SWAP_REJECTED'
  | 'SHIFT_SWAP_APPROVED'
  | 'SHIFT_SWAP_DECLINED'
  | 'TIMESHEET_APPROVED'
  | 'BONUS_ADDED'
  | 'PENALTY_ADDED';

interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  metadata?: any;
}

/**
 * Создает уведомление для пользователя
 */
export async function createNotification(params: CreateNotificationParams): Promise<void> {
  try {
    // Создаем in-app уведомление
    const notification = await dbClient.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        message: params.message,
        link: params.link || null,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      },
    });

    // Отправляем push-уведомление, если оно включено (неблокирующий вызов)
    try {
      const { sendPushNotificationByType } = await import('./pushNotifications');
      sendPushNotificationByType(params.userId, params.type, {
        title: params.title,
        body: params.message,
        icon: '/icon-192x192.png',
        badge: '/icon-192x192.png',
        tag: params.type,
        data: {
          notificationId: notification.id,
          link: params.link,
          type: params.type,
          ...params.metadata,
        },
      }).catch((err) => {
        // Игнорируем ошибки push-уведомлений, чтобы не блокировать создание основного уведомления
        console.error('Error sending push notification:', err);
      });
    } catch (pushError) {
      // Игнорируем ошибки загрузки модуля push-уведомлений
      console.error('Error importing pushNotifications:', pushError);
    }
  } catch (error) {
    // Не прерываем выполнение основного процесса при ошибке создания уведомления
    console.error('Error creating notification:', error);
  }
}

/**
 * Создает уведомление о назначенной задаче
 */
export async function notifyTaskAssigned(userId: string, taskId: string, taskTitle: string, createdBy: string): Promise<void> {
  await createNotification({
    userId,
    type: 'TASK_ASSIGNED',
    title: 'Новая задача',
    message: `Вам назначена задача: ${taskTitle}`,
    link: `/tasks?task=${taskId}`,
    metadata: { taskId, createdBy },
  });
}

/**
 * Создает уведомление о комментарии к задаче
 */
export async function notifyTaskComment(userId: string, taskId: string, taskTitle: string, commentAuthor: string): Promise<void> {
  await createNotification({
    userId,
    type: 'TASK_COMMENT',
    title: 'Новый комментарий',
    message: `${commentAuthor} оставил комментарий к задаче: ${taskTitle}`,
    link: `/tasks?task=${taskId}`,
    metadata: { taskId, commentAuthor },
  });
}

/**
 * Создает уведомление о созданной смене
 */
export async function notifyShiftCreated(userId: string, shiftId: string, shiftDate: Date, restaurantName: string): Promise<void> {
  await createNotification({
    userId,
    type: 'SHIFT_CREATED',
    title: 'Новая смена',
    message: `Вам назначена смена на ${shiftDate.toLocaleDateString('ru-RU')} в ${restaurantName}`,
    link: `/schedule`,
    metadata: { shiftId, shiftDate: shiftDate.toISOString(), restaurantName },
  });
}

/**
 * Создает уведомление о запросе обмена сменой
 */
export async function notifyShiftSwapRequest(
  userId: string,
  shiftId: string,
  fromUserName: string,
  shiftDate: Date
): Promise<void> {
  await createNotification({
    userId,
    type: 'SHIFT_SWAP_REQUEST',
    title: 'Запрос на обмен сменой',
    message: `${fromUserName} предлагает обменяться сменой на ${shiftDate.toLocaleDateString('ru-RU')}`,
    link: `/schedule`,
    metadata: { shiftId, fromUserName, shiftDate: shiftDate.toISOString() },
  });
}

/**
 * Создает уведомление о принятии обмена сменой
 */
export async function notifyShiftSwapAccepted(userId: string, shiftId: string, acceptedByUserName: string): Promise<void> {
  await createNotification({
    userId,
    type: 'SHIFT_SWAP_ACCEPTED',
    title: 'Обмен сменой принят',
    message: `${acceptedByUserName} принял ваш запрос на обмен сменой`,
    link: `/schedule`,
    metadata: { shiftId, acceptedByUserName },
  });
}

/**
 * Создает уведомление об отклонении обмена сменой
 */
export async function notifyShiftSwapRejected(userId: string, shiftId: string, rejectedByUserName: string): Promise<void> {
  await createNotification({
    userId,
    type: 'SHIFT_SWAP_REJECTED',
    title: 'Обмен сменой отклонен',
    message: `${rejectedByUserName} отклонил ваш запрос на обмен сменой`,
    link: `/schedule`,
    metadata: { shiftId, rejectedByUserName },
  });
}

/**
 * Создает уведомление об одобрении обмена сменой менеджером
 */
export async function notifyShiftSwapApproved(userId: string, shiftId: string): Promise<void> {
  await createNotification({
    userId,
    type: 'SHIFT_SWAP_APPROVED',
    title: 'Обмен сменой одобрен',
    message: 'Менеджер одобрил обмен сменой',
    link: `/schedule`,
    metadata: { shiftId },
  });
}

/**
 * Создает уведомление об отклонении обмена сменой менеджером
 */
export async function notifyShiftSwapDeclined(userId: string, shiftId: string): Promise<void> {
  await createNotification({
    userId,
    type: 'SHIFT_SWAP_DECLINED',
    title: 'Обмен сменой отклонен',
    message: 'Менеджер отклонил обмен сменой',
    link: `/schedule`,
    metadata: { shiftId },
  });
}

