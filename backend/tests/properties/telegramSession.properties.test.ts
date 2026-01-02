/**
 * Property-Based Tests for Telegram Session Persistence
 * **Feature: project-refactoring, Property 6: Telegram Session Persistence Round-Trip**
 * **Validates: Requirements 3.4**
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import Database from 'better-sqlite3';
import { 
  createTelegramSessionRepository,
  RegistrationData 
} from '../../src/database/repositories/telegramSessionRepository';
import { TelegramStep } from '../../src/database/types';

describe('Telegram Session Persistence Properties', () => {
  let db: Database.Database;
  let repository: ReturnType<typeof createTelegramSessionRepository>;

  beforeEach(() => {
    // Create in-memory database for testing
    db = new Database(':memory:');
    
    // Create the TelegramSession table
    db.exec(`
      CREATE TABLE TelegramSession (
        id TEXT NOT NULL PRIMARY KEY,
        telegram_user_id TEXT NOT NULL,
        step TEXT NOT NULL DEFAULT 'idle',
        invite_token TEXT,
        registration_data TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL
      );
      
      CREATE UNIQUE INDEX TelegramSession_telegram_user_id_key ON TelegramSession(telegram_user_id);
      CREATE INDEX TelegramSession_expires_at_idx ON TelegramSession(expires_at);
    `);
    
    repository = createTelegramSessionRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  // Arbitrary for TelegramStep
  const telegramStepArb = fc.constantFrom<TelegramStep>(
    'idle',
    'awaiting_first_name',
    'awaiting_last_name',
    'awaiting_phone',
    'confirming_registration'
  );

  // Arbitrary for RegistrationData
  const registrationDataArb = fc.option(
    fc.record({
      firstName: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
      lastName: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
      phone: fc.option(fc.string({ minLength: 1, maxLength: 20 })),
    }),
    { nil: null }
  );

  // Arbitrary for telegram user ID (numeric string)
  const telegramUserIdArb = fc.stringMatching(/^[0-9]{5,15}$/);

  // Arbitrary for invite token
  const inviteTokenArb = fc.option(
    fc.string({ minLength: 10, maxLength: 50 }),
    { nil: null }
  );

  /**
   * **Feature: project-refactoring, Property 6: Telegram Session Persistence Round-Trip**
   * 
   * For any Telegram session saved to the database, after server restart,
   * loading the session by telegramUserId SHALL return an equivalent session object.
   */
  it('should persist and retrieve session with equivalent data (round-trip)', () => {
    fc.assert(
      fc.property(
        telegramUserIdArb,
        telegramStepArb,
        inviteTokenArb,
        registrationDataArb,
        (telegramUserId, step, inviteToken, registrationData) => {
          // Clean up any existing session
          repository.deleteByTelegramUserId(telegramUserId);
          
          // Create session with the generated data
          const created = repository.create({
            telegramUserId,
            step,
            inviteToken,
            registrationData: registrationData as RegistrationData | null,
          });
          
          // Verify creation
          expect(created).toBeDefined();
          expect(created.telegramUserId).toBe(telegramUserId);
          
          // Simulate "server restart" by creating a new repository instance
          const newRepository = createTelegramSessionRepository(db);
          
          // Load the session
          const loaded = newRepository.findByTelegramUserId(telegramUserId);
          
          // Verify round-trip
          expect(loaded).not.toBeNull();
          expect(loaded!.telegramUserId).toBe(telegramUserId);
          expect(loaded!.step).toBe(step);
          expect(loaded!.inviteToken).toBe(inviteToken);
          
          // Compare registration data
          if (registrationData === null) {
            expect(loaded!.registrationData).toBeNull();
          } else {
            const parsedData = JSON.parse(loaded!.registrationData!);
            expect(parsedData.firstName).toBe(registrationData.firstName);
            expect(parsedData.lastName).toBe(registrationData.lastName);
            expect(parsedData.phone).toBe(registrationData.phone);
          }
          
          // Clean up
          repository.deleteByTelegramUserId(telegramUserId);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Session updates should persist correctly
   */
  it('should persist session updates correctly', () => {
    fc.assert(
      fc.property(
        telegramUserIdArb,
        telegramStepArb,
        telegramStepArb,
        inviteTokenArb,
        registrationDataArb,
        (telegramUserId, initialStep, newStep, inviteToken, registrationData) => {
          // Clean up
          repository.deleteByTelegramUserId(telegramUserId);
          
          // Create initial session
          repository.create({
            telegramUserId,
            step: initialStep,
          });
          
          // Update session
          const updated = repository.updateByTelegramUserId(telegramUserId, {
            step: newStep,
            inviteToken,
            registrationData: registrationData as RegistrationData | null,
          });
          
          expect(updated).not.toBeNull();
          expect(updated!.step).toBe(newStep);
          expect(updated!.inviteToken).toBe(inviteToken);
          
          // Verify persistence with new repository
          const newRepository = createTelegramSessionRepository(db);
          const loaded = newRepository.findByTelegramUserId(telegramUserId);
          
          expect(loaded).not.toBeNull();
          expect(loaded!.step).toBe(newStep);
          expect(loaded!.inviteToken).toBe(inviteToken);
          
          // Clean up
          repository.deleteByTelegramUserId(telegramUserId);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Expired sessions should be cleaned up
   */
  it('should clean up expired sessions', () => {
    fc.assert(
      fc.property(
        fc.array(telegramUserIdArb, { minLength: 1, maxLength: 5 }),
        fc.array(fc.boolean(), { minLength: 1, maxLength: 5 }),
        (userIds, expiredFlags) => {
          // Ensure unique user IDs
          const uniqueUserIds = [...new Set(userIds)];
          
          // Clean up all
          for (const userId of uniqueUserIds) {
            repository.deleteByTelegramUserId(userId);
          }
          
          const now = Date.now();
          let expiredCount = 0;
          let activeCount = 0;
          
          // Create sessions with varying expiration
          for (let i = 0; i < uniqueUserIds.length; i++) {
            const isExpired = expiredFlags[i % expiredFlags.length];
            const expiresAt = isExpired 
              ? new Date(now - 1000).toISOString() // Expired 1 second ago
              : new Date(now + 24 * 60 * 60 * 1000).toISOString(); // Expires in 24 hours
            
            repository.create({
              telegramUserId: uniqueUserIds[i],
              expiresAt,
            });
            
            if (isExpired) {
              expiredCount++;
            } else {
              activeCount++;
            }
          }
          
          // Clean expired sessions
          const cleaned = repository.cleanExpiredSessions();
          
          // Verify correct number cleaned
          expect(cleaned).toBe(expiredCount);
          
          // Verify active sessions remain
          const remaining = repository.findAllActive();
          expect(remaining.length).toBe(activeCount);
          
          // Clean up
          for (const userId of uniqueUserIds) {
            repository.deleteByTelegramUserId(userId);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: getOrCreate should return existing or create new
   */
  it('should get existing session or create new one', () => {
    fc.assert(
      fc.property(
        telegramUserIdArb,
        fc.boolean(),
        (telegramUserId, sessionExists) => {
          // Clean up
          repository.deleteByTelegramUserId(telegramUserId);
          
          if (sessionExists) {
            // Create existing session
            repository.create({ telegramUserId, step: 'awaiting_first_name' });
          }
          
          // Call getOrCreate
          const session = repository.getOrCreate(telegramUserId);
          
          expect(session).toBeDefined();
          expect(session.telegramUserId).toBe(telegramUserId);
          
          if (sessionExists) {
            expect(session.step).toBe('awaiting_first_name');
          } else {
            expect(session.step).toBe('idle');
          }
          
          // Clean up
          repository.deleteByTelegramUserId(telegramUserId);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Delete should remove session
   */
  it('should delete session correctly', () => {
    fc.assert(
      fc.property(telegramUserIdArb, (telegramUserId) => {
        // Clean up
        repository.deleteByTelegramUserId(telegramUserId);
        
        // Create session
        repository.create({ telegramUserId });
        
        // Verify exists
        expect(repository.findByTelegramUserId(telegramUserId)).not.toBeNull();
        
        // Delete
        const deleted = repository.deleteByTelegramUserId(telegramUserId);
        expect(deleted).toBe(true);
        
        // Verify deleted
        expect(repository.findByTelegramUserId(telegramUserId)).toBeNull();
        
        // Delete again should return false
        const deletedAgain = repository.deleteByTelegramUserId(telegramUserId);
        expect(deletedAgain).toBe(false);
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Unique constraint on telegram_user_id
   */
  it('should enforce unique telegram_user_id', () => {
    fc.assert(
      fc.property(telegramUserIdArb, (telegramUserId) => {
        // Clean up
        repository.deleteByTelegramUserId(telegramUserId);
        
        // Create first session
        repository.create({ telegramUserId });
        
        // Attempt to create duplicate should fail
        expect(() => {
          repository.create({ telegramUserId });
        }).toThrow();
        
        // Clean up
        repository.deleteByTelegramUserId(telegramUserId);
        
        return true;
      }),
      { numRuns: 100 }
    );
  });
});


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
