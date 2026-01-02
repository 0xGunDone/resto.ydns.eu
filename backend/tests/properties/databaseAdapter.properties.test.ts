/**
 * Property-Based Tests for Database Adapter Compatibility
 * **Feature: platform-upgrade, Property 11: Database adapter compatibility**
 * **Validates: Requirements 10.2, 10.3**
 * 
 * Note: These tests require a PostgreSQL database connection.
 * Set DATABASE_URL environment variable to run these tests.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// Skip all tests if DATABASE_URL is not set
const DATABASE_URL = process.env.DATABASE_URL;
const shouldSkip = !DATABASE_URL;

describe.skipIf(shouldSkip)('Database Adapter Compatibility Properties', () => {
  let pool: any;
  let testTableCreated = false;

  beforeAll(async () => {
    if (shouldSkip) return;
    
    const { Pool } = await import('pg');
    pool = new Pool({ connectionString: DATABASE_URL });
    
    // Create test table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS test_adapter_items (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        value INTEGER NOT NULL,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMPTZ NOT NULL
      )
    `);
    testTableCreated = true;
  });

  afterAll(async () => {
    if (pool && testTableCreated) {
      await pool.query('DROP TABLE IF EXISTS test_adapter_items');
      await pool.end();
    }
  });

  beforeEach(async () => {
    if (pool) {
      await pool.query('DELETE FROM test_adapter_items');
    }
  });

  /**
   * Property: INSERT then SELECT should return the same data
   */
  it('should maintain data integrity for insert and select operations', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          id: fc.uuid(),
          name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => !s.includes('\0')),
          value: fc.integer({ min: 0, max: 1000000 }),
          isActive: fc.boolean(),
        }),
        async (item) => {
          const now = new Date().toISOString();
          
          // Insert the item
          const insertResult = await pool.query(
            'INSERT INTO test_adapter_items (id, name, value, "isActive", "createdAt") VALUES ($1, $2, $3, $4, $5)',
            [item.id, item.name, item.value, item.isActive, now]
          );
          
          expect(insertResult.rowCount).toBe(1);
          
          // Query the item back
          const result = await pool.query(
            'SELECT * FROM test_adapter_items WHERE id = $1',
            [item.id]
          );
          
          expect(result.rows.length).toBe(1);
          const row = result.rows[0];
          expect(row.id).toBe(item.id);
          expect(row.name).toBe(item.name);
          expect(row.value).toBe(item.value);
          expect(row.isActive).toBe(item.isActive);
          
          // Clean up
          await pool.query('DELETE FROM test_adapter_items WHERE id = $1', [item.id]);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: UPDATE should modify only the specified row
   */
  it('should update only the specified row', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.uuid(),
            name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('\0')),
            value: fc.integer({ min: 0, max: 1000 }),
          }),
          { minLength: 2, maxLength: 5 }
        ),
        fc.integer({ min: 0, max: 4 }),
        fc.integer({ min: 1001, max: 2000 }),
        async (items, updateIndex, newValue) => {
          const now = new Date().toISOString();
          const actualIndex = updateIndex % items.length;
          
          // Insert all items
          for (const item of items) {
            await pool.query(
              'INSERT INTO test_adapter_items (id, name, value, "isActive", "createdAt") VALUES ($1, $2, $3, $4, $5)',
              [item.id, item.name, item.value, true, now]
            );
          }
          
          // Update one item
          const targetId = items[actualIndex].id;
          const updateResult = await pool.query(
            'UPDATE test_adapter_items SET value = $1 WHERE id = $2',
            [newValue, targetId]
          );
          
          expect(updateResult.rowCount).toBe(1);
          
          // Verify only the target was updated
          const result = await pool.query('SELECT id, value FROM test_adapter_items');
          
          for (const row of result.rows) {
            if (row.id === targetId) {
              expect(row.value).toBe(newValue);
            } else {
              const originalItem = items.find(i => i.id === row.id);
              expect(row.value).toBe(originalItem!.value);
            }
          }
          
          // Clean up
          await pool.query('DELETE FROM test_adapter_items');
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: DELETE should remove only the specified row
   */
  it('should delete only the specified row', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.uuid(),
            name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('\0')),
            value: fc.integer({ min: 0, max: 1000 }),
          }),
          { minLength: 2, maxLength: 5 }
        ),
        fc.integer({ min: 0, max: 4 }),
        async (items, deleteIndex) => {
          const now = new Date().toISOString();
          const actualIndex = deleteIndex % items.length;
          
          // Insert all items
          for (const item of items) {
            await pool.query(
              'INSERT INTO test_adapter_items (id, name, value, "isActive", "createdAt") VALUES ($1, $2, $3, $4, $5)',
              [item.id, item.name, item.value, true, now]
            );
          }
          
          // Delete one item
          const targetId = items[actualIndex].id;
          const deleteResult = await pool.query(
            'DELETE FROM test_adapter_items WHERE id = $1',
            [targetId]
          );
          
          expect(deleteResult.rowCount).toBe(1);
          
          // Verify count decreased by 1
          const result = await pool.query('SELECT id FROM test_adapter_items');
          expect(result.rows.length).toBe(items.length - 1);
          
          // Verify the deleted item is gone
          const deletedResult = await pool.query(
            'SELECT * FROM test_adapter_items WHERE id = $1',
            [targetId]
          );
          expect(deletedResult.rows.length).toBe(0);
          
          // Clean up
          await pool.query('DELETE FROM test_adapter_items');
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Transaction should be atomic - all or nothing
   */
  it('should rollback all operations on transaction failure', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.uuid(),
            name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('\0')),
            value: fc.integer({ min: 0, max: 1000 }),
          }),
          { minLength: 2, maxLength: 5 }
        ),
        fc.integer({ min: 0, max: 4 }),
        async (items, failIndex) => {
          const now = new Date().toISOString();
          const actualFailIndex = failIndex % items.length;
          
          // Count before transaction
          const countBefore = await pool.query('SELECT COUNT(*) as count FROM test_adapter_items');
          expect(parseInt(countBefore.rows[0].count)).toBe(0);
          
          // Attempt transaction that will fail
          const client = await pool.connect();
          try {
            await client.query('BEGIN');
            
            for (let i = 0; i < items.length; i++) {
              if (i === actualFailIndex) {
                throw new Error(`Simulated failure at index ${i}`);
              }
              await client.query(
                'INSERT INTO test_adapter_items (id, name, value, "isActive", "createdAt") VALUES ($1, $2, $3, $4, $5)',
                [items[i].id, items[i].name, items[i].value, true, now]
              );
            }
            
            await client.query('COMMIT');
            // Should not reach here
            expect(true).toBe(false);
          } catch (error) {
            await client.query('ROLLBACK');
            // Expected
            expect((error as Error).message).toContain('Simulated failure');
          } finally {
            client.release();
          }
          
          // Count after failed transaction - should be 0
          const countAfter = await pool.query('SELECT COUNT(*) as count FROM test_adapter_items');
          expect(parseInt(countAfter.rows[0].count)).toBe(0);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Transaction should commit all operations on success
   */
  it('should commit all operations on transaction success', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.uuid(),
            name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('\0')),
            value: fc.integer({ min: 0, max: 1000 }),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (items) => {
          const now = new Date().toISOString();
          
          // Execute successful transaction
          const client = await pool.connect();
          try {
            await client.query('BEGIN');
            
            for (const item of items) {
              await client.query(
                'INSERT INTO test_adapter_items (id, name, value, "isActive", "createdAt") VALUES ($1, $2, $3, $4, $5)',
                [item.id, item.name, item.value, true, now]
              );
            }
            
            await client.query('COMMIT');
          } catch (error) {
            await client.query('ROLLBACK');
            throw error;
          } finally {
            client.release();
          }
          
          // All items should be in the database
          const result = await pool.query('SELECT id FROM test_adapter_items');
          expect(result.rows.length).toBe(items.length);
          
          // Clean up
          await pool.query('DELETE FROM test_adapter_items');
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: query should return empty array for no matches
   */
  it('should return empty array when no rows match', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        async (nonExistentId) => {
          const result = await pool.query(
            'SELECT * FROM test_adapter_items WHERE id = $1',
            [nonExistentId]
          );
          expect(result.rows).toEqual([]);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Boolean fields should be handled correctly by PostgreSQL
   */
  it('should handle boolean fields correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          id: fc.uuid(),
          name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('\0')),
          value: fc.integer({ min: 0, max: 1000 }),
          isActive: fc.boolean(),
        }),
        async (item) => {
          const now = new Date().toISOString();
          
          // Insert with native boolean
          await pool.query(
            'INSERT INTO test_adapter_items (id, name, value, "isActive", "createdAt") VALUES ($1, $2, $3, $4, $5)',
            [item.id, item.name, item.value, item.isActive, now]
          );
          
          // Query should return boolean
          const result = await pool.query(
            'SELECT "isActive" FROM test_adapter_items WHERE id = $1',
            [item.id]
          );
          
          expect(typeof result.rows[0].isActive).toBe('boolean');
          expect(result.rows[0].isActive).toBe(item.isActive);
          
          // Clean up
          await pool.query('DELETE FROM test_adapter_items WHERE id = $1', [item.id]);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
