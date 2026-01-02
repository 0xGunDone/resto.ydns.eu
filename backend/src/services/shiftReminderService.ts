/**
 * Shift Reminder Service
 * 
 * Handles automatic shift reminders for upcoming shifts.
 * Runs as a scheduled job to check for shifts starting in 12 hours and 2 hours.
 * 
 * Requirements: 13.3 - THE Notification_System SHALL отправлять напоминание за 12 часов до смены
 * Requirements: 13.4 - THE Notification_System SHALL отправлять напоминание за 2 часа до смены
 */

import dbClient from '../utils/db';
import { logger } from './loggerService';
import { notifyShiftReminder, getNotificationSettings } from './notificationService';

/**
 * Reminder check interval (30 minutes in milliseconds)
 * We check every 30 minutes to ensure we don't miss any reminders
 */
const REMINDER_CHECK_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Reminder thresholds in hours
 */
const REMINDER_THRESHOLDS = [12, 2];

/**
 * Tolerance window in minutes for matching reminder times
 * This prevents sending duplicate reminders
 */
const REMINDER_TOLERANCE_MINUTES = 35;

/**
 * Shift Reminder Service Interface
 */
export interface IShiftReminderService {
  /**
   * Check and send reminders for upcoming shifts
   * @returns Number of reminders sent
   */
  sendShiftReminders(): Promise<number>;
  
  /**
   * Start the automatic reminder scheduler
   */
  startReminderScheduler(): void;
  
  /**
   * Stop the automatic reminder scheduler
   */
  stopReminderScheduler(): void;
}

// Singleton interval reference
let reminderInterval: NodeJS.Timeout | null = null;

// Track sent reminders to avoid duplicates (shiftId:hoursUntil)
const sentReminders = new Set<string>();

/**
 * Clean up old reminder tracking entries
 * Removes entries older than 24 hours
 */
function cleanupSentReminders(): void {
  // Clear the set periodically to prevent memory growth
  // In production, this could be stored in Redis or database
  if (sentReminders.size > 10000) {
    sentReminders.clear();
    logger.debug('Cleared sent reminders cache');
  }
}

/**
 * Check if a reminder was already sent for this shift and threshold
 */
function wasReminderSent(shiftId: string, hoursUntil: number): boolean {
  const key = `${shiftId}:${hoursUntil}`;
  return sentReminders.has(key);
}

/**
 * Mark a reminder as sent
 */
function markReminderSent(shiftId: string, hoursUntil: number): void {
  const key = `${shiftId}:${hoursUntil}`;
  sentReminders.add(key);
}

/**
 * Get shifts that need reminders
 * Finds shifts starting within the reminder window for each threshold
 */
async function getShiftsNeedingReminders(): Promise<Array<{
  shift: any;
  hoursUntil: number;
}>> {
  const now = new Date();
  const shiftsToRemind: Array<{ shift: any; hoursUntil: number }> = [];
  
  for (const hoursThreshold of REMINDER_THRESHOLDS) {
    // Calculate the time window for this threshold
    const targetTime = new Date(now.getTime() + hoursThreshold * 60 * 60 * 1000);
    const windowStart = new Date(targetTime.getTime() - REMINDER_TOLERANCE_MINUTES * 60 * 1000);
    const windowEnd = new Date(targetTime.getTime() + REMINDER_TOLERANCE_MINUTES * 60 * 1000);
    
    try {
      // Find shifts starting within the window
      const shifts = await dbClient.shift.findMany({
        where: {
          startTime: {
            gte: windowStart,
            lte: windowEnd,
          },
        },
        include: {
          user: true,
          restaurant: true,
        },
      });
      
      for (const shift of shifts) {
        // Skip if reminder was already sent
        if (wasReminderSent(shift.id, hoursThreshold)) {
          continue;
        }
        
        // Skip if user doesn't exist
        if (!shift.userId) {
          continue;
        }
        
        shiftsToRemind.push({
          shift,
          hoursUntil: hoursThreshold,
        });
      }
    } catch (error) {
      logger.error('Error fetching shifts for reminders', {
        hoursThreshold,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
  
  return shiftsToRemind;
}

/**
 * Send reminders for upcoming shifts
 * 
 * Requirements: 13.3, 13.4
 * @returns Number of reminders sent
 */
export async function sendShiftReminders(): Promise<number> {
  logger.debug('Checking for shifts needing reminders');
  
  // Clean up old tracking entries
  cleanupSentReminders();
  
  try {
    const shiftsToRemind = await getShiftsNeedingReminders();
    
    if (shiftsToRemind.length === 0) {
      logger.debug('No shifts need reminders');
      return 0;
    }
    
    let remindersSent = 0;
    
    for (const { shift, hoursUntil } of shiftsToRemind) {
      try {
        // Check user's notification settings
        const settings = await getNotificationSettings(shift.userId);
        
        // Skip if reminders are disabled
        if (!settings.enableReminders) {
          logger.debug('Reminders disabled for user', { userId: shift.userId });
          markReminderSent(shift.id, hoursUntil); // Mark as sent to avoid rechecking
          continue;
        }
        
        // Skip if shift notifications are disabled
        if (!settings.enableShiftNotifications) {
          logger.debug('Shift notifications disabled for user', { userId: shift.userId });
          markReminderSent(shift.id, hoursUntil);
          continue;
        }
        
        // Check if user's custom reminder hours setting applies
        // Only send 12-hour reminder if user's setting is >= 12
        // Always send 2-hour reminder as it's the final reminder
        if (hoursUntil === 12 && settings.reminderHoursBefore < 12) {
          logger.debug('User reminder setting is less than 12 hours', { 
            userId: shift.userId, 
            reminderHoursBefore: settings.reminderHoursBefore 
          });
          markReminderSent(shift.id, hoursUntil);
          continue;
        }
        
        // Send the reminder
        await notifyShiftReminder(shift.userId, shift, hoursUntil);
        
        // Mark as sent
        markReminderSent(shift.id, hoursUntil);
        remindersSent++;
        
        logger.info('Shift reminder sent', {
          shiftId: shift.id,
          userId: shift.userId,
          hoursUntil,
        });
      } catch (error) {
        logger.error('Error sending shift reminder', {
          shiftId: shift.id,
          userId: shift.userId,
          hoursUntil,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
    
    if (remindersSent > 0) {
      logger.info('Shift reminders sent', { count: remindersSent });
    }
    
    return remindersSent;
  } catch (error) {
    logger.error('Error in sendShiftReminders', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return 0;
  }
}

/**
 * Start the automatic reminder scheduler
 * Runs every 30 minutes to check for shifts needing reminders
 */
export function startReminderScheduler(): void {
  if (reminderInterval) {
    logger.warn('Shift reminder scheduler already running');
    return;
  }
  
  logger.info('Starting shift reminder scheduler', {
    intervalMs: REMINDER_CHECK_INTERVAL_MS,
    thresholds: REMINDER_THRESHOLDS,
  });
  
  // Run reminder check immediately on startup
  sendShiftReminders();
  
  // Schedule periodic reminder checks
  reminderInterval = setInterval(() => {
    sendShiftReminders();
  }, REMINDER_CHECK_INTERVAL_MS);
}

/**
 * Stop the automatic reminder scheduler
 */
export function stopReminderScheduler(): void {
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
    logger.info('Stopped shift reminder scheduler');
  }
}

/**
 * Create Shift Reminder Service instance
 */
export function createShiftReminderService(): IShiftReminderService {
  return {
    sendShiftReminders,
    startReminderScheduler,
    stopReminderScheduler,
  };
}

// Singleton instance
let serviceInstance: IShiftReminderService | null = null;

/**
 * Get the singleton Shift Reminder Service instance
 */
export function getShiftReminderService(): IShiftReminderService {
  if (!serviceInstance) {
    serviceInstance = createShiftReminderService();
  }
  return serviceInstance;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetShiftReminderService(): void {
  if (serviceInstance) {
    serviceInstance.stopReminderScheduler();
    serviceInstance = null;
  }
  sentReminders.clear();
}

/**
 * Clear sent reminders cache (for testing)
 */
export function clearSentRemindersCache(): void {
  sentReminders.clear();
}
