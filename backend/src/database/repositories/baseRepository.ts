/**
 * Base Repository
 * Common functionality for all repositories
 * Requirements: 10.4
 */

import Database from 'better-sqlite3';
import { randomBytes } from 'crypto';
import { convertBooleanFields, toSqliteValue } from '../typeConverters';
import { buildWhereClause, WhereClause, buildOrderByClause, OrderByClause } from '../queryBuilder';

/**
 * Generate a CUID-like ID
 */
export function generateId(): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(6).toString('hex');
  return `${timestamp}-${random}`;
}

/**
 * Base repository options
 */
export interface BaseRepositoryOptions {
  db: Database.Database;
  tableName: string;
  hasTimestamps?: boolean;
}

/**
 * Find options
 */
export interface FindOptions<T> {
  where?: WhereClause;
  orderBy?: OrderByClause | OrderByClause[];
  take?: number;
  skip?: number;
}

/**
 * Create a base repository with common CRUD operations
 */
export function createBaseRepository<T extends { id: string }>(options: BaseRepositoryOptions) {
  const { db, tableName, hasTimestamps = true } = options;

  return {
    /**
     * Find a single record by ID
     */
    findById(id: string): T | null {
      const row = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(id);
      return row ? convertBooleanFields(row as Record<string, unknown>) as T : null;
    },

    /**
     * Find a single record matching the where clause
     */
    findFirst(options: FindOptions<T> = {}): T | null {
      const { where = {}, orderBy } = options;
      const { sql: whereSql, params } = buildWhereClause(where);
      const orderBySql = buildOrderByClause(orderBy);
      
      const sql = `SELECT * FROM ${tableName}${whereSql ? ' ' + whereSql : ''}${orderBySql} LIMIT 1`;
      const row = db.prepare(sql).get(...params);
      
      return row ? convertBooleanFields(row as Record<string, unknown>) as T : null;
    },

    /**
     * Find all records matching the where clause
     */
    findMany(options: FindOptions<T> = {}): T[] {
      const { where = {}, orderBy, take, skip } = options;
      const { sql: whereSql, params } = buildWhereClause(where);
      const orderBySql = buildOrderByClause(orderBy);
      
      let sql = `SELECT * FROM ${tableName}${whereSql ? ' ' + whereSql : ''}${orderBySql}`;
      if (take !== undefined) sql += ` LIMIT ${take}`;
      if (skip !== undefined) sql += ` OFFSET ${skip}`;
      
      const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
      return rows.map(row => convertBooleanFields(row) as T);
    },

    /**
     * Count records matching the where clause
     */
    count(where: WhereClause = {}): number {
      const { sql: whereSql, params } = buildWhereClause(where);
      const sql = `SELECT COUNT(*) as count FROM ${tableName}${whereSql ? ' ' + whereSql : ''}`;
      const result = db.prepare(sql).get(...params) as { count: number };
      return result.count;
    },

    /**
     * Check if a record exists
     */
    exists(where: WhereClause): boolean {
      return this.count(where) > 0;
    },

    /**
     * Create a new record
     */
    create(data: Omit<T, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): T {
      const id = data.id || generateId();
      const now = new Date().toISOString();
      
      const fields: string[] = ['id'];
      const values: unknown[] = [id];
      const placeholders: string[] = ['?'];
      
      for (const [key, value] of Object.entries(data)) {
        if (key === 'id') continue;
        fields.push(key);
        values.push(toSqliteValue(value));
        placeholders.push('?');
      }
      
      if (hasTimestamps) {
        if (!fields.includes('createdAt')) {
          fields.push('createdAt');
          values.push(now);
          placeholders.push('?');
        }
        if (!fields.includes('updatedAt')) {
          fields.push('updatedAt');
          values.push(now);
          placeholders.push('?');
        }
      }
      
      const sql = `INSERT INTO ${tableName} (${fields.join(', ')}) VALUES (${placeholders.join(', ')})`;
      db.prepare(sql).run(...values);
      
      return this.findById(id) as T;
    },

    /**
     * Update a record by ID
     */
    updateById(id: string, data: Partial<Omit<T, 'id' | 'createdAt'>>): T | null {
      const now = new Date().toISOString();
      const setParts: string[] = [];
      const params: unknown[] = [];
      
      for (const [key, value] of Object.entries(data)) {
        if (key === 'id' || key === 'createdAt' || value === undefined) continue;
        
        if (value === null) {
          setParts.push(`${key} = NULL`);
        } else {
          setParts.push(`${key} = ?`);
          params.push(toSqliteValue(value));
        }
      }
      
      if (hasTimestamps && !setParts.some(p => p.startsWith('updatedAt'))) {
        setParts.push('updatedAt = ?');
        params.push(now);
      }
      
      if (setParts.length === 0) {
        return this.findById(id);
      }
      
      params.push(id);
      const sql = `UPDATE ${tableName} SET ${setParts.join(', ')} WHERE id = ?`;
      db.prepare(sql).run(...params);
      
      return this.findById(id);
    },

    /**
     * Update records matching the where clause
     */
    updateMany(where: WhereClause, data: Partial<Omit<T, 'id' | 'createdAt'>>): number {
      const now = new Date().toISOString();
      const setParts: string[] = [];
      const setParams: unknown[] = [];
      
      for (const [key, value] of Object.entries(data)) {
        if (key === 'id' || key === 'createdAt' || value === undefined) continue;
        
        if (value === null) {
          setParts.push(`${key} = NULL`);
        } else {
          setParts.push(`${key} = ?`);
          setParams.push(toSqliteValue(value));
        }
      }
      
      if (hasTimestamps && !setParts.some(p => p.startsWith('updatedAt'))) {
        setParts.push('updatedAt = ?');
        setParams.push(now);
      }
      
      if (setParts.length === 0) {
        return 0;
      }
      
      const { sql: whereSql, params: whereParams } = buildWhereClause(where);
      const sql = `UPDATE ${tableName} SET ${setParts.join(', ')}${whereSql ? ' ' + whereSql : ''}`;
      const result = db.prepare(sql).run(...setParams, ...whereParams);
      
      return result.changes;
    },

    /**
     * Delete a record by ID
     */
    deleteById(id: string): boolean {
      const result = db.prepare(`DELETE FROM ${tableName} WHERE id = ?`).run(id);
      return result.changes > 0;
    },

    /**
     * Delete records matching the where clause
     */
    deleteMany(where: WhereClause): number {
      const { sql: whereSql, params } = buildWhereClause(where);
      const sql = `DELETE FROM ${tableName}${whereSql ? ' ' + whereSql : ''}`;
      const result = db.prepare(sql).run(...params);
      return result.changes;
    },

    /**
     * Get the database connection (for advanced queries)
     */
    getDb(): Database.Database {
      return db;
    },

    /**
     * Get the table name
     */
    getTableName(): string {
      return tableName;
    },
  };
}

export type BaseRepository<T extends { id: string }> = ReturnType<typeof createBaseRepository<T>>;
