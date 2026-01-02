/**
 * Base Repository (PostgreSQL)
 * Common functionality for all repositories
 * Requirements: 10.4
 */

import { pgPool, generateId } from '../../utils/db';

/**
 * Re-export generateId for backward compatibility
 */
export { generateId };

/**
 * Base repository options
 */
export interface BaseRepositoryOptions {
  tableName: string;
  hasTimestamps?: boolean;
}

/**
 * Where clause type
 */
export type WhereClause = Record<string, any>;

/**
 * Order by clause type
 */
export type OrderByClause = Record<string, 'asc' | 'desc'>;

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
 * Build WHERE clause with PostgreSQL placeholders
 */
function buildWhereClause(where: WhereClause, startIndex: number = 1): { sql: string; params: any[]; nextIndex: number } {
  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = startIndex;

  for (const [key, value] of Object.entries(where)) {
    if (value === null) {
      conditions.push(`"${key}" IS NULL`);
    } else if (value === undefined) {
      continue;
    } else if (typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      for (const [op, opValue] of Object.entries(value)) {
        if (op === 'in' && Array.isArray(opValue)) {
          if (opValue.length === 0) {
            conditions.push('FALSE');
          } else {
            const placeholders = opValue.map((_, i) => `$${paramIndex + i}`).join(', ');
            conditions.push(`"${key}" IN (${placeholders})`);
            params.push(...opValue);
            paramIndex += opValue.length;
          }
        } else if (op === 'gte' || op === 'lte' || op === 'gt' || op === 'lt') {
          const operator = op === 'gte' ? '>=' : op === 'lte' ? '<=' : op === 'gt' ? '>' : '<';
          conditions.push(`"${key}" ${operator} $${paramIndex}`);
          params.push(opValue instanceof Date ? opValue.toISOString() : opValue);
          paramIndex++;
        } else if (op === 'contains') {
          conditions.push(`"${key}" ILIKE $${paramIndex}`);
          params.push(`%${opValue}%`);
          paramIndex++;
        }
      }
    } else {
      conditions.push(`"${key}" = $${paramIndex}`);
      params.push(value);
      paramIndex++;
    }
  }

  return {
    sql: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
    nextIndex: paramIndex,
  };
}

/**
 * Build ORDER BY clause
 */
function buildOrderByClause(orderBy?: OrderByClause | OrderByClause[]): string {
  if (!orderBy) return '';
  
  const orders = Array.isArray(orderBy) ? orderBy : [orderBy];
  const parts: string[] = [];
  
  for (const order of orders) {
    for (const [key, direction] of Object.entries(order)) {
      parts.push(`"${key}" ${direction.toUpperCase()}`);
    }
  }
  
  return parts.length > 0 ? ` ORDER BY ${parts.join(', ')}` : '';
}

/**
 * Create a base repository with common CRUD operations
 */
export function createBaseRepository<T extends { id: string }>(options: BaseRepositoryOptions) {
  const { tableName, hasTimestamps = true } = options;

  return {
    /**
     * Find a single record by ID
     */
    async findById(id: string): Promise<T | null> {
      const result = await pgPool.query(`SELECT * FROM "${tableName}" WHERE "id" = $1`, [id]);
      return result.rows[0] || null;
    },

    /**
     * Find a single record matching the where clause
     */
    async findFirst(options: FindOptions<T> = {}): Promise<T | null> {
      const { where = {}, orderBy } = options;
      const { sql: whereSql, params } = buildWhereClause(where);
      const orderBySql = buildOrderByClause(orderBy);
      
      const sql = `SELECT * FROM "${tableName}"${whereSql ? ' ' + whereSql : ''}${orderBySql} LIMIT 1`;
      const result = await pgPool.query(sql, params);
      
      return result.rows[0] || null;
    },

    /**
     * Find all records matching the where clause
     */
    async findMany(options: FindOptions<T> = {}): Promise<T[]> {
      const { where = {}, orderBy, take, skip } = options;
      const { sql: whereSql, params, nextIndex } = buildWhereClause(where);
      const orderBySql = buildOrderByClause(orderBy);
      
      let sql = `SELECT * FROM "${tableName}"${whereSql ? ' ' + whereSql : ''}${orderBySql}`;
      let paramIndex = nextIndex;
      
      if (take !== undefined) {
        sql += ` LIMIT $${paramIndex}`;
        params.push(take);
        paramIndex++;
      }
      if (skip !== undefined) {
        sql += ` OFFSET $${paramIndex}`;
        params.push(skip);
      }
      
      const result = await pgPool.query(sql, params);
      return result.rows;
    },

    /**
     * Count records matching the where clause
     */
    async count(where: WhereClause = {}): Promise<number> {
      const { sql: whereSql, params } = buildWhereClause(where);
      const sql = `SELECT COUNT(*) as count FROM "${tableName}"${whereSql ? ' ' + whereSql : ''}`;
      const result = await pgPool.query(sql, params);
      return parseInt(result.rows[0].count, 10);
    },

    /**
     * Check if a record exists
     */
    async exists(where: WhereClause): Promise<boolean> {
      return (await this.count(where)) > 0;
    },

    /**
     * Create a new record
     */
    async create(data: Omit<T, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<T> {
      const id = data.id || generateId();
      const now = new Date().toISOString();
      
      const fields: string[] = ['id'];
      const values: unknown[] = [id];
      
      for (const [key, value] of Object.entries(data)) {
        if (key === 'id') continue;
        fields.push(key);
        const v = value as unknown;
        values.push(v instanceof Date ? v.toISOString() : v);
      }
      
      if (hasTimestamps) {
        if (!fields.includes('createdAt')) {
          fields.push('createdAt');
          values.push(now);
        }
        if (!fields.includes('updatedAt')) {
          fields.push('updatedAt');
          values.push(now);
        }
      }
      
      const placeholders = fields.map((_, i) => `$${i + 1}`).join(', ');
      const fieldNames = fields.map(f => `"${f}"`).join(', ');
      const sql = `INSERT INTO "${tableName}" (${fieldNames}) VALUES (${placeholders}) RETURNING *`;
      
      const result = await pgPool.query(sql, values);
      return result.rows[0];
    },

    /**
     * Update a record by ID
     */
    async updateById(id: string, data: Partial<Omit<T, 'id' | 'createdAt'>>): Promise<T | null> {
      const now = new Date().toISOString();
      const setParts: string[] = [];
      const params: unknown[] = [];
      let paramIndex = 1;
      
      for (const [key, value] of Object.entries(data)) {
        if (key === 'id' || key === 'createdAt' || value === undefined) continue;
        
        if (value === null) {
          setParts.push(`"${key}" = NULL`);
        } else {
          setParts.push(`"${key}" = $${paramIndex}`);
          params.push(value instanceof Date ? value.toISOString() : value);
          paramIndex++;
        }
      }
      
      if (hasTimestamps && !setParts.some(p => p.includes('updatedAt'))) {
        setParts.push(`"updatedAt" = $${paramIndex}`);
        params.push(now);
        paramIndex++;
      }
      
      if (setParts.length === 0) {
        return this.findById(id);
      }
      
      params.push(id);
      const sql = `UPDATE "${tableName}" SET ${setParts.join(', ')} WHERE "id" = $${paramIndex} RETURNING *`;
      const result = await pgPool.query(sql, params);
      
      return result.rows[0] || null;
    },

    /**
     * Update records matching the where clause
     */
    async updateMany(where: WhereClause, data: Partial<Omit<T, 'id' | 'createdAt'>>): Promise<number> {
      const now = new Date().toISOString();
      const setParts: string[] = [];
      const setParams: unknown[] = [];
      let paramIndex = 1;
      
      for (const [key, value] of Object.entries(data)) {
        if (key === 'id' || key === 'createdAt' || value === undefined) continue;
        
        if (value === null) {
          setParts.push(`"${key}" = NULL`);
        } else {
          setParts.push(`"${key}" = $${paramIndex}`);
          setParams.push(value instanceof Date ? value.toISOString() : value);
          paramIndex++;
        }
      }
      
      if (hasTimestamps && !setParts.some(p => p.includes('updatedAt'))) {
        setParts.push(`"updatedAt" = $${paramIndex}`);
        setParams.push(now);
        paramIndex++;
      }
      
      if (setParts.length === 0) {
        return 0;
      }
      
      const { sql: whereSql, params: whereParams } = buildWhereClause(where, paramIndex);
      const sql = `UPDATE "${tableName}" SET ${setParts.join(', ')}${whereSql ? ' ' + whereSql : ''}`;
      const result = await pgPool.query(sql, [...setParams, ...whereParams]);
      
      return result.rowCount || 0;
    },

    /**
     * Delete a record by ID
     */
    async deleteById(id: string): Promise<boolean> {
      const result = await pgPool.query(`DELETE FROM "${tableName}" WHERE "id" = $1`, [id]);
      return (result.rowCount || 0) > 0;
    },

    /**
     * Delete records matching the where clause
     */
    async deleteMany(where: WhereClause): Promise<number> {
      const { sql: whereSql, params } = buildWhereClause(where);
      const sql = `DELETE FROM "${tableName}"${whereSql ? ' ' + whereSql : ''}`;
      const result = await pgPool.query(sql, params);
      return result.rowCount || 0;
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
