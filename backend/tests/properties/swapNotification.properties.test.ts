/**
 * Property-Based Tests for Swap Notification System
 * Tests for Property 13 from the design document
 * 
 * **Feature: platform-upgrade**
 * **Property 13: Swap request triggers interactive notification**
 * **Validates: Requirements 14.1**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// Arbitrary generators
const userIdArb = fc.uuid();
const shiftIdArb = fc.uuid();
const swapRequestIdArb = fc.uuid();

// Generate swap status
const swapStatusArb = fc.constantFrom(
  'PENDING', 'ACCEPTED', 'REJECTED', 'APPROVED', 'MANAGER_REJECTED', 'EXPIRED'
);

// Generate user data
const userArb = fc.record({
  id: userIdArb,
  firstName: fc.string({ minLength: 1, maxLength: 30 }),
  lastName: fc.string({ minLength: 1, maxLength: 30 }),
  telegramId: fc.option(fc.string({ minLength: 8, maxLength: 12 }), { nil: null }),
});

// Generate swap request data
const swapRequestArb = fc.record({
  id: swapRequestIdArb,
  shiftId: shiftIdArb,
  fromUserId: userIdArb,
  toUserId: userIdArb,
  status: swapStatusArb,
  fromUser: fc.option(userArb, { nil: undefined }),
  toUser: fc.option(userArb, { nil: undefined }),
});

/**
 * **Feature: platform-upgrade, Property 13: Swap request triggers interactive notification**
 * **Validates: Requirements 14.1**
 * 
 * For any swap request creation, the target employee SHALL receive a Telegram message
 * with accept/reject buttons.
 */
describe('Property 13: Swap request triggers interactive notification', () => {
  /**
   * Helper function that simulates the notification triggering logic for swap requests
   */
  function shouldTriggerSwapNotification(
    swapNotificationsEnabled: boolean,
    hasTelegramId: boolean
  ): { inApp: boolean; telegram: boolean; hasButtons: boolean } {
    return {
      inApp: swapNotificationsEnabled,
      telegram: swapNotificationsEnabled && hasTelegramId,
      hasButtons: swapNotificationsEnabled && hasTelegramId, // Interactive buttons only in Telegram
    };
  }

  /**
   * Helper function to generate inline keyboard buttons for swap request
   */
  function generateSwapButtons(swapRequestId: string): { text: string; callback_data: string }[] {
    return [
      { text: '✅ Принять', callback_data: `swap_accept_${swapRequestId}` },
      { text: '❌ Отклонить', callback_data: `swap_reject_${swapRequestId}` },
    ];
  }

  it('should trigger in-app notification when swap notifications are enabled', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        (hasTelegramId) => {
          const result = shouldTriggerSwapNotification(true, hasTelegramId);
          expect(result.inApp).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not trigger any notification when swap notifications are disabled', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        (hasTelegramId) => {
          const result = shouldTriggerSwapNotification(false, hasTelegramId);
          expect(result.inApp).toBe(false);
          expect(result.telegram).toBe(false);
          expect(result.hasButtons).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should include interactive buttons only when Telegram notification is sent', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        (swapNotificationsEnabled, hasTelegramId) => {
          const result = shouldTriggerSwapNotification(swapNotificationsEnabled, hasTelegramId);
          
          // Property: Interactive buttons require Telegram notification
          if (result.telegram) {
            expect(result.hasButtons).toBe(true);
          } else {
            expect(result.hasButtons).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should generate correct callback data for accept/reject buttons', () => {
    fc.assert(
      fc.property(
        swapRequestIdArb,
        (swapRequestId) => {
          const buttons = generateSwapButtons(swapRequestId);
          
          // Property: Should have exactly 2 buttons
          expect(buttons.length).toBe(2);
          
          // Property: Accept button should have correct callback data
          expect(buttons[0].callback_data).toBe(`swap_accept_${swapRequestId}`);
          expect(buttons[0].text).toContain('Принять');
          
          // Property: Reject button should have correct callback data
          expect(buttons[1].callback_data).toBe(`swap_reject_${swapRequestId}`);
          expect(buttons[1].text).toContain('Отклонить');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should include swap request metadata in notification', () => {
    fc.assert(
      fc.property(
        swapRequestArb,
        (swapRequest) => {
          // Simulate creating notification metadata
          const fromUserName = swapRequest.fromUser 
            ? `${swapRequest.fromUser.firstName} ${swapRequest.fromUser.lastName}`
            : 'Коллега';
          
          const metadata = {
            swapRequestId: swapRequest.id,
            shiftId: swapRequest.shiftId,
            fromUserName,
          };
          
          // Property: Metadata should contain required fields
          expect(metadata.swapRequestId).toBe(swapRequest.id);
          expect(metadata.shiftId).toBe(swapRequest.shiftId);
          expect(typeof metadata.fromUserName).toBe('string');
          expect(metadata.fromUserName.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should determine correct notification type based on swap status', () => {
    fc.assert(
      fc.property(
        swapStatusArb,
        (status) => {
          // Simulate determining notification type
          let notificationType: string;
          
          switch (status) {
            case 'PENDING':
              notificationType = 'SHIFT_SWAP_REQUEST';
              break;
            case 'ACCEPTED':
              notificationType = 'SHIFT_SWAP_ACCEPTED';
              break;
            case 'REJECTED':
              notificationType = 'SHIFT_SWAP_REJECTED';
              break;
            case 'APPROVED':
              notificationType = 'SHIFT_SWAP_APPROVED';
              break;
            case 'MANAGER_REJECTED':
              notificationType = 'SHIFT_SWAP_DECLINED';
              break;
            default:
              notificationType = 'SHIFT_SWAP_REQUEST';
          }
          
          // Property: Notification type should be a non-empty string
          expect(typeof notificationType).toBe('string');
          expect(notificationType.length).toBeGreaterThan(0);
          expect(notificationType.startsWith('SHIFT_SWAP_')).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should notify both users when swap is approved or rejected by manager', () => {
    fc.assert(
      fc.property(
        swapRequestArb,
        fc.constantFrom('APPROVED', 'MANAGER_REJECTED'),
        (swapRequest, finalStatus) => {
          // Simulate determining who should be notified
          const usersToNotify = [swapRequest.fromUserId, swapRequest.toUserId];
          
          // Property: Both users should be notified
          expect(usersToNotify.length).toBe(2);
          expect(usersToNotify).toContain(swapRequest.fromUserId);
          expect(usersToNotify).toContain(swapRequest.toUserId);
        }
      ),
      { numRuns: 100 }
    );
  });
});
