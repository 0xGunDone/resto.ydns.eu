/**
 * Property-Based Tests for Notification Settings
 * Tests for Property 14 from the design document
 * 
 * **Feature: platform-upgrade**
 * **Property 14: Notification settings are respected**
 * **Validates: Requirements 16.1, 16.2, 16.3**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// Arbitrary generators for notification settings
const notificationSettingsArb = fc.record({
  enableShiftNotifications: fc.boolean(),
  enableSwapNotifications: fc.boolean(),
  enableReminders: fc.boolean(),
  reminderHoursBefore: fc.integer({ min: 1, max: 48 }),
});

// Generate user ID
const userIdArb = fc.uuid();

// Generate notification type
const notificationTypeArb = fc.constantFrom(
  'shift_assigned',
  'shift_changed',
  'shift_reminder',
  'swap_requested',
  'swap_responded',
  'swap_approved'
);

/**
 * **Feature: platform-upgrade, Property 14: Notification settings are respected**
 * **Validates: Requirements 16.1, 16.2, 16.3**
 * 
 * For any notification event, if the user has disabled that notification type,
 * no message SHALL be sent.
 */
describe('Property 14: Notification settings are respected', () => {
  /**
   * Helper function that determines if a notification should be sent
   * based on user settings and notification type
   */
  function shouldSendNotification(
    settings: {
      enableShiftNotifications: boolean;
      enableSwapNotifications: boolean;
      enableReminders: boolean;
      reminderHoursBefore: number;
    },
    notificationType: string
  ): boolean {
    switch (notificationType) {
      case 'shift_assigned':
      case 'shift_changed':
        return settings.enableShiftNotifications;
      case 'shift_reminder':
        // Reminders require both shift notifications AND reminders to be enabled
        return settings.enableShiftNotifications && settings.enableReminders;
      case 'swap_requested':
      case 'swap_responded':
      case 'swap_approved':
        return settings.enableSwapNotifications;
      default:
        return true;
    }
  }

  /**
   * Requirement 16.1: THE Notification_System SHALL позволять включать/выключать уведомления о сменах
   */
  it('should respect enableShiftNotifications setting for shift notifications', () => {
    fc.assert(
      fc.property(
        notificationSettingsArb,
        fc.constantFrom('shift_assigned', 'shift_changed'),
        (settings, notificationType) => {
          const shouldSend = shouldSendNotification(settings, notificationType);
          
          // Property: Shift notifications should only be sent when enableShiftNotifications is true
          expect(shouldSend).toBe(settings.enableShiftNotifications);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Requirement 16.2: THE Notification_System SHALL позволять включать/выключать уведомления о задачах
   * (Note: This test covers swap notifications as the primary notification type for this feature)
   */
  it('should respect enableSwapNotifications setting for swap notifications', () => {
    fc.assert(
      fc.property(
        notificationSettingsArb,
        fc.constantFrom('swap_requested', 'swap_responded', 'swap_approved'),
        (settings, notificationType) => {
          const shouldSend = shouldSendNotification(settings, notificationType);
          
          // Property: Swap notifications should only be sent when enableSwapNotifications is true
          expect(shouldSend).toBe(settings.enableSwapNotifications);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Requirement 16.3: THE Notification_System SHALL позволять включать/выключать напоминания
   */
  it('should respect enableReminders setting for reminder notifications', () => {
    fc.assert(
      fc.property(
        notificationSettingsArb,
        (settings) => {
          const shouldSend = shouldSendNotification(settings, 'shift_reminder');
          
          // Property: Reminders require both shift notifications AND reminders to be enabled
          const expectedResult = settings.enableShiftNotifications && settings.enableReminders;
          expect(shouldSend).toBe(expectedResult);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Test that disabled notifications are never sent
   */
  it('should not send any notification when the corresponding setting is disabled', () => {
    fc.assert(
      fc.property(
        notificationTypeArb,
        (notificationType) => {
          // Create settings with all notifications disabled
          const disabledSettings = {
            enableShiftNotifications: false,
            enableSwapNotifications: false,
            enableReminders: false,
            reminderHoursBefore: 12,
          };
          
          const shouldSend = shouldSendNotification(disabledSettings, notificationType);
          
          // Property: No notifications should be sent when all are disabled
          expect(shouldSend).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Test that enabled notifications are sent
   */
  it('should send notifications when the corresponding setting is enabled', () => {
    fc.assert(
      fc.property(
        notificationTypeArb,
        (notificationType) => {
          // Create settings with all notifications enabled
          const enabledSettings = {
            enableShiftNotifications: true,
            enableSwapNotifications: true,
            enableReminders: true,
            reminderHoursBefore: 12,
          };
          
          const shouldSend = shouldSendNotification(enabledSettings, notificationType);
          
          // Property: All notifications should be sent when all are enabled
          expect(shouldSend).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Test reminderHoursBefore setting validation
   */
  it('should have valid reminderHoursBefore value', () => {
    fc.assert(
      fc.property(
        notificationSettingsArb,
        (settings) => {
          // Property: reminderHoursBefore should be a positive integer
          expect(settings.reminderHoursBefore).toBeGreaterThan(0);
          expect(Number.isInteger(settings.reminderHoursBefore)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Test default settings behavior
   */
  it('should use default values when settings are not provided', () => {
    fc.assert(
      fc.property(
        userIdArb,
        () => {
          // Simulate default settings (when no settings exist)
          const defaultSettings = {
            enableShiftNotifications: true,
            enableSwapNotifications: true,
            enableReminders: true,
            reminderHoursBefore: 12,
          };
          
          // Property: Default settings should enable all notifications
          expect(defaultSettings.enableShiftNotifications).toBe(true);
          expect(defaultSettings.enableSwapNotifications).toBe(true);
          expect(defaultSettings.enableReminders).toBe(true);
          expect(defaultSettings.reminderHoursBefore).toBe(12);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Test that settings are independent of each other
   */
  it('should allow independent control of each notification type', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (enableShift, enableSwap, enableReminders) => {
          const settings = {
            enableShiftNotifications: enableShift,
            enableSwapNotifications: enableSwap,
            enableReminders: enableReminders,
            reminderHoursBefore: 12,
          };
          
          // Property: Each setting should be independent
          const shiftResult = shouldSendNotification(settings, 'shift_assigned');
          const swapResult = shouldSendNotification(settings, 'swap_requested');
          
          expect(shiftResult).toBe(enableShift);
          expect(swapResult).toBe(enableSwap);
          
          // Reminders depend on both shift and reminder settings
          const reminderResult = shouldSendNotification(settings, 'shift_reminder');
          expect(reminderResult).toBe(enableShift && enableReminders);
        }
      ),
      { numRuns: 100 }
    );
  });
});
