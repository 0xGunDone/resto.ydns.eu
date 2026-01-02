/**
 * Query Builder Module
 * Handles building SQL WHERE clauses with proper typing
 * Requirements: 6.1
 */

import { toSqliteValue } from './typeConverters';

/**
 * Supported comparison operators
 */
export type ComparisonOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains' | 'startsWith' | 'endsWith';

/**
 * Where clause value types
 */
export type WhereValue = 
  | string 
  | number 
  | boolean 
  | null 
  | Date
  | { contains?: string }
  | { startsWith?: string }
  | { endsWith?: string }
  | { in?: (string | number)[] }
  | { gt?: number | string | Date }
  | { gte?: number | string | Date }
  | { lt?: number | string | Date }
  | { lte?: number | string | Date };

/**
 * Where clause structure
 */
export interface WhereClause {
  [key: string]: WhereValue | WhereClause[] | undefined;
  OR?: WhereClause[];
  AND?: WhereClause[];
}

/**
 * Result of building a WHERE clause
 */
export interface WhereClauseResult {
  sql: string;
  params: unknown[];
}

/**
 * Build a single condition from a key-value pair
 */
function buildCondition(key: string, value: WhereValue): { condition: string; params: unknown[] } {
  const params: unknown[] = [];
  
  if (value === null) {
    return { condition: `${key} IS NULL`, params: [] };
  }
  
  if (value === undefined) {
    return { condition: '', params: [] };
  }
  
  // Handle object operators
  if (typeof value === 'object' && !(value instanceof Date)) {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return { condition: '', params: [] };
    }
    
    const [op, opValue] = entries[0];
    
    switch (op) {
      case 'contains':
        return { condition: `${key} LIKE ?`, params: [`%${opValue}%`] };
      
      case 'startsWith':
        return { condition: `${key} LIKE ?`, params: [`${opValue}%`] };
      
      case 'endsWith':
        return { condition: `${key} LIKE ?`, params: [`%${opValue}`] };
      
      case 'in': {
        const inValues = opValue as (string | number)[];
        if (!Array.isArray(inValues) || inValues.length === 0) {
          // Empty array - return condition that's always false
          return { condition: '1 = 0', params: [] };
        }
        const placeholders = inValues.map(() => '?').join(', ');
        return { condition: `${key} IN (${placeholders})`, params: inValues };
      }
      
      case 'gt':
        return { condition: `${key} > ?`, params: [toSqliteValue(opValue)] };
      
      case 'gte':
        return { condition: `${key} >= ?`, params: [toSqliteValue(opValue)] };
      
      case 'lt':
        return { condition: `${key} < ?`, params: [toSqliteValue(opValue)] };
      
      case 'lte':
        return { condition: `${key} <= ?`, params: [toSqliteValue(opValue)] };
      
      default:
        // Unknown operator, treat as equality
        return { condition: `${key} = ?`, params: [toSqliteValue(value)] };
    }
  }
  
  // Simple equality
  return { condition: `${key} = ?`, params: [toSqliteValue(value)] };
}

/**
 * Build WHERE clause from a where object
 * Properly handles OR conditions by wrapping them in parentheses
 * 
 * @param where - Where clause object
 * @returns SQL string and parameters
 */
export function buildWhereClause(where: WhereClause): WhereClauseResult {
  const conditions: string[] = [];
  const params: unknown[] = [];
  
  // Process OR conditions first
  if (where.OR && Array.isArray(where.OR) && where.OR.length > 0) {
    const orConditions: string[] = [];
    
    for (const orClause of where.OR) {
      const { sql: orSql, params: orParams } = buildWhereClause(orClause);
      if (orSql) {
        // Remove 'WHERE ' prefix if present
        const cleanSql = orSql.replace(/^WHERE\s+/i, '');
        if (cleanSql) {
          orConditions.push(`(${cleanSql})`);
          params.push(...orParams);
        }
      }
    }
    
    if (orConditions.length > 0) {
      // Wrap all OR conditions in parentheses to ensure correct precedence
      conditions.push(`(${orConditions.join(' OR ')})`);
    }
  }
  
  // Process AND conditions
  if (where.AND && Array.isArray(where.AND) && where.AND.length > 0) {
    const andConditions: string[] = [];
    
    for (const andClause of where.AND) {
      const { sql: andSql, params: andParams } = buildWhereClause(andClause);
      if (andSql) {
        const cleanSql = andSql.replace(/^WHERE\s+/i, '');
        if (cleanSql) {
          andConditions.push(`(${cleanSql})`);
          params.push(...andParams);
        }
      }
    }
    
    if (andConditions.length > 0) {
      conditions.push(`(${andConditions.join(' AND ')})`);
    }
  }
  
  // Process regular conditions (implicit AND)
  for (const [key, value] of Object.entries(where)) {
    // Skip OR and AND as they're already processed
    if (key === 'OR' || key === 'AND') {
      continue;
    }
    
    if (value === undefined) {
      continue;
    }
    
    const { condition, params: condParams } = buildCondition(key, value as WhereValue);
    if (condition) {
      conditions.push(condition);
      params.push(...condParams);
    }
  }
  
  if (conditions.length === 0) {
    return { sql: '', params: [] };
  }
  
  return {
    sql: `WHERE ${conditions.join(' AND ')}`,
    params,
  };
}

/**
 * Build ORDER BY clause
 */
export interface OrderByClause {
  [key: string]: 'asc' | 'desc';
}

export function buildOrderByClause(orderBy: OrderByClause | OrderByClause[] | undefined): string {
  if (!orderBy) {
    return '';
  }
  
  const orderByObj = Array.isArray(orderBy) ? orderBy[0] : orderBy;
  if (!orderByObj) {
    return '';
  }
  
  const entries = Object.entries(orderByObj);
  if (entries.length === 0) {
    return '';
  }
  
  const [key, direction] = entries[0];
  return ` ORDER BY ${key} ${direction === 'desc' ? 'DESC' : 'ASC'}`;
}

/**
 * Build LIMIT and OFFSET clause
 */
export function buildLimitOffsetClause(take?: number, skip?: number): string {
  let clause = '';
  if (take !== undefined) {
    clause += ` LIMIT ${take}`;
  }
  if (skip !== undefined) {
    clause += ` OFFSET ${skip}`;
  }
  return clause;
}

/**
 * Build a complete SELECT query
 */
export interface SelectQueryOptions {
  table: string;
  where?: WhereClause;
  orderBy?: OrderByClause | OrderByClause[];
  take?: number;
  skip?: number;
  columns?: string[];
}

export function buildSelectQuery(options: SelectQueryOptions): { sql: string; params: unknown[] } {
  const { table, where = {}, orderBy, take, skip, columns } = options;
  
  const columnList = columns && columns.length > 0 ? columns.join(', ') : '*';
  const { sql: whereSql, params } = buildWhereClause(where);
  const orderBySql = buildOrderByClause(orderBy);
  const limitOffsetSql = buildLimitOffsetClause(take, skip);
  
  const sql = `SELECT ${columnList} FROM ${table}${whereSql ? ' ' + whereSql : ''}${orderBySql}${limitOffsetSql}`;
  
  return { sql, params };
}

/**
 * Build SET clause for UPDATE
 */
export interface UpdateData {
  [key: string]: unknown;
}

export function buildSetClause(data: UpdateData, excludeFields: string[] = ['id']): { setClause: string; params: unknown[] } {
  const setParts: string[] = [];
  const params: unknown[] = [];
  
  for (const [key, value] of Object.entries(data)) {
    if (excludeFields.includes(key) || value === undefined) {
      continue;
    }
    
    if (value === null) {
      setParts.push(`${key} = NULL`);
    } else if (typeof value === 'object' && value !== null && 'increment' in value) {
      // Handle increment operation
      setParts.push(`${key} = ${key} + ?`);
      params.push((value as { increment: number }).increment);
    } else {
      setParts.push(`${key} = ?`);
      params.push(toSqliteValue(value));
    }
  }
  
  return {
    setClause: setParts.join(', '),
    params,
  };
}
