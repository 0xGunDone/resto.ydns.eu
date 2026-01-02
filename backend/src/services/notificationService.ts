/**
 * Notification Service
 * 
 * Provides methods for sending notifications about shifts and swap requests.
 * Supports both in-app notifications and Telegram notifications.
 * 
 * Requirements: 13.1, 13.2, 13.3, 13.4, 14.1, 14.2, 14.3
 */

import dbClient from '../utils/db';
import { logger } from './loggerService';
import { createNotification, NotificationType } from '../utils/notifications';
import { bot } from '../telegram/bot';
import { Markup } from 'telegraf';

// Types for shift and swap data
export interface Shift {
  id: string;
  userId: string;
  restaurantId: string;
  type: string;
  startTime: Date | string;
  endTime: Date | string;
  restaurant?: { name: string };
}

export interface SwapRequest {
  id: string;
  shiftId: string;
  fromUserId: string;
  toUserId: string;
  status: string;
  shift?: Shift;
  fromUser?: { id: string; firstName: string; lastName: string; telegramId?: string | null };
  toUser?: { id: string; firstName: string; lastName: string; telegramId?: string | null };
}

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  telegramId?: string | null;
}

/**
 * Check if user has Telegram notifications enabled
 */
async function isTelegramNotificationEnabled(userId: string): Promise<boolean> {
  try {
    const settings = await dbClient.notificationSettings.findUnique({
      where: { userId },
    });
    
    // Default to true if no settings exist
    return settings?.enablePushNotifications !== false;
  } catch (error) {
    logger.error('Error checking notification settings', { 
      userId, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    return true; // Default to enabled
  }
}

/**
 * Check if user has shift notifications enabled
 */
async function isShiftNotificationEnabled(userId: string): Promise<boolean> {
  try {
    const settings = await dbClient.notificationSettings.findUnique({
      where: { userId },
    });
    
    // Default to true if no settings exist
    return settings?.enableShiftNotifications !== false;
  } catch (error) {
    logger.error('Error checking shift notification settings', { 
      userId, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    return true;
  }
}

/**
 * Check if user has swap notifications enabled
 */
async function isSwapNotificationEnabled(userId: string): Promise<boolean> {
  try {
    const settings = await dbClient.notificationSettings.findUnique({
      where: { userId },
    });
    
    // Default to true if no settings exist
    return settings?.enableSwapNotifications !== false;
  } catch (error) {
    logger.error('Error checking swap notification settings', { 
      userId, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    return true;
  }
}

/**
 * Check if user has reminders enabled
 * Requirement: 16.3
 */
async function isReminderEnabled(userId: string): Promise<boolean> {
  try {
    const settings = await dbClient.notificationSettings.findUnique({
      where: { userId },
    });
    
    // Default to true if no settings exist
    return settings?.enableReminders !== false;
  } catch (error) {
    logger.error('Error checking reminder settings', { 
      userId, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    return true;
  }
}

/**
 * Get user's reminder hours before setting
 * Requirement: 16.4
 */
async function getReminderHoursBefore(userId: string): Promise<number> {
  try {
    const settings = await dbClient.notificationSettings.findUnique({
      where: { userId },
    });
    
    // Default to 12 hours if no settings exist
    return settings?.reminderHoursBefore ?? 12;
  } catch (error) {
    logger.error('Error getting reminder hours setting', { 
      userId, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    return 12;
  }
}

/**
 * Get user's notification settings
 * Returns all notification settings for a user
 */
export async function getNotificationSettings(userId: string): Promise<{
  enableShiftNotifications: boolean;
  enableSwapNotifications: boolean;
  enableReminders: boolean;
  reminderHoursBefore: number;
}> {
  try {
    const settings = await dbClient.notificationSettings.findUnique({
      where: { userId },
    });
    
    return {
      enableShiftNotifications: settings?.enableShiftNotifications !== false,
      enableSwapNotifications: settings?.enableSwapNotifications !== false,
      enableReminders: settings?.enableReminders !== false,
      reminderHoursBefore: settings?.reminderHoursBefore ?? 12,
    };
  } catch (error) {
    logger.error('Error getting notification settings', { 
      userId, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    return {
      enableShiftNotifications: true,
      enableSwapNotifications: true,
      enableReminders: true,
      reminderHoursBefore: 12,
    };
  }
}

/**
 * Get user with Telegram ID
 */
async function getUserWithTelegram(userId: string): Promise<User | null> {
  try {
    const user = await dbClient.user.findUnique({
      where: { id: userId },
      select: { id: true, firstName: true, lastName: true, telegramId: true },
    });
    return user as User | null;
  } catch (error) {
    logger.error('Error fetching user', { 
      userId, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    return null;
  }
}

/**
 * Send Telegram message to user
 */
async function sendTelegramMessage(
  telegramId: string, 
  message: string, 
  options?: { reply_markup?: any }
): Promise<boolean> {
  if (!bot) {
    logger.warn('Telegram bot not initialized');
    return false;
  }

  try {
    await bot.telegram.sendMessage(telegramId, message, {
      parse_mode: 'HTML',
      ...options,
    });
    return true;
  } catch (error) {
    logger.error('Error sending Telegram message', { 
      telegramId, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    return false;
  }
}

/**
 * Format date for display
 */
function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('ru-RU', { 
    weekday: 'short', 
    day: 'numeric', 
    month: 'short' 
  });
}

/**
 * Format time for display
 */
function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('ru-RU', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
}

// ============================================
// Shift Notifications (Requirements: 13.1, 13.2, 13.3, 13.4)
// ============================================

/**
 * Notify user about a newly assigned shift
 * Requirement: 13.1
 */
export async function notifyShiftAssigned(userId: string, shift: Shift): Promise<void> {
  try {
    // Check if shift notifications are enabled
    const isEnabled = await isShiftNotificationEnabled(userId);
    if (!isEnabled) {
      logger.debug('Shift notifications disabled for user', { userId });
      return;
    }

    const shiftDate = new Date(shift.startTime);
    const restaurantName = shift.restaurant?.name || 'Ресторан';
    const dateStr = formatDate(shiftDate);
    const startTimeStr = formatTime(shift.startTime);
    const endTimeStr = formatTime(shift.endTime);

    // Create in-app notification
    await createNotification({
      userId,
      type: 'SHIFT_CREATED' as NotificationType,
      title: 'Новая смена',
      message: `Вам назначена смена на ${dateStr} (${startTimeStr} - ${endTimeStr}) в ${restaurantName}`,
      link: '/schedule',
      metadata: { shiftId: shift.id, shiftDate: shiftDate.toISOString(), restaurantName },
    });

    // Send Telegram notification if user has Telegram linked
    const user = await getUserWithTelegram(userId);
    if (user?.telegramId) {
      const telegramEnabled = await isTelegramNotificationEnabled(userId);
      if (telegramEnabled) {
        const message = 
          `📅 <b>Новая смена</b>\n\n` +
          `Вам назначена смена:\n` +
          `📆 ${dateStr}\n` +
          `🕐 ${startTimeStr} - ${endTimeStr}\n` +
          `🏢 ${restaurantName}`;
        
        await sendTelegramMessage(user.telegramId, message);
      }
    }

    logger.info('Shift assigned notification sent', { userId, shiftId: shift.id });
  } catch (error) {
    logger.error('Error sending shift assigned notification', { 
      userId, 
      shiftId: shift.id,
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}

/**
 * Notify user about a changed or cancelled shift
 * Requirement: 13.2
 */
export async function notifyShiftChanged(
  userId: string, 
  shift: Shift, 
  changeType: 'updated' | 'cancelled' = 'updated'
): Promise<void> {
  try {
    // Check if shift notifications are enabled
    const isEnabled = await isShiftNotificationEnabled(userId);
    if (!isEnabled) {
      logger.debug('Shift notifications disabled for user', { userId });
      return;
    }

    const shiftDate = new Date(shift.startTime);
    const restaurantName = shift.restaurant?.name || 'Ресторан';
    const dateStr = formatDate(shiftDate);
    const startTimeStr = formatTime(shift.startTime);
    const endTimeStr = formatTime(shift.endTime);

    const isCancelled = changeType === 'cancelled';
    const title = isCancelled ? 'Смена отменена' : 'Смена изменена';
    const notificationType: NotificationType = 'SHIFT_UPDATED';

    // Create in-app notification
    await createNotification({
      userId,
      type: notificationType,
      title,
      message: isCancelled 
        ? `Ваша смена на ${dateStr} в ${restaurantName} была отменена`
        : `Ваша смена на ${dateStr} в ${restaurantName} была изменена`,
      link: '/schedule',
      metadata: { shiftId: shift.id, changeType, shiftDate: shiftDate.toISOString() },
    });

    // Send Telegram notification if user has Telegram linked
    const user = await getUserWithTelegram(userId);
    if (user?.telegramId) {
      const telegramEnabled = await isTelegramNotificationEnabled(userId);
      if (telegramEnabled) {
        const emoji = isCancelled ? '❌' : '✏️';
        const message = isCancelled
          ? `${emoji} <b>Смена отменена</b>\n\n` +
            `Ваша смена была отменена:\n` +
            `📆 ${dateStr}\n` +
            `🏢 ${restaurantName}`
          : `${emoji} <b>Смена изменена</b>\n\n` +
            `Ваша смена была изменена:\n` +
            `📆 ${dateStr}\n` +
            `🕐 ${startTimeStr} - ${endTimeStr}\n` +
            `🏢 ${restaurantName}`;
        
        await sendTelegramMessage(user.telegramId, message);
      }
    }

    logger.info('Shift changed notification sent', { userId, shiftId: shift.id, changeType });
  } catch (error) {
    logger.error('Error sending shift changed notification', { 
      userId, 
      shiftId: shift.id,
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}

/**
 * Send shift reminder notification
 * Requirements: 13.3, 13.4, 16.3
 */
export async function notifyShiftReminder(
  userId: string, 
  shift: Shift, 
  hoursUntil: number
): Promise<void> {
  try {
    // Check if shift notifications are enabled
    const isShiftEnabled = await isShiftNotificationEnabled(userId);
    if (!isShiftEnabled) {
      logger.debug('Shift notifications disabled for user', { userId });
      return;
    }

    // Check if reminders are enabled (Requirement 16.3)
    const isReminderEnabledForUser = await isReminderEnabled(userId);
    if (!isReminderEnabledForUser) {
      logger.debug('Reminders disabled for user', { userId });
      return;
    }

    const shiftDate = new Date(shift.startTime);
    const restaurantName = shift.restaurant?.name || 'Ресторан';
    const dateStr = formatDate(shiftDate);
    const startTimeStr = formatTime(shift.startTime);
    const endTimeStr = formatTime(shift.endTime);

    const timeText = hoursUntil === 1 
      ? 'через 1 час' 
      : hoursUntil < 24 
        ? `через ${hoursUntil} часов` 
        : `через ${Math.round(hoursUntil / 24)} дней`;

    // Create in-app notification
    await createNotification({
      userId,
      type: 'SHIFT_CREATED' as NotificationType,
      title: 'Напоминание о смене',
      message: `Ваша смена ${timeText}: ${dateStr} (${startTimeStr} - ${endTimeStr}) в ${restaurantName}`,
      link: '/schedule',
      metadata: { shiftId: shift.id, hoursUntil, reminder: true },
    });

    // Send Telegram notification if user has Telegram linked
    const user = await getUserWithTelegram(userId);
    if (user?.telegramId) {
      const telegramEnabled = await isTelegramNotificationEnabled(userId);
      if (telegramEnabled) {
        const message = 
          `⏰ <b>Напоминание о смене</b>\n\n` +
          `Ваша смена начинается ${timeText}:\n` +
          `📆 ${dateStr}\n` +
          `🕐 ${startTimeStr} - ${endTimeStr}\n` +
          `🏢 ${restaurantName}`;
        
        await sendTelegramMessage(user.telegramId, message);
      }
    }

    logger.info('Shift reminder notification sent', { userId, shiftId: shift.id, hoursUntil });
  } catch (error) {
    logger.error('Error sending shift reminder notification', { 
      userId, 
      shiftId: shift.id,
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}

// ============================================
// Swap Notifications (Requirements: 14.1, 14.2, 14.3)
// ============================================

/**
 * Notify target employee about a new swap request with interactive buttons
 * Requirement: 14.1
 */
export async function notifySwapRequested(
  toUserId: string, 
  swapRequest: SwapRequest
): Promise<void> {
  try {
    // Check if swap notifications are enabled
    const isEnabled = await isSwapNotificationEnabled(toUserId);
    if (!isEnabled) {
      logger.debug('Swap notifications disabled for user', { userId: toUserId });
      return;
    }

    const fromUserName = swapRequest.fromUser 
      ? `${swapRequest.fromUser.firstName} ${swapRequest.fromUser.lastName}`
      : 'Коллега';
    
    const shiftDate = swapRequest.shift 
      ? new Date(swapRequest.shift.startTime) 
      : new Date();
    const dateStr = formatDate(shiftDate);
    const startTimeStr = swapRequest.shift ? formatTime(swapRequest.shift.startTime) : '';
    const endTimeStr = swapRequest.shift ? formatTime(swapRequest.shift.endTime) : '';

    // Create in-app notification
    await createNotification({
      userId: toUserId,
      type: 'SHIFT_SWAP_REQUEST' as NotificationType,
      title: 'Запрос на обмен сменой',
      message: `${fromUserName} предлагает обменяться сменой на ${dateStr}`,
      link: '/schedule',
      metadata: { 
        swapRequestId: swapRequest.id, 
        shiftId: swapRequest.shiftId,
        fromUserName,
        shiftDate: shiftDate.toISOString() 
      },
    });

    // Send Telegram notification with interactive buttons
    const user = await getUserWithTelegram(toUserId);
    if (user?.telegramId) {
      const telegramEnabled = await isTelegramNotificationEnabled(toUserId);
      if (telegramEnabled) {
        const message = 
          `🔄 <b>Запрос на обмен сменой</b>\n\n` +
          `${fromUserName} предлагает обменяться сменой:\n` +
          `📆 ${dateStr}\n` +
          (startTimeStr ? `🕐 ${startTimeStr} - ${endTimeStr}\n` : '') +
          `\nПринять или отклонить?`;
        
        // Create inline keyboard with accept/reject buttons
        const keyboard = Markup.inlineKeyboard([
          Markup.button.callback('✅ Принять', `swap_accept_${swapRequest.id}`),
          Markup.button.callback('❌ Отклонить', `swap_reject_${swapRequest.id}`),
        ]);
        
        await sendTelegramMessage(user.telegramId, message, keyboard);
      }
    }

    logger.info('Swap request notification sent', { 
      toUserId, 
      swapRequestId: swapRequest.id 
    });
  } catch (error) {
    logger.error('Error sending swap request notification', { 
      toUserId, 
      swapRequestId: swapRequest.id,
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}

/**
 * Notify requester about swap response (accepted or rejected)
 * Requirement: 14.2
 */
export async function notifySwapResponded(
  fromUserId: string, 
  swapRequest: SwapRequest
): Promise<void> {
  try {
    // Check if swap notifications are enabled
    const isEnabled = await isSwapNotificationEnabled(fromUserId);
    if (!isEnabled) {
      logger.debug('Swap notifications disabled for user', { userId: fromUserId });
      return;
    }

    const toUserName = swapRequest.toUser 
      ? `${swapRequest.toUser.firstName} ${swapRequest.toUser.lastName}`
      : 'Коллега';
    
    const isAccepted = swapRequest.status === 'ACCEPTED';
    const notificationType: NotificationType = isAccepted 
      ? 'SHIFT_SWAP_ACCEPTED' 
      : 'SHIFT_SWAP_REJECTED';
    
    const title = isAccepted 
      ? 'Обмен сменой принят' 
      : 'Обмен сменой отклонен';
    
    const message = isAccepted
      ? `${toUserName} принял ваш запрос на обмен сменой. Ожидается одобрение менеджера.`
      : `${toUserName} отклонил ваш запрос на обмен сменой.`;

    // Create in-app notification
    await createNotification({
      userId: fromUserId,
      type: notificationType,
      title,
      message,
      link: '/schedule',
      metadata: { 
        swapRequestId: swapRequest.id, 
        shiftId: swapRequest.shiftId,
        respondedBy: toUserName,
        accepted: isAccepted 
      },
    });

    // Send Telegram notification
    const user = await getUserWithTelegram(fromUserId);
    if (user?.telegramId) {
      const telegramEnabled = await isTelegramNotificationEnabled(fromUserId);
      if (telegramEnabled) {
        const emoji = isAccepted ? '✅' : '❌';
        const telegramMessage = isAccepted
          ? `${emoji} <b>Обмен сменой принят</b>\n\n` +
            `${toUserName} принял ваш запрос на обмен сменой.\n` +
            `Ожидается одобрение менеджера.`
          : `${emoji} <b>Обмен сменой отклонен</b>\n\n` +
            `${toUserName} отклонил ваш запрос на обмен сменой.`;
        
        await sendTelegramMessage(user.telegramId, telegramMessage);
      }
    }

    logger.info('Swap response notification sent', { 
      fromUserId, 
      swapRequestId: swapRequest.id,
      accepted: isAccepted 
    });
  } catch (error) {
    logger.error('Error sending swap response notification', { 
      fromUserId, 
      swapRequestId: swapRequest.id,
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}

/**
 * Notify both employees about manager's decision on swap
 * Requirement: 14.3
 */
export async function notifySwapApproved(
  userIds: string[], 
  swapRequest: SwapRequest
): Promise<void> {
  try {
    const isApproved = swapRequest.status === 'APPROVED';
    const notificationType: NotificationType = isApproved 
      ? 'SHIFT_SWAP_APPROVED' 
      : 'SHIFT_SWAP_DECLINED';
    
    const title = isApproved 
      ? 'Обмен сменой одобрен' 
      : 'Обмен сменой отклонен менеджером';
    
    const message = isApproved
      ? 'Менеджер одобрил обмен сменой. Смены были обменены.'
      : 'Менеджер отклонил обмен сменой.';

    for (const userId of userIds) {
      // Check if swap notifications are enabled
      const isEnabled = await isSwapNotificationEnabled(userId);
      if (!isEnabled) {
        logger.debug('Swap notifications disabled for user', { userId });
        continue;
      }

      // Create in-app notification
      await createNotification({
        userId,
        type: notificationType,
        title,
        message,
        link: '/schedule',
        metadata: { 
          swapRequestId: swapRequest.id, 
          shiftId: swapRequest.shiftId,
          approved: isApproved 
        },
      });

      // Send Telegram notification
      const user = await getUserWithTelegram(userId);
      if (user?.telegramId) {
        const telegramEnabled = await isTelegramNotificationEnabled(userId);
        if (telegramEnabled) {
          const emoji = isApproved ? '✅' : '❌';
          const telegramMessage = isApproved
            ? `${emoji} <b>Обмен сменой одобрен</b>\n\n` +
              `Менеджер одобрил обмен сменой.\n` +
              `Смены были успешно обменены.`
            : `${emoji} <b>Обмен сменой отклонен</b>\n\n` +
              `Менеджер отклонил обмен сменой.`;
          
          await sendTelegramMessage(user.telegramId, telegramMessage);
        }
      }
    }

    logger.info('Swap approval notification sent', { 
      userIds, 
      swapRequestId: swapRequest.id,
      approved: isApproved 
    });
  } catch (error) {
    logger.error('Error sending swap approval notification', { 
      userIds, 
      swapRequestId: swapRequest.id,
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
}

// Export the notification service
export const notificationService = {
  // Shift notifications
  notifyShiftAssigned,
  notifyShiftChanged,
  notifyShiftReminder,
  
  // Swap notifications
  notifySwapRequested,
  notifySwapResponded,
  notifySwapApproved,
  
  // Settings helpers
  getNotificationSettings,
  isReminderEnabled,
  getReminderHoursBefore,
};

export default notificationService;
