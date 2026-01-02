/**
 * Property-Based Tests for Transaction Atomicity
 * **Feature: project-refactoring, Property 14: Transaction Atomicity**
 * **Validates: Requirements 6.3**
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import Database from 'better-sqlite3';
import { createTransactionHelper } from '../../src/database/transaction';

describe('Transaction Atomicity Properties', () => {
  let db: Database.Database;
  let txHelper: ReturnType<typeof createTransactionHelper>;

  beforeEach(() => {
    // Create in-memory database for testing
    db = new Database(':memory:');
    
    // Create a test table
    db.exec(`
      CREATE TABLE test_items (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        value INTEGER NOT NULL
      )
    `);
    
    txHelper = createTransactionHelper(db);
  });

  afterEach(() => {
    db.close();
  });

  /**
   * **Feature: project-refactoring, Property 14: Transaction Atomicity**
   * 
   * For any transaction containing multiple operations where one operation fails,
   * all previous operations in the transaction SHALL be rolled back (no partial state).
   */
  it('should rollback all operations when one fails', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({
          name: fc.string({ minLength: 1, maxLength: 20 }),
          value: fc.integer({ min: 0, max: 1000 }),
        }), { minLength: 2, maxLength: 5 }),
        fc.integer({ min: 0, max: 4 }), // Index where failure should occur
        (items, failIndex) => {
          // Ensure failIndex is within bounds
          const actualFailIndex = failIndex % items.length;
          
          // Clear the table
          db.exec('DELETE FROM test_items');
          
          // Count before transaction
          const countBefore = (db.prepare('SELECT COUNT(*) as count FROM test_items').get() as { count: number }).count;
          expect(countBefore).toBe(0);
          
          // Attempt transaction that will fail at a specific point
          const result = txHelper.transaction(() => {
            const insertStmt = db.prepare('INSERT INTO test_items (name, value) VALUES (?, ?)');
            
            for (let i = 0; i < items.length; i++) {
              if (i === actualFailIndex) {
                // Simulate failure by throwing an error
                throw new Error(`Simulated failure at index ${i}`);
              }
              insertStmt.run(items[i].name, items[i].value);
            }
            
            return items.length;
          });
          
          // Transaction should have failed
          expect(result.success).toBe(false);
          expect(result.error).toBeDefined();
          
          // Count after failed transaction - should be same as before (0)
          const countAfter = (db.prepare('SELECT COUNT(*) as count FROM test_items').get() as { count: number }).count;
          expect(countAfter).toBe(0);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Successful transactions should commit all operations
   */
  it('should commit all operations on success', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({
          name: fc.string({ minLength: 1, maxLength: 20 }),
          value: fc.integer({ min: 0, max: 1000 }),
        }), { minLength: 1, maxLength: 5 }),
        (items) => {
          // Clear the table
          db.exec('DELETE FROM test_items');
          
          // Execute successful transaction
          const result = txHelper.transaction(() => {
            const insertStmt = db.prepare('INSERT INTO test_items (name, value) VALUES (?, ?)');
            
            for (const item of items) {
              insertStmt.run(item.name, item.value);
            }
            
            return items.length;
          });
          
          // Transaction should succeed
          expect(result.success).toBe(true);
          expect(result.data).toBe(items.length);
          
          // All items should be in the database
          const countAfter = (db.prepare('SELECT COUNT(*) as count FROM test_items').get() as { count: number }).count;
          expect(countAfter).toBe(items.length);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: atomicOperations should be all-or-nothing
   */
  it('should execute atomicOperations as all-or-nothing', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 2, maxLength: 5 }),
        fc.boolean(),
        (values, shouldFail) => {
          // Clear the table
          db.exec('DELETE FROM test_items');
          
          const operations = values.map((value, index) => () => {
            if (shouldFail && index === values.length - 1) {
              throw new Error('Simulated failure in last operation');
            }
            db.prepare('INSERT INTO test_items (name, value) VALUES (?, ?)').run(`item${index}`, value);
            return value;
          });
          
          const result = txHelper.atomicOperations(operations);
          
          const countAfter = (db.prepare('SELECT COUNT(*) as count FROM test_items').get() as { count: number }).count;
          
          if (shouldFail) {
            // All operations should be rolled back
            expect(result.success).toBe(false);
            expect(countAfter).toBe(0);
          } else {
            // All operations should be committed
            expect(result.success).toBe(true);
            expect(countAfter).toBe(values.length);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: transactionOrThrow should throw on failure
   */
  it('should throw error when transactionOrThrow fails', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 50 }), (errorMessage) => {
        expect(() => {
          txHelper.transactionOrThrow(() => {
            throw new Error(errorMessage);
          });
        }).toThrow(errorMessage);
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: transactionOrThrow should return value on success
   */
  it('should return value when transactionOrThrow succeeds', () => {
    fc.assert(
      fc.property(fc.integer(), (value) => {
        const result = txHelper.transactionOrThrow(() => value);
        expect(result).toBe(value);
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Savepoints should allow partial rollback
   */
  it('should support savepoints for partial rollback', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 1, max: 100 }),
        (value1, value2) => {
          // Clear the table
          db.exec('DELETE FROM test_items');
          
          // Start a transaction
          const result = txHelper.transaction(() => {
            // Insert first item
            db.prepare('INSERT INTO test_items (name, value) VALUES (?, ?)').run('item1', value1);
            
            // Try to insert second item with savepoint
            const savepointResult = txHelper.withSavepoint('inner', () => {
              db.prepare('INSERT INTO test_items (name, value) VALUES (?, ?)').run('item2', value2);
              throw new Error('Rollback savepoint');
            });
            
            // Savepoint should have failed
            expect(savepointResult.success).toBe(false);
            
            // First item should still be there (within transaction)
            const count = (db.prepare('SELECT COUNT(*) as count FROM test_items').get() as { count: number }).count;
            expect(count).toBe(1);
            
            return 'completed';
          });
          
          // Main transaction should succeed
          expect(result.success).toBe(true);
          
          // Only first item should be in database
          const finalCount = (db.prepare('SELECT COUNT(*) as count FROM test_items').get() as { count: number }).count;
          expect(finalCount).toBe(1);
          
          const item = db.prepare('SELECT * FROM test_items WHERE name = ?').get('item1') as { value: number };
          expect(item.value).toBe(value1);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Manual transaction control should work correctly
   */
  it('should support manual transaction control', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.boolean(),
        (value, shouldCommit) => {
          // Clear the table
          db.exec('DELETE FROM test_items');
          
          const tx = txHelper.beginTransaction();
          expect(tx.isActive()).toBe(true);
          
          db.prepare('INSERT INTO test_items (name, value) VALUES (?, ?)').run('manual', value);
          
          if (shouldCommit) {
            tx.commit();
          } else {
            tx.rollback();
          }
          
          expect(tx.isActive()).toBe(false);
          
          const count = (db.prepare('SELECT COUNT(*) as count FROM test_items').get() as { count: number }).count;
          
          if (shouldCommit) {
            expect(count).toBe(1);
          } else {
            expect(count).toBe(0);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
