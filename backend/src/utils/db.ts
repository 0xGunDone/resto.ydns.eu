/**
 * Database Client (PostgreSQL)
 * 
 * This module provides a Prisma-like API for PostgreSQL using pg.
 * The dbClient object mimics Prisma's interface for easier migration if needed.
 */
import { Pool, PoolClient } from 'pg';
import { randomBytes } from 'crypto';
import { logger } from '../services/loggerService';

// Генерация UUID-подобного ID
function generateId(): string {
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Инициализация PostgreSQL Pool
const connectionString = process.env.DATABASE_URL || 'postgresql://localhost:5432/resto';

const pool = new Pool({
  connectionString,
  max: parseInt(process.env.DB_MAX_CONNECTIONS || '10', 10),
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT_MS || '30000', 10),
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT_MS || '5000', 10),
});

// Handle pool errors
pool.on('error', (err) => {
  logger.error('Unexpected error on idle PostgreSQL client', { error: err.message });
});

// Типы для результатов запросов
type WhereClause = Record<string, any>;
type SelectFields = string[] | Record<string, any> | undefined;
type IncludeClause = Record<string, boolean | { include?: IncludeClause; select?: SelectFields; where?: WhereClause }>;

// Вспомогательная функция для преобразования select в массив полей
function getSelectFields(select?: SelectFields): string[] | null {
  if (!select) return null;
  if (Array.isArray(select)) return select;
  if (typeof select === 'object') {
    const fields: string[] = [];
    function collectFields(obj: any, prefix = '') {
      for (const key of Object.keys(obj)) {
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          collectFields(obj[key], prefix + key + '.');
        } else if (obj[key] === true) {
          fields.push(prefix + key);
        }
      }
    }
    collectFields(select);
    return fields.length > 0 ? fields : null;
  }
  return null;
}

// Вспомогательная функция для построения WHERE условий с PostgreSQL placeholders
function buildWhereClause(where: WhereClause, startIndex: number = 1): { sql: string; params: any[]; nextIndex: number } {
  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = startIndex;

  // Обработка OR условий
  if (where.OR && Array.isArray(where.OR)) {
    const orConditions: string[] = [];
    for (const orClause of where.OR) {
      const { sql: orSql, params: orParams, nextIndex } = buildWhereClause(orClause, paramIndex);
      if (orSql) {
        orConditions.push(orSql.replace('WHERE ', ''));
        params.push(...orParams);
        paramIndex = nextIndex;
      }
    }
    if (orConditions.length > 0) {
      conditions.push(`(${orConditions.join(' OR ')})`);
    }
  }

  for (const [key, value] of Object.entries(where)) {
    if (key === 'OR') continue;
    
    if (value === null) {
      conditions.push(`"${key}" IS NULL`);
    } else if (value === undefined) {
      continue;
    } else if (typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      for (const [op, opValue] of Object.entries(value)) {
        if (op === 'contains' || op === 'startsWith' || op === 'endsWith') {
          const pattern = op === 'contains' ? `%${opValue}%` : op === 'startsWith' ? `${opValue}%` : `%${opValue}`;
          conditions.push(`"${key}" ILIKE $${paramIndex}`);
          params.push(pattern);
          paramIndex++;
        } else if (op === 'in') {
          if (Array.isArray(opValue) && opValue.length === 0) {
            conditions.push('FALSE');
          } else if (Array.isArray(opValue)) {
            const placeholders = opValue.map((_, i) => `$${paramIndex + i}`).join(', ');
            conditions.push(`"${key}" IN (${placeholders})`);
            params.push(...opValue);
            paramIndex += opValue.length;
          }
        } else if (op === 'gte' || op === 'lte' || op === 'gt' || op === 'lt') {
          const operator = op === 'gte' ? '>=' : op === 'lte' ? '<=' : op === 'gt' ? '>' : '<';
          conditions.push(`"${key}" ${operator} $${paramIndex}`);
          let paramValue = opValue;
          if (opValue instanceof Date) {
            paramValue = opValue.toISOString();
          }
          params.push(paramValue);
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


// Универсальная функция для создания методов модели
function createModelMethods(tableName: string) {
  return {
    findUnique: async (args: { where: WhereClause; select?: SelectFields; include?: IncludeClause }) => {
      const { where, select, include } = args;
      const { sql: whereSql, params } = buildWhereClause(where);
      const finalSql = `SELECT * FROM "${tableName}" ${whereSql} LIMIT 1`;
      
      const result = await pool.query(finalSql, params);
      if (result.rows.length === 0) return null;
      
      const row = result.rows[0];

      // Обработка include для разных таблиц
      if (include) {
        await processIncludes(tableName, row, include);
      }

      const selectFields = getSelectFields(select);
      if (selectFields) {
        const filtered: any = {};
        for (const field of selectFields) {
          if (row[field] !== undefined) {
            filtered[field] = row[field];
          }
        }
        return filtered;
      }
      return row;
    },

    findFirst: async (args: { where?: WhereClause; select?: SelectFields; include?: IncludeClause; orderBy?: any }) => {
      const { where = {}, select, include, orderBy } = args;
      const { sql: whereSql, params } = buildWhereClause(where);
      let sql = `SELECT * FROM "${tableName}" ${whereSql}`;

      if (orderBy) {
        const orderByObj = Array.isArray(orderBy) ? orderBy[0] : orderBy;
        const orderByKey = Object.keys(orderByObj)[0];
        const orderByValue = orderByObj[orderByKey];
        sql += ` ORDER BY "${orderByKey}" ${orderByValue === 'desc' ? 'DESC' : 'ASC'}`;
      }

      sql += ' LIMIT 1';
      const result = await pool.query(sql, params);
      
      if (result.rows.length === 0) return null;
      const row = result.rows[0];

      if (include) {
        await processIncludes(tableName, row, include);
      }

      const selectFields = getSelectFields(select);
      if (selectFields) {
        const filtered: any = {};
        for (const field of selectFields) {
          if (row[field] !== undefined) {
            filtered[field] = row[field];
          }
        }
        return filtered;
      }
      return row;
    },

    findMany: async (args: { where?: WhereClause; select?: SelectFields; include?: IncludeClause; orderBy?: any; take?: number; skip?: number } = {}) => {
      const { where = {}, select, include, orderBy, take, skip } = args;
      const { sql: whereSql, params, nextIndex } = buildWhereClause(where);
      let sql = `SELECT * FROM "${tableName}" ${whereSql}`;
      let paramIndex = nextIndex;

      if (orderBy) {
        const orderByObj = Array.isArray(orderBy) ? orderBy[0] : orderBy;
        const orderByKey = Object.keys(orderByObj)[0];
        const orderByValue = orderByObj[orderByKey];
        sql += ` ORDER BY "${orderByKey}" ${orderByValue === 'desc' ? 'DESC' : 'ASC'}`;
      }
      
      if (take) {
        sql += ` LIMIT $${paramIndex}`;
        params.push(take);
        paramIndex++;
      }
      if (skip) {
        sql += ` OFFSET $${paramIndex}`;
        params.push(skip);
      }

      const result = await pool.query(sql, params);
      const rows = result.rows;

      if (include) {
        for (const row of rows) {
          await processIncludes(tableName, row, include);
        }
      }

      const selectFields = getSelectFields(select);
      if (selectFields) {
        return rows.map(row => {
          const filtered: any = {};
          for (const field of selectFields) {
            if (row[field] !== undefined) {
              filtered[field] = row[field];
            }
          }
          return filtered;
        });
      }
      return rows;
    },

    create: async (args: { data: Record<string, any>; select?: SelectFields; include?: IncludeClause }) => {
      const { data, select, include } = args;
      const id = data.id || generateId();
      const now = new Date().toISOString();

      const fields = ['id', ...Object.keys(data).filter(k => k !== 'id')];
      const values = [id, ...Object.keys(data).filter(k => k !== 'id').map(f => {
        if (data[f] instanceof Date) return data[f].toISOString();
        return data[f];
      })];

      const tablesWithoutTimestamps = ['ActionLog', 'ShiftSwapHistory'];
      
      if (!data.createdAt && !tablesWithoutTimestamps.includes(tableName)) {
        fields.push('createdAt');
        values.push(now);
      }
      if (!data.updatedAt && !tablesWithoutTimestamps.includes(tableName)) {
        fields.push('updatedAt');
        values.push(now);
      }

      const placeholders = fields.map((_, i) => `$${i + 1}`).join(', ');
      const fieldNames = fields.map(f => `"${f}"`).join(', ');
      const sql = `INSERT INTO "${tableName}" (${fieldNames}) VALUES (${placeholders}) RETURNING *`;
      
      const result = await pool.query(sql, values);
      const row = result.rows[0];

      if (include) {
        await processIncludes(tableName, row, include);
      }

      const selectFields = getSelectFields(select);
      if (selectFields) {
        const filtered: any = {};
        for (const field of selectFields) {
          if (row[field] !== undefined) {
            filtered[field] = row[field];
          }
        }
        return filtered;
      }
      return row;
    },

    update: async (args: { where: WhereClause; data: Record<string, any>; select?: SelectFields; include?: IncludeClause }) => {
      const { where, data, select, include } = args;

      const updateFields = Object.keys(data).filter(k => k !== 'id' && data[k] !== undefined);
      
      if (updateFields.length === 0) {
        return createModelMethods(tableName).findUnique({ where, select, include });
      }

      const setClauses: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      for (const f of updateFields) {
        if (data[f] === null) {
          setClauses.push(`"${f}" = NULL`);
        } else if (data[f] && typeof data[f] === 'object' && data[f].increment !== undefined) {
          setClauses.push(`"${f}" = "${f}" + $${paramIndex}`);
          params.push(data[f].increment);
          paramIndex++;
        } else {
          setClauses.push(`"${f}" = $${paramIndex}`);
          const value = data[f] instanceof Date ? data[f].toISOString() : data[f];
          params.push(value);
          paramIndex++;
        }
      }

      const now = new Date().toISOString();
      if (!updateFields.includes('updatedAt') && tableName !== 'ActionLog') {
        setClauses.push(`"updatedAt" = $${paramIndex}`);
        params.push(now);
        paramIndex++;
      }

      const { sql: whereSql, params: whereParams } = buildWhereClause(where, paramIndex);
      params.push(...whereParams);

      const sql = `UPDATE "${tableName}" SET ${setClauses.join(', ')} ${whereSql} RETURNING *`;
      
      try {
        const result = await pool.query(sql, params);
        if (result.rows.length === 0) return null;
        
        const row = result.rows[0];
        if (include) {
          await processIncludes(tableName, row, include);
        }

        const selectFields = getSelectFields(select);
        if (selectFields) {
          const filtered: any = {};
          for (const field of selectFields) {
            if (row[field] !== undefined) {
              filtered[field] = row[field];
            }
          }
          return filtered;
        }
        return row;
      } catch (error: any) {
        logger.error(`Error updating ${tableName}`, { error: error?.message, sql, params });
        throw error;
      }
    },

    delete: async (args: { where: WhereClause }) => {
      const { where } = args;
      const { sql: whereSql, params } = buildWhereClause(where);
      await pool.query(`DELETE FROM "${tableName}" ${whereSql}`, params);
    },

    count: async (args: { where?: WhereClause } = {}) => {
      const { where = {} } = args;
      const { sql: whereSql, params } = buildWhereClause(where);
      const result = await pool.query(`SELECT COUNT(*) as count FROM "${tableName}" ${whereSql}`, params);
      return parseInt(result.rows[0].count, 10);
    },

    deleteMany: async (args: { where: WhereClause }) => {
      const { where } = args;
      const { sql: whereSql, params } = buildWhereClause(where);
      const result = await pool.query(`DELETE FROM "${tableName}" ${whereSql}`, params);
      return { count: result.rowCount || 0 };
    },

    createMany: async (args: { data: Record<string, any>[] }) => {
      const { data } = args;
      if (data.length === 0) return { count: 0 };
      
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        const now = new Date().toISOString();
        let count = 0;
        
        for (const item of data) {
          const id = item.id || generateId();
          const fields = ['id', ...Object.keys(item).filter(k => k !== 'id')];
          const values = [id, ...Object.keys(item).filter(k => k !== 'id').map(f => {
            if (item[f] instanceof Date) return item[f].toISOString();
            return item[f];
          })];

          if (!item.createdAt) {
            fields.push('createdAt');
            values.push(now);
          }
          if (!item.updatedAt && tableName !== 'ActionLog') {
            fields.push('updatedAt');
            values.push(now);
          }

          const placeholders = fields.map((_, i) => `$${i + 1}`).join(', ');
          const fieldNames = fields.map(f => `"${f}"`).join(', ');
          const sql = `INSERT INTO "${tableName}" (${fieldNames}) VALUES (${placeholders})`;
          
          await client.query(sql, values);
          count++;
        }
        
        await client.query('COMMIT');
        return { count };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  };
}


// Вспомогательная функция для обработки include
async function processIncludes(tableName: string, row: any, include: IncludeClause) {
  if (include.user && (tableName === 'Shift' || tableName === 'Task' || tableName === 'Timesheet' || tableName === 'Feedback')) {
    if (row.userId) {
      const userResult = await pool.query('SELECT * FROM "User" WHERE "id" = $1', [row.userId]);
      row.user = userResult.rows[0] || null;
    } else {
      row.user = null;
    }
  }
  
  if (include.restaurant && (tableName === 'Shift' || tableName === 'Task' || tableName === 'Timesheet' || tableName === 'InviteLink' || tableName === 'Feedback')) {
    if (row.restaurantId) {
      const restaurantResult = await pool.query('SELECT * FROM "Restaurant" WHERE "id" = $1', [row.restaurantId]);
      row.restaurant = restaurantResult.rows[0] || null;
    } else {
      row.restaurant = null;
    }
  }

  if (tableName === 'Task') {
    if (include.createdBy && row.createdById) {
      const createdByResult = await pool.query('SELECT * FROM "User" WHERE "id" = $1', [row.createdById]);
      row.createdBy = createdByResult.rows[0] || null;
    }
    if (include.assignedTo && row.assignedToId) {
      const assignedToResult = await pool.query('SELECT * FROM "User" WHERE "id" = $1', [row.assignedToId]);
      row.assignedTo = assignedToResult.rows[0] || null;
    }
  }

  if (tableName === 'Feedback' && include.attachments) {
    const attachmentsResult = await pool.query('SELECT * FROM "FeedbackAttachment" WHERE "feedbackId" = $1', [row.id]);
    row.attachments = attachmentsResult.rows;
  }

  if (tableName === 'InviteLink') {
    if (include.position && row.positionId) {
      const positionResult = await pool.query('SELECT * FROM "Position" WHERE "id" = $1', [row.positionId]);
      row.position = positionResult.rows[0] || null;
    }
    if (include.department && row.departmentId) {
      const departmentResult = await pool.query('SELECT * FROM "Department" WHERE "id" = $1', [row.departmentId]);
      row.department = departmentResult.rows[0] || null;
    }
    if (include.createdBy && row.createdById) {
      const createdByResult = await pool.query('SELECT * FROM "User" WHERE "id" = $1', [row.createdById]);
      row.createdBy = createdByResult.rows[0] || null;
    }
  }

  if (tableName === 'User') {
    if (include.actionLogs) {
      const actionLogsResult = await pool.query('SELECT * FROM "ActionLog" WHERE "userId" = $1', [row.id]);
      row.actionLogs = actionLogsResult.rows;
    }
    if (include.restaurants) {
      const restaurantsResult = await pool.query('SELECT * FROM "RestaurantUser" WHERE "userId" = $1', [row.id]);
      row.restaurants = restaurantsResult.rows;
      
      // Handle nested includes
      const restaurantsInclude = include.restaurants;
      if (typeof restaurantsInclude === 'object' && restaurantsInclude !== null) {
        const includeObj = restaurantsInclude as any;
        if (includeObj.include?.restaurant) {
          for (const ru of row.restaurants) {
            const restResult = await pool.query('SELECT * FROM "Restaurant" WHERE "id" = $1', [ru.restaurantId]);
            ru.restaurant = restResult.rows[0] || null;
          }
        }
        if (includeObj.where) {
          row.restaurants = row.restaurants.filter((ru: any) => {
            for (const [key, value] of Object.entries(includeObj.where)) {
              if (ru[key] !== value) return false;
            }
            return true;
          });
        }
      }
    }
    if (include.managedRestaurants) {
      const managedResult = await pool.query('SELECT * FROM "Restaurant" WHERE "managerId" = $1', [row.id]);
      row.managedRestaurants = managedResult.rows;
    }
    if (include.pushSubscriptions) {
      const pushResult = await pool.query('SELECT * FROM "PushSubscription" WHERE "userId" = $1 AND "isActive" = true', [row.id]);
      row.pushSubscriptions = pushResult.rows;
    }
    if (include.NotificationSettings) {
      const settingsResult = await pool.query('SELECT * FROM "NotificationSettings" WHERE "userId" = $1', [row.id]);
      row.NotificationSettings = settingsResult.rows[0] || null;
    }
  }

  if (tableName === 'Restaurant') {
    if (include.manager && row.managerId) {
      const managerResult = await pool.query('SELECT * FROM "User" WHERE "id" = $1', [row.managerId]);
      row.manager = managerResult.rows[0] || null;
    }
    if (include.departments) {
      const deptResult = await pool.query('SELECT * FROM "Department" WHERE "restaurantId" = $1', [row.id]);
      row.departments = deptResult.rows;
    }
    if (include.positions) {
      const posResult = await pool.query('SELECT * FROM "Position" WHERE "restaurantId" = $1', [row.id]);
      row.positions = posResult.rows;
    }
    if (include.employees) {
      const empResult = await pool.query('SELECT * FROM "RestaurantUser" WHERE "restaurantId" = $1', [row.id]);
      row.employees = empResult.rows;
    }
  }

  if (tableName === 'SwapRequest') {
    if (include.shift && row.shiftId) {
      const shiftResult = await pool.query('SELECT * FROM "Shift" WHERE "id" = $1', [row.shiftId]);
      row.shift = shiftResult.rows[0] || null;
    }
    if (include.fromUser && row.fromUserId) {
      const fromUserResult = await pool.query('SELECT * FROM "User" WHERE "id" = $1', [row.fromUserId]);
      row.fromUser = fromUserResult.rows[0] || null;
    }
    if (include.toUser && row.toUserId) {
      const toUserResult = await pool.query('SELECT * FROM "User" WHERE "id" = $1', [row.toUserId]);
      row.toUser = toUserResult.rows[0] || null;
    }
    if (include.approvedBy && row.approvedById) {
      const approvedByResult = await pool.query('SELECT * FROM "User" WHERE "id" = $1', [row.approvedById]);
      row.approvedBy = approvedByResult.rows[0] || null;
    }
  }
}

// API для работы с моделями
export const dbClient = {
  user: createModelMethods('User'),
  restaurant: createModelMethods('Restaurant'),
  department: createModelMethods('Department'),
  position: createModelMethods('Position'),
  permission: createModelMethods('Permission'),
  positionPermission: createModelMethods('PositionPermission'),
  restaurantUser: createModelMethods('RestaurantUser'),
  shiftTemplate: createModelMethods('ShiftTemplate'),
  scheduleTemplate: createModelMethods('ScheduleTemplate'),
  shift: createModelMethods('Shift'),
  task: createModelMethods('Task'),
  taskAttachment: createModelMethods('TaskAttachment'),
  timesheet: createModelMethods('Timesheet'),
  feedback: createModelMethods('Feedback'),
  feedbackAttachment: createModelMethods('FeedbackAttachment'),
  actionLog: createModelMethods('ActionLog'),
  inviteLink: createModelMethods('InviteLink'),
  shiftSwapHistory: createModelMethods('ShiftSwapHistory'),
  holiday: createModelMethods('Holiday'),
  bonus: createModelMethods('Bonus'),
  penalty: createModelMethods('Penalty'),
  notification: createModelMethods('Notification'),
  pushSubscription: createModelMethods('PushSubscription'),
  notificationSettings: createModelMethods('NotificationSettings'),
  telegramSession: createModelMethods('TelegramSession'),
  swapRequest: createModelMethods('SwapRequest'),
  
  // Transaction support
  $transaction: async <T>(callback: (client: PoolClient) => Promise<T>): Promise<T> => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  // Raw query support
  $queryRaw: async <T = any>(sql: string, params: any[] = []): Promise<T[]> => {
    const result = await pool.query(sql, params);
    return result.rows;
  },

  // Execute raw SQL
  $executeRaw: async (sql: string, params: any[] = []): Promise<number> => {
    const result = await pool.query(sql, params);
    return result.rowCount || 0;
  },

  // Close connection pool
  $disconnect: async () => {
    await pool.end();
  },
};

// Export pool for direct access if needed
export { pool as pgPool };

// Export generateId for use in other modules
export { generateId };

// Default export for backward compatibility
export default dbClient;
