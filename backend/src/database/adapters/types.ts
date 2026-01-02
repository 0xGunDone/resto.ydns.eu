/**
 * Database Adapter Types
 * Unified interface for database operations supporting both SQLite and PostgreSQL
 * Requirements: 10.3
 */

/**
 * Query result type for SELECT operations
 */
export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
}

/**
 * Execute result type for INSERT/UPDATE/DELETE operations
 */
export interface ExecuteResult {
  changes: number;
  lastInsertRowid?: number | bigint;
}

/**
 * Transaction callback type
 */
export type TransactionCallback<T> = () => Promise<T>;

/**
 * Database adapter interface
 * Provides a unified API for database operations across different database engines
 * Requirements: 10.3
 */
export interface DatabaseAdapter {
  /**
   * Execute a query and return all matching rows
   * @param sql - SQL query string with placeholders (? for SQLite, $1/$2 for PostgreSQL)
   * @param params - Query parameters
   * @returns Array of rows
   */
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;

  /**
   * Execute a query and return the first matching row or null
   * @param sql - SQL query string with placeholders
   * @param params - Query parameters
   * @returns Single row or null
   */
  queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>;

  /**
   * Execute a statement (INSERT, UPDATE, DELETE)
   * @param sql - SQL statement with placeholders
   * @param params - Statement parameters
   * @returns Result with number of affected rows
   */
  execute(sql: string, params?: unknown[]): Promise<ExecuteResult>;

  /**
   * Execute multiple statements within a transaction
   * Automatically commits on success, rolls back on error
   * @param callback - Async function containing database operations
   * @returns Result of the callback
   */
  transaction<T>(callback: TransactionCallback<T>): Promise<T>;

  /**
   * Close the database connection
   */
  close(): Promise<void>;

  /**
   * Check if the connection is active
   */
  isConnected(): boolean;

  /**
   * Get the database type
   */
  getType(): 'postgresql';
}

/**
 * Database configuration options
 */
export interface DatabaseConfig {
  /**
   * Database URL or file path
   * - SQLite: file path or ':memory:' for in-memory database
   * - PostgreSQL: connection string (postgresql://user:pass@host:port/db)
   */
  url: string;

  /**
   * Maximum number of connections in the pool (PostgreSQL only)
   */
  maxConnections?: number;

  /**
   * Idle timeout in milliseconds (PostgreSQL only)
   */
  idleTimeoutMs?: number;

  /**
   * Connection timeout in milliseconds (PostgreSQL only)
   */
  connectionTimeoutMs?: number;
}

/**
 * Factory function type for creating database adapters
 */
export type DatabaseAdapterFactory = (config: DatabaseConfig) => DatabaseAdapter;
