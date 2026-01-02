/**
 * Transaction Support Module (PostgreSQL)
 * Provides transaction support for database operations
 * Requirements: 6.3
 */

import { PoolClient } from 'pg';
import { pgPool } from '../utils/db';

/**
 * Transaction result type
 */
export interface TransactionResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
}

/**
 * Transaction callback type (async for PostgreSQL)
 */
export type TransactionCallback<T> = (client: PoolClient) => Promise<T>;

/**
 * Execute a function within a transaction
 * Automatically commits on success, rolls back on error
 * 
 * @param callback - Async function to execute within transaction
 * @returns Transaction result with data or error
 */
export async function transaction<T>(callback: TransactionCallback<T>): Promise<TransactionResult<T>> {
  const client = await pgPool.connect();
  
  try {
    await client.query('BEGIN');
    const data = await callback(client);
    await client.query('COMMIT');
    return { success: true, data };
  } catch (error) {
    await client.query('ROLLBACK');
    return { 
      success: false, 
      error: error instanceof Error ? error : new Error(String(error))
    };
  } finally {
    client.release();
  }
}

/**
 * Execute a function within a transaction, throwing on error
 * 
 * @param callback - Async function to execute within transaction
 * @returns Result of the callback
 * @throws Error if transaction fails
 */
export async function transactionOrThrow<T>(callback: TransactionCallback<T>): Promise<T> {
  const result = await transaction(callback);
  if (!result.success) {
    throw result.error;
  }
  return result.data as T;
}

/**
 * Execute multiple operations atomically
 * All operations must succeed or all are rolled back
 * 
 * @param operations - Array of async operations to execute
 * @returns Array of results from each operation
 */
export async function atomicOperations<T>(
  operations: Array<(client: PoolClient) => Promise<T>>
): Promise<TransactionResult<T[]>> {
  return transaction(async (client) => {
    const results: T[] = [];
    for (const op of operations) {
      results.push(await op(client));
    }
    return results;
  });
}

/**
 * Execute with savepoint (nested transaction support)
 * 
 * @param client - The pool client within an existing transaction
 * @param name - Savepoint name
 * @param callback - Async function to execute
 * @returns Transaction result
 */
export async function withSavepoint<T>(
  client: PoolClient,
  name: string,
  callback: () => Promise<T>
): Promise<TransactionResult<T>> {
  const savepointName = `sp_${name}_${Date.now()}`;
  
  try {
    await client.query(`SAVEPOINT ${savepointName}`);
    const data = await callback();
    await client.query(`RELEASE SAVEPOINT ${savepointName}`);
    return { success: true, data };
  } catch (error) {
    await client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error))
    };
  }
}

/**
 * Create a transaction helper bound to a specific pool client
 * Useful for managing transactions within a service
 */
export function createTransactionHelper() {
  return {
    transaction,
    transactionOrThrow,
    atomicOperations,
    withSavepoint,
  };
}

/**
 * Type for the transaction helper
 */
export type TransactionHelper = ReturnType<typeof createTransactionHelper>;
