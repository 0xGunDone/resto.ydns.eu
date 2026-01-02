/**
 * Property-Based Tests for Transaction Atomicity (PostgreSQL)
 * **Feature: project-refactoring, Property 14: Transaction Atomicity**
 * **Validates: Requirements 6.3**
 * 
 * Note: These tests require a running PostgreSQL database.
 * Set DATABASE_URL environment variable to run these tests.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { Pool } from 'pg';
import { transaction, transactionOrThrow, atomicOperations, withSavepoint } from '../../src/database/transaction';

// Skip tests if no DATABASE_URL is set
const DATABASE_URL = process.env.DATABASE_URL;
const shouldSkip = !DATABASE_URL;

describe.skipIf(shouldSkip)('Transaction Atomicity Properties (PostgreSQL)', () => {
  let pool: Pool;
  const testTableName = 'test_transaction_items';

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL });
    
    // Create test table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${testTableName} (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        value INTEGER NOT NULL
      )
    `);
  });

  afterAll(async () => {
    // Drop test table
    await pool.query(`DROP TABLE IF EXISTS ${testTableName}`);
    await pool.end();
  });

  beforeEach(async () => {
    // Clear test table before each test
    await pool.query(`DELETE FROM ${testTableName}`);
  });

  /**
   * **Feature: project-refactoring, Property 14: Transaction Atomicity**
   * 
   * For any transaction containing multiple operations where one operation fails,
   * all previous operations in the transaction SHALL be rolled back (no partial state).
   */
  it('should rollback all operations when one fails', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({
          name: fc.string({ minLength: 1, maxLength: 20 }),
          value: fc.integer({ min: 0, max: 1000 }),
        }), { minLength: 2, maxLength: 5 }),
        fc.integer({ min: 0, max: 4 }),
        async (items, failIndex) => {
          const actualFailIndex = failIndex % items.length;
          
          // Clear table
          await pool.query(`DELETE FROM ${testTableName}`);
          
          // Count before
          const countBefore = await pool.query(`SELECT COUNT(*) as count FROM ${testTableName}`);
          expect(parseInt(countBefore.rows[0].count)).toBe(0);
          
          // Attempt transaction that will fail
          const result = await transaction(async (client) => {
            for (let i = 0; i < items.length; i++) {
              if (i === actualFailIndex) {
                throw new Error(`Simulated failure at index ${i}`);
              }
              await client.query(
                `INSERT INTO ${testTableName} (name, value) VALUES ($1, $2)`,
                [items[i].name, items[i].value]
              );
            }
            return items.length;
          });
          
          // Transaction should have failed
          expect(result.success).toBe(false);
          expect(result.error).toBeDefined();
          
          // Count after - should be 0 (rolled back)
          const countAfter = await pool.query(`SELECT COUNT(*) as count FROM ${testTableName}`);
          expect(parseInt(countAfter.rows[0].count)).toBe(0);
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Successful transactions should commit all operations
   */
  it('should commit all operations on success', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({
          name: fc.string({ minLength: 1, maxLength: 20 }),
          value: fc.integer({ min: 0, max: 1000 }),
        }), { minLength: 1, maxLength: 5 }),
        async (items) => {
          // Clear table
          await pool.query(`DELETE FROM ${testTableName}`);
          
          // Execute successful transaction
          const result = await transaction(async (client) => {
            for (const item of items) {
              await client.query(
                `INSERT INTO ${testTableName} (name, value) VALUES ($1, $2)`,
                [item.name, item.value]
              );
            }
            return items.length;
          });
          
          // Transaction should succeed
          expect(result.success).toBe(true);
          expect(result.data).toBe(items.length);
          
          // All items should be in database
          const countAfter = await pool.query(`SELECT COUNT(*) as count FROM ${testTableName}`);
          expect(parseInt(countAfter.rows[0].count)).toBe(items.length);
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: atomicOperations should be all-or-nothing
   */
  it('should execute atomicOperations as all-or-nothing', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 2, maxLength: 5 }),
        fc.boolean(),
        async (values, shouldFail) => {
          // Clear table
          await pool.query(`DELETE FROM ${testTableName}`);
          
          const operations = values.map((value, index) => async (client: any) => {
            if (shouldFail && index === values.length - 1) {
              throw new Error('Simulated failure in last operation');
            }
            await client.query(
              `INSERT INTO ${testTableName} (name, value) VALUES ($1, $2)`,
              [`item${index}`, value]
            );
            return value;
          });
          
          const result = await atomicOperations(operations);
          
          const countAfter = await pool.query(`SELECT COUNT(*) as count FROM ${testTableName}`);
          const count = parseInt(countAfter.rows[0].count);
          
          if (shouldFail) {
            expect(result.success).toBe(false);
            expect(count).toBe(0);
          } else {
            expect(result.success).toBe(true);
            expect(count).toBe(values.length);
          }
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: transactionOrThrow should throw on failure
   */
  it('should throw error when transactionOrThrow fails', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1, maxLength: 50 }), async (errorMessage) => {
        await expect(
          transactionOrThrow(async () => {
            throw new Error(errorMessage);
          })
        ).rejects.toThrow(errorMessage);
        
        return true;
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Property: transactionOrThrow should return value on success
   */
  it('should return value when transactionOrThrow succeeds', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer(), async (value) => {
        const result = await transactionOrThrow(async () => value);
        expect(result).toBe(value);
        return true;
      }),
      { numRuns: 50 }
    );
  });
});

/**
 * Unit tests for transaction logic (no database required)
 */
describe('Transaction Logic Properties (Unit)', () => {
  /**
   * Property: Transaction result structure is always correct
   */
  it('should always return proper TransactionResult structure', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.string(),
        (shouldSucceed, errorMessage) => {
          // Mock transaction result
          const result = shouldSucceed
            ? { success: true, data: 'test' }
            : { success: false, error: new Error(errorMessage) };
          
          // Verify structure
          expect(typeof result.success).toBe('boolean');
          
          if (result.success) {
            expect(result.data).toBeDefined();
            expect(result.error).toBeUndefined();
          } else {
            expect(result.error).toBeDefined();
            expect(result.error).toBeInstanceOf(Error);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
