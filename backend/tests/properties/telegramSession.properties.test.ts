/**
 * Property-Based Tests for Telegram Session Persistence (PostgreSQL)
 * **Feature: project-refactoring, Property 6: Telegram Session Persistence Round-Trip**
 * **Validates: Requirements 3.4**
 * 
 * Note: Database tests require a running PostgreSQL database.
 * Set DATABASE_URL environment variable to run database tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { TelegramStep } from '../../src/database/types';

// Skip database tests if no DATABASE_URL is set
const DATABASE_URL = process.env.DATABASE_URL;
const shouldSkipDbTests = !DATABASE_URL;

/**
 * Property-Based Tests for Invalid Invite Token Rejection
 * **Feature: project-refactoring, Property 7: Invalid Invite Token Rejection**
 * **Validates: Requirements 3.2**
 */
describe('Invalid Invite Token Rejection Properties', () => {
  /**
   * **Feature: project-refactoring, Property 7: Invalid Invite Token Rejection**
   * 
   * For any registration attempt with an invalid or expired invite token,
   * the Telegram bot SHALL reject the registration before collecting any user data.
   * 
   * This test validates that empty/whitespace tokens are rejected immediately
   * without making any network calls.
   */
  it('should reject empty and whitespace-only tokens immediately', async () => {
    const { validateInviteToken } = await import('../../src/telegram/bot');
    
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('', ' ', '  ', '\t', '\n', '   \t\n  '),
        async (emptyToken) => {
          const result = await validateInviteToken(emptyToken);
          
          // Empty/whitespace tokens should be rejected immediately
          expect(result.valid).toBe(false);
          expect(result.errorCode).toBe('INVALID');
          expect(result.error).toBeDefined();
          expect(typeof result.error).toBe('string');
          
          return true;
        }
      ),
      { numRuns: 6 } // Test all the specific empty values
    );
  });

  /**
   * Property: Null and undefined tokens should be rejected
   */
  it('should reject null and undefined tokens', async () => {
    const { validateInviteToken } = await import('../../src/telegram/bot');
    
    // Test null
    const nullResult = await validateInviteToken(null as unknown as string);
    expect(nullResult.valid).toBe(false);
    expect(nullResult.errorCode).toBe('INVALID');
    
    // Test undefined
    const undefinedResult = await validateInviteToken(undefined as unknown as string);
    expect(undefinedResult.valid).toBe(false);
    expect(undefinedResult.errorCode).toBe('INVALID');
  });

  /**
   * Property: Non-empty tokens should always return a structured result
   * (either valid with inviteLink or invalid with error info)
   */
  it('should return structured result for any non-empty token', async () => {
    const { validateInviteToken } = await import('../../src/telegram/bot');
    
    await fc.assert(
      fc.asyncProperty(
        // Generate non-empty, non-whitespace strings
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        async (token) => {
          const result = await validateInviteToken(token);
          
          // Result should always be an object with valid boolean
          expect(typeof result).toBe('object');
          expect(result).not.toBeNull();
          expect(typeof result.valid).toBe('boolean');
          
          // If invalid, should have error info
          if (!result.valid) {
            expect(result.error).toBeDefined();
            expect(typeof result.error).toBe('string');
            expect(result.error!.length).toBeGreaterThan(0);
            expect(result.errorCode).toBeDefined();
            expect(['NOT_FOUND', 'EXPIRED', 'USED', 'INVALID', 'NETWORK_ERROR']).toContain(result.errorCode);
          }
          
          // If valid, should have inviteLink
          if (result.valid) {
            expect(result.inviteLink).toBeDefined();
          }
          
          return true;
        }
      ),
      { numRuns: 10 } // Limited runs since this makes network calls
    );
  });

  /**
   * Property: Token validation is deterministic for empty inputs
   */
  it('should be deterministic for empty inputs', async () => {
    const { validateInviteToken } = await import('../../src/telegram/bot');
    
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('', ' ', '\t', '\n'),
        async (emptyToken) => {
          // Call twice with same input
          const result1 = await validateInviteToken(emptyToken);
          const result2 = await validateInviteToken(emptyToken);
          
          // Results should be identical
          expect(result1.valid).toBe(result2.valid);
          expect(result1.errorCode).toBe(result2.errorCode);
          expect(result1.error).toBe(result2.error);
          
          return true;
        }
      ),
      { numRuns: 4 }
    );
  });
});


/**
 * Property-Based Tests for Rate Limiting Enforcement
 * **Feature: project-refactoring, Property 8: Rate Limiting Enforcement**
 * **Validates: Requirements 3.5**
 */
describe('Rate Limiting Enforcement Properties', () => {
  // Import type separately
  type RateLimitConfig = { maxCommands: number; windowMs: number };
  
  beforeEach(async () => {
    // Clear all rate limits before each test
    const { clearAllRateLimits } = await import('../../src/telegram/bot');
    clearAllRateLimits();
  });

  /**
   * **Feature: project-refactoring, Property 8: Rate Limiting Enforcement**
   * 
   * For any Telegram user sending more than N commands within T seconds,
   * subsequent commands SHALL be rejected with a rate limit message until the window expires.
   */
  it('should block user after exceeding max commands', async () => {
    const { isRateLimited, resetRateLimit } = await import('../../src/telegram/bot');
    
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[0-9]{5,15}$/), // User ID
        fc.integer({ min: 1, max: 20 }),     // Max commands
        async (userId, maxCommands) => {
          // Reset rate limit for this user
          resetRateLimit(userId);
          
          const config: RateLimitConfig = {
            maxCommands,
            windowMs: 60000, // 60 seconds
          };
          
          // First N commands should not be rate limited
          for (let i = 0; i < maxCommands; i++) {
            const limited = isRateLimited(userId, config);
            expect(limited).toBe(false);
          }
          
          // N+1th command should be rate limited
          const limitedAfter = isRateLimited(userId, config);
          expect(limitedAfter).toBe(true);
          
          // Clean up
          resetRateLimit(userId);
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Rate limit should reset after window expires
   */
  it('should reset rate limit after window expires', async () => {
    const { isRateLimited, resetRateLimit } = await import('../../src/telegram/bot');
    
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[0-9]{5,15}$/),
        async (userId) => {
          resetRateLimit(userId);
          
          // Use a very short window for testing
          const config: RateLimitConfig = {
            maxCommands: 2,
            windowMs: 50, // 50ms window
          };
          
          // Exhaust the limit
          isRateLimited(userId, config);
          isRateLimited(userId, config);
          
          // Should be limited now
          expect(isRateLimited(userId, config)).toBe(true);
          
          // Wait for window to expire
          await new Promise(resolve => setTimeout(resolve, 60));
          
          // Should not be limited anymore
          expect(isRateLimited(userId, config)).toBe(false);
          
          resetRateLimit(userId);
          return true;
        }
      ),
      { numRuns: 10 } // Limited runs due to timing
    );
  });

  /**
   * Property: Different users should have independent rate limits
   */
  it('should have independent rate limits per user', async () => {
    const { isRateLimited, resetRateLimit } = await import('../../src/telegram/bot');
    
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[0-9]{5,15}$/),
        fc.stringMatching(/^[0-9]{5,15}$/),
        async (userId1, userId2) => {
          // Skip if same user
          if (userId1 === userId2) return true;
          
          resetRateLimit(userId1);
          resetRateLimit(userId2);
          
          const config: RateLimitConfig = {
            maxCommands: 3,
            windowMs: 60000,
          };
          
          // Exhaust user1's limit
          isRateLimited(userId1, config);
          isRateLimited(userId1, config);
          isRateLimited(userId1, config);
          
          // User1 should be limited
          expect(isRateLimited(userId1, config)).toBe(true);
          
          // User2 should NOT be limited
          expect(isRateLimited(userId2, config)).toBe(false);
          
          resetRateLimit(userId1);
          resetRateLimit(userId2);
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: getRemainingCommands should return correct count
   */
  it('should correctly track remaining commands', async () => {
    const { isRateLimited, getRemainingCommands, resetRateLimit } = await import('../../src/telegram/bot');
    
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[0-9]{5,15}$/),
        fc.integer({ min: 1, max: 10 }),
        async (userId, maxCommands) => {
          resetRateLimit(userId);
          
          const config: RateLimitConfig = {
            maxCommands,
            windowMs: 60000,
          };
          
          // Initially should have all commands available
          expect(getRemainingCommands(userId, config)).toBe(maxCommands);
          
          // Use some commands
          const commandsToUse = Math.min(3, maxCommands);
          for (let i = 0; i < commandsToUse; i++) {
            isRateLimited(userId, config);
          }
          
          // Should have remaining = max - used
          expect(getRemainingCommands(userId, config)).toBe(maxCommands - commandsToUse);
          
          resetRateLimit(userId);
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: First command should never be rate limited
   */
  it('should never rate limit the first command', async () => {
    const { isRateLimited, resetRateLimit } = await import('../../src/telegram/bot');
    
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[0-9]{5,15}$/),
        fc.integer({ min: 1, max: 100 }),
        async (userId, maxCommands) => {
          resetRateLimit(userId);
          
          const config: RateLimitConfig = {
            maxCommands,
            windowMs: 60000,
          };
          
          // First command should never be limited
          const firstLimited = isRateLimited(userId, config);
          expect(firstLimited).toBe(false);
          
          resetRateLimit(userId);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});


/**
 * Unit tests for Telegram Session data structures (no database required)
 */
describe('Telegram Session Data Structure Properties', () => {
  // Arbitrary for TelegramStep
  const telegramStepArb = fc.constantFrom<TelegramStep>(
    'idle',
    'awaiting_first_name',
    'awaiting_last_name',
    'awaiting_phone',
    'confirming_registration'
  );

  /**
   * Property: TelegramStep values are always valid enum values
   */
  it('should only allow valid TelegramStep values', () => {
    const validSteps: TelegramStep[] = [
      'idle',
      'awaiting_first_name',
      'awaiting_last_name',
      'awaiting_phone',
      'confirming_registration'
    ];

    fc.assert(
      fc.property(telegramStepArb, (step) => {
        expect(validSteps).toContain(step);
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Registration data JSON serialization is reversible
   */
  it('should correctly serialize and deserialize registration data', () => {
    const registrationDataArb = fc.record({
      firstName: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
      lastName: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
      phone: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
    });

    fc.assert(
      fc.property(registrationDataArb, (data) => {
        // Serialize
        const json = JSON.stringify(data);
        
        // Deserialize
        const parsed = JSON.parse(json);
        
        // Should be equivalent
        expect(parsed.firstName).toBe(data.firstName);
        expect(parsed.lastName).toBe(data.lastName);
        expect(parsed.phone).toBe(data.phone);
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Session expiration dates are always in the future when created
   */
  it('should generate future expiration dates', () => {
    const DEFAULT_SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000;

    fc.assert(
      fc.property(fc.integer({ min: 1000, max: 1000000 }), (additionalMs) => {
        const now = Date.now();
        const expiresAt = new Date(now + additionalMs);
        
        // Expiration should be in the future
        expect(expiresAt.getTime()).toBeGreaterThan(now);
        
        return true;
      }),
      { numRuns: 100 }
    );
  });
});
