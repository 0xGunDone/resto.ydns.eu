/**
 * Query Builder Module (PostgreSQL)
 * Handles building SQL WHERE clauses with proper typing
 * Requirements: 6.1
 */

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
  nextIndex: number;
}

/**
 * Convert value for PostgreSQL storage
 */
function toPostgresValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  
  if (value instanceof Date) {
    return value.toISOString();
  }
  
  return value;
}

/**
 * Build a single condition from a key-value pair (PostgreSQL version)
 */
function buildCondition(key: string, value: WhereValue, startIndex: number): { condition: string; params: unknown[]; nextIndex: number } {
  const params: unknown[] = [];
  let paramIndex = startIndex;
  
  if (value === null) {
    return { condition: `"${key}" IS NULL`, params: [], nextIndex: paramIndex };
  }
  
  if (value === undefined) {
    return { condition: '', params: [], nextIndex: paramIndex };
  }
  
  // Handle object operators
  if (typeof value === 'object' && !(value instanceof Date)) {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return { condition: '', params: [], nextIndex: paramIndex };
    }
    
    const [op, opValue] = entries[0];
    
    switch (op) {
      case 'contains':
        return { 
          condition: `"${key}" ILIKE $${paramIndex}`, 
          params: [`%${opValue}%`],
          nextIndex: paramIndex + 1
        };
      
      case 'startsWith':
        return { 
          condition: `"${key}" ILIKE $${paramIndex}`, 
          params: [`${opValue}%`],
          nextIndex: paramIndex + 1
        };
      
      case 'endsWith':
        return { 
          condition: `"${key}" ILIKE $${paramIndex}`, 
          params: [`%${opValue}`],
          nextIndex: paramIndex + 1
        };
      
      case 'in': {
        const inValues = opValue as (string | number)[];
        if (!Array.isArray(inValues) || inValues.length === 0) {
          return { condition: 'FALSE', params: [], nextIndex: paramIndex };
        }
        const placeholders = inValues.map((_, i) => `$${paramIndex + i}`).join(', ');
        return { 
          condition: `"${key}" IN (${placeholders})`, 
          params: inValues,
          nextIndex: paramIndex + inValues.length
        };
      }
      
      case 'gt':
        return { 
          condition: `"${key}" > $${paramIndex}`, 
          params: [toPostgresValue(opValue)],
          nextIndex: paramIndex + 1
        };
      
      case 'gte':
        return { 
          condition: `"${key}" >= $${paramIndex}`, 
          params: [toPostgresValue(opValue)],
          nextIndex: paramIndex + 1
        };
      
      case 'lt':
        return { 
          condition: `"${key}" < $${paramIndex}`, 
          params: [toPostgresValue(opValue)],
          nextIndex: paramIndex + 1
        };
      
      case 'lte':
        return { 
          condition: `"${key}" <= $${paramIndex}`, 
          params: [toPostgresValue(opValue)],
          nextIndex: paramIndex + 1
        };
      
      default:
        return { 
          condition: `"${key}" = $${paramIndex}`, 
          params: [toPostgresValue(value)],
          nextIndex: paramIndex + 1
        };
    }
  }
  
  // Simple equality
  return { 
    condition: `"${key}" = $${paramIndex}`, 
    params: [toPostgresValue(value)],
    nextIndex: paramIndex + 1
  };
}

/**
 * Build WHERE clause from a where object (PostgreSQL version)
 * Uses $1, $2, etc. placeholders instead of ?
 * 
 * @param where - Where clause object
 * @param startIndex - Starting parameter index (default 1)
 * @returns SQL string, parameters, and next available index
 */
export function buildWhereClause(where: WhereClause, startIndex: number = 1): WhereClauseResult {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = startIndex;
  
  // Process OR conditions first
  if (where.OR && Array.isArray(where.OR) && where.OR.length > 0) {
    const orConditions: string[] = [];
    
    for (const orClause of where.OR) {
      const { sql: orSql, params: orParams, nextIndex } = buildWhereClause(orClause, paramIndex);
      if (orSql) {
        const cleanSql = orSql.replace(/^WHERE\s+/i, '');
        if (cleanSql) {
          orConditions.push(`(${cleanSql})`);
          params.push(...orParams);
          paramIndex = nextIndex;
        }
      }
    }
    
    if (orConditions.length > 0) {
      conditions.push(`(${orConditions.join(' OR ')})`);
    }
  }
  
  // Process AND conditions
  if (where.AND && Array.isArray(where.AND) && where.AND.length > 0) {
    const andConditions: string[] = [];
    
    for (const andClause of where.AND) {
      const { sql: andSql, params: andParams, nextIndex } = buildWhereClause(andClause, paramIndex);
      if (andSql) {
        const cleanSql = andSql.replace(/^WHERE\s+/i, '');
        if (cleanSql) {
          andConditions.push(`(${cleanSql})`);
          params.push(...andParams);
          paramIndex = nextIndex;
        }
      }
    }
    
    if (andConditions.length > 0) {
      conditions.push(`(${andConditions.join(' AND ')})`);
    }
  }
  
  // Process regular conditions (implicit AND)
  for (const [key, value] of Object.entries(where)) {
    if (key === 'OR' || key === 'AND') {
      continue;
    }
    
    if (value === undefined) {
      continue;
    }
    
    const { condition, params: condParams, nextIndex } = buildCondition(key, value as WhereValue, paramIndex);
    if (condition) {
      conditions.push(condition);
      params.push(...condParams);
      paramIndex = nextIndex;
    }
  }
  
  if (conditions.length === 0) {
    return { sql: '', params: [], nextIndex: paramIndex };
  }
  
  return {
    sql: `WHERE ${conditions.join(' AND ')}`,
    params,
    nextIndex: paramIndex,
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
  
  const parts = entries.map(([key, direction]) => `"${key}" ${direction === 'desc' ? 'DESC' : 'ASC'}`);
  return ` ORDER BY ${parts.join(', ')}`;
}

/**
 * Build LIMIT and OFFSET clause (PostgreSQL version)
 */
export function buildLimitOffsetClause(take?: number, skip?: number, startIndex: number = 1): { sql: string; params: unknown[]; nextIndex: number } {
  let clause = '';
  const params: unknown[] = [];
  let paramIndex = startIndex;
  
  if (take !== undefined) {
    clause += ` LIMIT $${paramIndex}`;
    params.push(take);
    paramIndex++;
  }
  if (skip !== undefined) {
    clause += ` OFFSET $${paramIndex}`;
    params.push(skip);
    paramIndex++;
  }
  
  return { sql: clause, params, nextIndex: paramIndex };
}

/**
 * Build a complete SELECT query (PostgreSQL version)
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
  
  const columnList = columns && columns.length > 0 
    ? columns.map(c => `"${c}"`).join(', ') 
    : '*';
  
  const { sql: whereSql, params, nextIndex } = buildWhereClause(where);
  const orderBySql = buildOrderByClause(orderBy);
  const { sql: limitOffsetSql, params: limitParams } = buildLimitOffsetClause(take, skip, nextIndex);
  
  const sql = `SELECT ${columnList} FROM "${table}"${whereSql ? ' ' + whereSql : ''}${orderBySql}${limitOffsetSql}`;
  
  return { sql, params: [...params, ...limitParams] };
}

/**
 * Build SET clause for UPDATE (PostgreSQL version)
 */
export interface UpdateData {
  [key: string]: unknown;
}

export function buildSetClause(data: UpdateData, excludeFields: string[] = ['id'], startIndex: number = 1): { setClause: string; params: unknown[]; nextIndex: number } {
  const setParts: string[] = [];
  const params: unknown[] = [];
  let paramIndex = startIndex;
  
  for (const [key, value] of Object.entries(data)) {
    if (excludeFields.includes(key) || value === undefined) {
      continue;
    }
    
    if (value === null) {
      setParts.push(`"${key}" = NULL`);
    } else if (typeof value === 'object' && value !== null && 'increment' in value) {
      setParts.push(`"${key}" = "${key}" + $${paramIndex}`);
      params.push((value as { increment: number }).increment);
      paramIndex++;
    } else {
      setParts.push(`"${key}" = $${paramIndex}`);
      params.push(toPostgresValue(value));
      paramIndex++;
    }
  }
  
  return {
    setClause: setParts.join(', '),
    params,
    nextIndex: paramIndex,
  };
}
