/**
 * Database Adapters Module
 * Exports PostgreSQL adapter types and implementations
 * Requirements: 10.1, 10.3
 */

// Types
export * from './types';

// Adapters
export { PostgreSQLAdapter, createPostgreSQLAdapter } from './postgresAdapter';

// Factory
import { DatabaseAdapter, DatabaseConfig } from './types';
import { createPostgreSQLAdapter } from './postgresAdapter';

/**
 * Create a database adapter based on the configuration
 * Now only supports PostgreSQL
 * 
 * @param config - Database configuration
 * @returns Database adapter instance
 */
export function createDatabaseAdapter(config: DatabaseConfig): DatabaseAdapter {
  return createPostgreSQLAdapter(config);
}

/**
 * Create a database adapter from environment variables
 * Uses DATABASE_URL environment variable
 * 
 * @returns Database adapter instance
 */
export function createDatabaseAdapterFromEnv(): DatabaseAdapter {
  const url = process.env.DATABASE_URL || 'postgresql://localhost:5432/resto';
  
  return createDatabaseAdapter({
    url,
    maxConnections: process.env.DB_MAX_CONNECTIONS 
      ? parseInt(process.env.DB_MAX_CONNECTIONS, 10) 
      : undefined,
    idleTimeoutMs: process.env.DB_IDLE_TIMEOUT_MS 
      ? parseInt(process.env.DB_IDLE_TIMEOUT_MS, 10) 
      : undefined,
    connectionTimeoutMs: process.env.DB_CONNECTION_TIMEOUT_MS 
      ? parseInt(process.env.DB_CONNECTION_TIMEOUT_MS, 10) 
      : undefined,
  });
}
