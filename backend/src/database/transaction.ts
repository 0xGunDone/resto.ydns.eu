/**
 * Transaction Support Module
 * Provides transaction support for database operations
 * Requirements: 6.3
 */

import Database from 'better-sqlite3';

/**
 * Transaction result type
 */
export interface TransactionResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
}

/**
 * Transaction callback type
 */
export type TransactionCallback<T> = () => T;

/**
 * Create a transaction wrapper for a database connection
 * 
 * @param db - The database connection
 * @returns Transaction helper functions
 */
export function createTransactionHelper(db: Database.Database) {
  /**
   * Execute a function within a transaction
   * Automatically commits on success, rolls back on error
   * 
   * @param callback - Function to execute within transaction
   * @returns Transaction result with data or error
   */
  function transaction<T>(callback: TransactionCallback<T>): TransactionResult<T> {
    const txn = db.transaction(callback);
    
    try {
      const data = txn();
      return { success: true, data };
    } catch (error) {
      // Transaction is automatically rolled back by better-sqlite3
      return { 
        success: false, 
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * Execute a function within a transaction, throwing on error
   * 
   * @param callback - Function to execute within transaction
   * @returns Result of the callback
   * @throws Error if transaction fails
   */
  function transactionOrThrow<T>(callback: TransactionCallback<T>): T {
    const result = transaction(callback);
    if (!result.success) {
      throw result.error;
    }
    return result.data as T;
  }

  /**
   * Execute multiple operations atomically
   * All operations must succeed or all are rolled back
   * 
   * @param operations - Array of operations to execute
   * @returns Array of results from each operation
   */
  function atomicOperations<T>(operations: Array<() => T>): TransactionResult<T[]> {
    return transaction(() => {
      const results: T[] = [];
      for (const op of operations) {
        results.push(op());
      }
      return results;
    });
  }

  /**
   * Begin a manual transaction (for advanced use cases)
   * Returns control functions for commit/rollback
   */
  function beginTransaction(): {
    commit: () => void;
    rollback: () => void;
    isActive: () => boolean;
  } {
    let active = true;
    
    db.exec('BEGIN TRANSACTION');
    
    return {
      commit: () => {
        if (active) {
          db.exec('COMMIT');
          active = false;
        }
      },
      rollback: () => {
        if (active) {
          db.exec('ROLLBACK');
          active = false;
        }
      },
      isActive: () => active,
    };
  }

  /**
   * Execute with savepoint (nested transaction support)
   * 
   * @param name - Savepoint name
   * @param callback - Function to execute
   * @returns Transaction result
   */
  function withSavepoint<T>(name: string, callback: TransactionCallback<T>): TransactionResult<T> {
    const savepointName = `sp_${name}_${Date.now()}`;
    
    try {
      db.exec(`SAVEPOINT ${savepointName}`);
      const data = callback();
      db.exec(`RELEASE SAVEPOINT ${savepointName}`);
      return { success: true, data };
    } catch (error) {
      db.exec(`ROLLBACK TO SAVEPOINT ${savepointName}`);
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  return {
    transaction,
    transactionOrThrow,
    atomicOperations,
    beginTransaction,
    withSavepoint,
  };
}

/**
 * Type for the transaction helper
 */
export type TransactionHelper = ReturnType<typeof createTransactionHelper>;
