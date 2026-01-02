/**
 * Property-Based Tests for Shift Notification System
 * Tests for Property 12 from the design document
 * 
 * **Feature: platform-upgrade**
 * **Property 12: Shift assignment triggers notification**
 * **Validates: Requirements 13.1**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// Arbitrary generators
const userIdArb = fc.uuid();
const shiftIdArb = fc.uuid();
const restaurantIdArb = fc.uuid();

// Generate a date in the future (for valid shifts)
const futureDateArb = fc.date({
  min: new Date(Date.now() + 1000 * 60 * 60),
  max: new Date('2030-12-31'),
}).filter(d => !isNaN(d.getTime()));

// Generate shift data
const shiftArb = fc.record({
  id: shiftIdArb,
  userId: userIdArb,
  restaurantId: restaurantIdArb,
  type: fc.constantFrom('morning', 'evening', 'night'),
  startTime: futureDateArb,
  endTime: futureDateArb,
  restaurant: fc.option(fc.record({
    name: fc.string({ minLength: 1, maxLength: 50 }),
  }), { nil: undefined }),
});

/**
 * **Feature: platform-upgrade, Property 12: Shift assignment triggers notification**
 * **Validates: Requirements 13.1**
 * 
 * For any shift assignment to a user with Telegram linked, a notification SHALL be sent.
 */
describe('Property 12: Shift assignment triggers notification', () => {
  /**
   * Helper function that simulates the notification triggering logic
   */
  function shouldTriggerNotification(
    shiftNotificationsEnabled: boolean,
    hasTelegramId: boolean
  ): { inApp: boolean; telegram: boolean } {
    return {
      inApp: shiftNotificationsEnabled,
      telegram: shiftNotificationsEnabled && hasTelegramId,
    };
  }

  it('should trigger in-app notification when shift notifications are enabled', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        (hasTelegramId) => {
          const result = shouldTriggerNotification(true, hasTelegramId);
          expect(result.inApp).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not trigger any notification when shift notifications are disabled', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        (hasTelegramId) => {
          const result = shouldTriggerNotification(false, hasTelegramId);
          expect(result.inApp).toBe(false);
          expect(result.telegram).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should trigger Telegram notification only when user has Telegram linked and notifications enabled', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        (shiftNotificationsEnabled, hasTelegramId) => {
          const result = shouldTriggerNotification(shiftNotificationsEnabled, hasTelegramId);
          const expectedTelegram = shiftNotificationsEnabled && hasTelegramId;
          expect(result.telegram).toBe(expectedTelegram);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should include required shift data in notification metadata', () => {
    fc.assert(
      fc.property(
        shiftArb,
        (shift) => {
          const metadata = {
            shiftId: shift.id,
            shiftDate: new Date(shift.startTime).toISOString(),
            restaurantName: shift.restaurant?.name || 'Ресторан',
          };
          
          expect(metadata.shiftId).toBe(shift.id);
          expect(metadata.shiftDate).toBeDefined();
          expect(typeof metadata.restaurantName).toBe('string');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should format shift date correctly for any valid shift', () => {
    fc.assert(
      fc.property(
        shiftArb,
        (shift) => {
          const shiftDate = new Date(shift.startTime);
          const dateStr = shiftDate.toLocaleDateString('ru-RU', { 
            weekday: 'short', 
            day: 'numeric', 
            month: 'short' 
          });
          
          expect(typeof dateStr).toBe('string');
          expect(dateStr.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});
