/**
 * PostgreSQL Database Adapter
 * Wrapper over pg library implementing the DatabaseAdapter interface
 * Requirements: 10.1, 12.3
 */

import { Pool, PoolClient, PoolConfig, QueryResult as PgQueryResult } from 'pg';
import { DatabaseAdapter, DatabaseConfig, ExecuteResult, TransactionCallback } from './types';

/**
 * PostgreSQL adapter implementation
 * Provides connection pooling and async operations
 */
export class PostgreSQLAdapter implements DatabaseAdapter {
  private pool: Pool;
  private connected: boolean = false;

  constructor(config: DatabaseConfig) {
    const poolConfig: PoolConfig = {
      connectionString: config.url,
      max: config.maxConnections ?? 10,
      idleTimeoutMillis: config.idleTimeoutMs ?? 30000,
      connectionTimeoutMillis: config.connectionTimeoutMs ?? 5000,
    };

    this.pool = new Pool(poolConfig);
    this.connected = true;

    // Handle pool errors
    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle PostgreSQL client', err);
    });
  }

  /**
   * Get the underlying pg Pool instance
   * Useful for advanced operations or direct access
   */
  getPool(): Pool {
    return this.pool;
  }

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    this.ensureConnected();
    
    // Convert SQLite-style placeholders (?) to PostgreSQL-style ($1, $2)
    const normalizedSql = this.normalizePlaceholders(sql);
    const normalizedParams = this.normalizeParams(params);
    
    const result: PgQueryResult<T> = await this.pool.query(normalizedSql, normalizedParams);
    
    return result.rows;
  }

  async queryOne<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  async execute(sql: string, params: unknown[] = []): Promise<ExecuteResult> {
    this.ensureConnected();
    
    // Convert SQLite-style placeholders (?) to PostgreSQL-style ($1, $2)
    const normalizedSql = this.normalizePlaceholders(sql);
    const normalizedParams = this.normalizeParams(params);
    
    const result = await this.pool.query(normalizedSql, normalizedParams);
    
    return {
      changes: result.rowCount ?? 0,
    };
  }

  async transaction<T>(callback: TransactionCallback<T>): Promise<T> {
    this.ensureConnected();
    
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Create a scoped adapter for the transaction
      const txAdapter = new PostgreSQLTransactionAdapter(client);
      
      // Store the transaction adapter in a way the callback can access it
      // This is a simplified approach - in production you might use AsyncLocalStorage
      (this as any)._currentTransaction = txAdapter;
      
      const result = await callback();
      
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      (this as any)._currentTransaction = undefined;
      client.release();
    }
  }

  async close(): Promise<void> {
    if (this.connected) {
      await this.pool.end();
      this.connected = false;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  getType(): 'postgresql' {
    return 'postgresql';
  }

  /**
   * Convert SQLite-style placeholders (?) to PostgreSQL-style ($1, $2, etc.)
   */
  private normalizePlaceholders(sql: string): string {
    let paramIndex = 0;
    return sql.replace(/\?/g, () => {
      paramIndex++;
      return `$${paramIndex}`;
    });
  }

  /**
   * Normalize parameters for PostgreSQL
   */
  private normalizeParams(params: unknown[]): unknown[] {
    return params.map(param => {
      if (param instanceof Date) {
        return param.toISOString();
      }
      return param;
    });
  }

  /**
   * Ensure the database connection is active
   */
  private ensureConnected(): void {
    if (!this.connected) {
      throw new Error('Database connection is closed');
    }
  }
}

/**
 * Transaction-scoped adapter for PostgreSQL
 * Uses a single client for all operations within a transaction
 */
class PostgreSQLTransactionAdapter {
  constructor(private client: PoolClient) {}

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const normalizedSql = this.normalizePlaceholders(sql);
    const normalizedParams = this.normalizeParams(params);
    
    const result: PgQueryResult<T> = await this.client.query(normalizedSql, normalizedParams);
    return result.rows;
  }

  async queryOne<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  async execute(sql: string, params: unknown[] = []): Promise<ExecuteResult> {
    const normalizedSql = this.normalizePlaceholders(sql);
    const normalizedParams = this.normalizeParams(params);
    
    const result = await this.client.query(normalizedSql, normalizedParams);
    
    return {
      changes: result.rowCount ?? 0,
    };
  }

  private normalizePlaceholders(sql: string): string {
    let paramIndex = 0;
    return sql.replace(/\?/g, () => {
      paramIndex++;
      return `$${paramIndex}`;
    });
  }

  private normalizeParams(params: unknown[]): unknown[] {
    return params.map(param => {
      if (param instanceof Date) {
        return param.toISOString();
      }
      return param;
    });
  }
}

/**
 * Create a new PostgreSQL adapter instance
 */
export function createPostgreSQLAdapter(config: DatabaseConfig): PostgreSQLAdapter {
  return new PostgreSQLAdapter(config);
}
