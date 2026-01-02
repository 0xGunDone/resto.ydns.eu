// @ts-ignore - Ignoring TypeScript errors for dbClient compatibility
import Database from 'better-sqlite3';
import path from 'path';
import { randomBytes } from 'crypto';

// Генерация CUID-подобного ID
function generateId(): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(6).toString('hex');
  return `${timestamp}-${random}`;
}

// Инициализация БД
const dbPath = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace(/^file:/, '')
  : path.join(__dirname, '../../dev.db');

const sqliteConnection: Database.Database = new Database(dbPath);

// Включаем foreign keys
sqliteConnection.pragma('foreign_keys = ON');

// Типы для результатов запросов
type WhereClause = Record<string, any>;
type SelectFields = string[] | Record<string, any> | undefined;
type IncludeClause = Record<string, boolean | { include?: IncludeClause; select?: SelectFields }>;

// Вспомогательная функция для преобразования select в массив полей
function getSelectFields(select?: SelectFields): string[] | null {
  if (!select) return null;
  if (Array.isArray(select)) return select;
  if (typeof select === 'object') {
    // Рекурсивно собираем все поля из вложенных объектов
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

// Вспомогательная функция для конвертации boolean полей из 0/1 в true/false
function convertBooleanFields(row: any): any {
  if (!row || typeof row !== 'object') return row;
  const converted = { ...row };
  for (const key of Object.keys(converted)) {
    // Конвертируем поля, которые выглядят как boolean (начинаются с "is" или "has")
    if ((key.startsWith('is') || key.startsWith('has')) && (converted[key] === 0 || converted[key] === 1)) {
      converted[key] = converted[key] === 1;
    }
  }
  return converted;
}

// Вспомогательная функция для построения WHERE условий
function buildWhereClause(where: WhereClause): { sql: string; params: any[] } {
  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  // Обработка OR условий
  if (where.OR && Array.isArray(where.OR)) {
    const orConditions: string[] = [];
    for (const orClause of where.OR) {
      const { sql: orSql, params: orParams } = buildWhereClause(orClause);
      if (orSql) {
        orConditions.push(orSql.replace('WHERE ', ''));
        params.push(...orParams);
        paramIndex += orParams.length; // Обновляем индекс параметров
      }
    }
    if (orConditions.length > 0) {
      conditions.push(`(${orConditions.join(' OR ')})`);
    }
  }

  for (const [key, value] of Object.entries(where)) {
    // Пропускаем OR, так как он уже обработан
    if (key === 'OR') continue;
    if (value === null) {
      conditions.push(`${key} IS NULL`);
    } else if (value === undefined) {
      continue;
    } else if (typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      // Обработка вложенных условий (например, { email: { contains: 'test' } })
      for (const [op, opValue] of Object.entries(value)) {
        if (op === 'contains' || op === 'startsWith' || op === 'endsWith') {
          const pattern = op === 'contains' ? `%${opValue}%` : op === 'startsWith' ? `${opValue}%` : `%${opValue}`;
          conditions.push(`${key} LIKE ?`);
          params.push(pattern);
          paramIndex++;
        } else if (op === 'in') {
          if (Array.isArray(opValue) && opValue.length === 0) {
            // Пустой массив - возвращаем условие, которое никогда не выполнится
            conditions.push('1 = 0');
          } else {
          const placeholders = Array.isArray(opValue) ? opValue.map(() => '?').join(', ') : '?';
          conditions.push(`${key} IN (${placeholders})`);
          if (Array.isArray(opValue)) {
            params.push(...opValue);
          } else {
            params.push(opValue);
          }
        }
        } else if (op === 'gte' || op === 'lte' || op === 'gt' || op === 'lt') {
          const operator = op === 'gte' ? '>=' : op === 'lte' ? '<=' : op === 'gt' ? '>' : '<';
          conditions.push(`${key} ${operator} ?`);
          // Конвертируем Date в ISO строку для SQLite
          let paramValue = opValue;
          if (opValue instanceof Date) {
            paramValue = opValue.toISOString();
          } else if (typeof opValue === 'string' && opValue.match(/^\d{4}-\d{2}-\d{2}T/)) {
            // Уже ISO строка, оставляем как есть
            paramValue = opValue;
          }
          params.push(paramValue);
          paramIndex++;
        }
      }
    } else {
      conditions.push(`${key} = ?`);
      // Конвертируем boolean в число для SQLite
      const paramValue = typeof value === 'boolean' ? (value ? 1 : 0) : value;
      params.push(paramValue);
      paramIndex++;
    }
  }

  const result = {
    sql: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
  
  return result;
}

// Вспомогательная функция для преобразования параметров в именованные
function replaceParams(sql: string, params: any[]): { sql: string; params: any[] } {
  const newParams: any[] = [];
  const newSql = sql.replace(/\$\d+/g, (match) => {
    const index = parseInt(match.substring(1)) - 1; // Получаем индекс из $1, $2 и т.д.
    if (index >= 0 && index < params.length) {
      newParams.push(params[index]);
      return `?`;
    }
    return `?`;
  });
  return { sql: newSql, params: newParams };
}

// Универсальная функция для создания методов модели
function createModelMethods(tableName: string) {
  return {
    findUnique: async (args: { where: WhereClause; select?: SelectFields; include?: IncludeClause }) => {
      const { where, select, include } = args;
      const { sql: whereSql, params } = buildWhereClause(where);
      const finalSql = `SELECT * FROM ${tableName} ${whereSql} LIMIT 1`;
      
      const row = sqliteConnection.prepare(finalSql).get(...params) as any;
      if (!row) return null;
      
      // Конвертируем boolean поля
      const convertedRow = convertBooleanFields(row);

      // Обработка include для разных таблиц
      if (include) {
        if (include.user && (tableName === 'Shift' || tableName === 'Task' || tableName === 'Timesheet')) {
          const userRow = convertedRow.userId ? sqliteConnection.prepare('SELECT * FROM User WHERE id = ?').get(convertedRow.userId) : null;
          convertedRow.user = userRow ? convertBooleanFields(userRow) : null;
        }
        if (include.restaurant && (tableName === 'Shift' || tableName === 'Task' || tableName === 'Timesheet' || tableName === 'InviteLink' || tableName === 'Feedback')) {
          const restaurantRow = convertedRow.restaurantId ? sqliteConnection.prepare('SELECT * FROM Restaurant WHERE id = ?').get(convertedRow.restaurantId) : null;
          convertedRow.restaurant = restaurantRow ? convertBooleanFields(restaurantRow) : null;
        }
        if (tableName === 'Feedback') {
          if (include.user) {
            const userRow = convertedRow.userId ? sqliteConnection.prepare('SELECT * FROM User WHERE id = ?').get(convertedRow.userId) : null;
            convertedRow.user = userRow ? convertBooleanFields(userRow) : null;
          }
          if (include.attachments) {
            const attachmentsRows = sqliteConnection.prepare('SELECT * FROM FeedbackAttachment WHERE feedbackId = ?').all(convertedRow.id);
            convertedRow.attachments = attachmentsRows.map(att => convertBooleanFields(att));
          }
        }
        if (tableName === 'Task') {
          if (include.createdBy) {
            const createdByRow = convertedRow.createdById ? sqliteConnection.prepare('SELECT * FROM User WHERE id = ?').get(convertedRow.createdById) : null;
            convertedRow.createdBy = createdByRow ? convertBooleanFields(createdByRow) : null;
          }
          if (include.assignedTo) {
            const assignedToRow = convertedRow.assignedToId ? sqliteConnection.prepare('SELECT * FROM User WHERE id = ?').get(convertedRow.assignedToId) : null;
            convertedRow.assignedTo = assignedToRow ? convertBooleanFields(assignedToRow) : null;
          }
        }
        if (tableName === 'InviteLink') {
          if (include.position) {
            const positionRow = convertedRow.positionId ? sqliteConnection.prepare('SELECT * FROM Position WHERE id = ?').get(convertedRow.positionId) : null;
            convertedRow.position = positionRow ? convertBooleanFields(positionRow) : null;
          }
          if (include.department) {
            const departmentRow = convertedRow.departmentId ? sqliteConnection.prepare('SELECT * FROM Department WHERE id = ?').get(convertedRow.departmentId) : null;
            convertedRow.department = departmentRow ? convertBooleanFields(departmentRow) : null;
          }
          if (include.createdBy) {
            const createdByRow = convertedRow.createdById ? sqliteConnection.prepare('SELECT * FROM User WHERE id = ?').get(convertedRow.createdById) : null;
            convertedRow.createdBy = createdByRow ? convertBooleanFields(createdByRow) : null;
          }
        }
      }

      const selectFields = getSelectFields(select);
      if (selectFields) {
        const filtered: any = {};
        for (const field of selectFields) {
          if (convertedRow[field] !== undefined) {
            filtered[field] = convertedRow[field];
          }
        }
        return filtered;
      }
      return convertedRow;
    },

    findFirst: async (args: { where?: WhereClause; select?: SelectFields; include?: IncludeClause; orderBy?: any }) => {
      const { where = {}, select, include, orderBy } = args;
      const { sql: whereSql, params } = buildWhereClause(where);
      let sql = `SELECT * FROM ${tableName} ${whereSql}`;

      if (orderBy) {
        // Обработка массива orderBy (берем первый элемент)
        const orderByObj = Array.isArray(orderBy) ? orderBy[0] : orderBy;
        const orderByKey = Object.keys(orderByObj)[0];
        const orderByValue = orderByObj[orderByKey];
        sql += ` ORDER BY ${orderByKey} ${orderByValue === 'desc' ? 'DESC' : 'ASC'}`;
      }

      sql += ' LIMIT 1';
      const rows = sqliteConnection.prepare(sql).all(...params) as any[];
      
      if (!rows.length) return null;

      // Обработка include для разных таблиц
      if (include) {
        if (include.user && (tableName === 'Shift' || tableName === 'Task' || tableName === 'Timesheet')) {
          const userRow = rows[0].userId ? sqliteConnection.prepare('SELECT * FROM User WHERE id = ?').get(rows[0].userId) : null;
          rows[0].user = userRow ? convertBooleanFields(userRow) : null;
        }
        if (include.restaurant && (tableName === 'Shift' || tableName === 'Task' || tableName === 'Timesheet' || tableName === 'InviteLink' || tableName === 'Feedback')) {
          const restaurantRow = rows[0].restaurantId ? sqliteConnection.prepare('SELECT * FROM Restaurant WHERE id = ?').get(rows[0].restaurantId) : null;
          rows[0].restaurant = restaurantRow ? convertBooleanFields(restaurantRow) : null;
        }
        if (tableName === 'Feedback') {
          if (include.user) {
            rows[0].user = rows[0].userId ? sqliteConnection.prepare('SELECT * FROM User WHERE id = ?').get(rows[0].userId) : null;
          }
          if (include.attachments) {
            rows[0].attachments = sqliteConnection.prepare('SELECT * FROM FeedbackAttachment WHERE feedbackId = ?').all(rows[0].id);
          }
        }
        if (tableName === 'Task') {
          if (include.createdBy) {
            rows[0].createdBy = rows[0].createdById ? sqliteConnection.prepare('SELECT * FROM User WHERE id = ?').get(rows[0].createdById) : null;
          }
          if (include.assignedTo) {
            rows[0].assignedTo = rows[0].assignedToId ? sqliteConnection.prepare('SELECT * FROM User WHERE id = ?').get(rows[0].assignedToId) : null;
          }
        }
        if (tableName === 'InviteLink') {
          if (include.position) {
            rows[0].position = rows[0].positionId ? sqliteConnection.prepare('SELECT * FROM Position WHERE id = ?').get(rows[0].positionId) : null;
          }
          if (include.department) {
            rows[0].department = rows[0].departmentId ? sqliteConnection.prepare('SELECT * FROM Department WHERE id = ?').get(rows[0].departmentId) : null;
          }
          if (include.createdBy) {
            rows[0].createdBy = rows[0].createdById ? sqliteConnection.prepare('SELECT * FROM User WHERE id = ?').get(rows[0].createdById) : null;
          }
        }
      }

      const selectFields = getSelectFields(select);
      if (selectFields) {
        const filtered: any = {};
        for (const field of selectFields) {
          if (rows[0][field] !== undefined) {
            filtered[field] = rows[0][field];
          }
        }
        return filtered;
      }
      return rows[0];
    },

    findMany: async (args: { where?: WhereClause; select?: SelectFields; include?: IncludeClause; orderBy?: any; take?: number; skip?: number } = {}) => {
      const { where = {}, select, include, orderBy, take, skip } = args;
      const { sql: whereSql, params } = buildWhereClause(where);
      let sql = `SELECT * FROM ${tableName} ${whereSql}`;

      if (orderBy) {
        // Обработка массива orderBy (берем первый элемент)
        const orderByObj = Array.isArray(orderBy) ? orderBy[0] : orderBy;
        const orderByKey = Object.keys(orderByObj)[0];
        const orderByValue = orderByObj[orderByKey];
        sql += ` ORDER BY ${orderByKey} ${orderByValue === 'desc' ? 'DESC' : 'ASC'}`;
      }
      
      if (take) sql += ` LIMIT ${take}`;
      if (skip) sql += ` OFFSET ${skip}`;

      const rows = sqliteConnection.prepare(sql).all(...params) as any[];

      // Конвертируем boolean поля для всех строк
      const convertedRows = rows.map(row => convertBooleanFields(row));

      // Обработка include для разных таблиц
      if (include) {
        for (const row of convertedRows) {
          if (include.user && (tableName === 'Shift' || tableName === 'Task' || tableName === 'Timesheet')) {
            const userRow = row.userId ? sqliteConnection.prepare('SELECT * FROM User WHERE id = ?').get(row.userId) : null;
            row.user = userRow ? convertBooleanFields(userRow) : null;
          }
          if (include.restaurant && (tableName === 'Shift' || tableName === 'Task' || tableName === 'Timesheet' || tableName === 'InviteLink' || tableName === 'Feedback')) {
            const restaurantRow = row.restaurantId ? sqliteConnection.prepare('SELECT * FROM Restaurant WHERE id = ?').get(row.restaurantId) : null;
            row.restaurant = restaurantRow ? convertBooleanFields(restaurantRow) : null;
          }
          if (tableName === 'Task') {
            if (include.createdBy) {
              const createdByRow = row.createdById ? sqliteConnection.prepare('SELECT * FROM User WHERE id = ?').get(row.createdById) : null;
              row.createdBy = createdByRow ? convertBooleanFields(createdByRow) : null;
            }
            if (include.assignedTo) {
              const assignedToRow = row.assignedToId ? sqliteConnection.prepare('SELECT * FROM User WHERE id = ?').get(row.assignedToId) : null;
              row.assignedTo = assignedToRow ? convertBooleanFields(assignedToRow) : null;
            }
          }
          if (tableName === 'Feedback') {
            if (include.user) {
              const userRow = row.userId ? sqliteConnection.prepare('SELECT * FROM User WHERE id = ?').get(row.userId) : null;
              row.user = userRow ? convertBooleanFields(userRow) : null;
            }
            if (include.attachments) {
              const attachmentsRows = sqliteConnection.prepare('SELECT * FROM FeedbackAttachment WHERE feedbackId = ?').all(row.id);
              row.attachments = attachmentsRows.map(att => convertBooleanFields(att));
            }
          }
          if (tableName === 'InviteLink') {
            if (include.position) {
              const positionRow = row.positionId ? sqliteConnection.prepare('SELECT * FROM Position WHERE id = ?').get(row.positionId) : null;
              row.position = positionRow ? convertBooleanFields(positionRow) : null;
            }
            if (include.department) {
              const departmentRow = row.departmentId ? sqliteConnection.prepare('SELECT * FROM Department WHERE id = ?').get(row.departmentId) : null;
              row.department = departmentRow ? convertBooleanFields(departmentRow) : null;
            }
            if (include.createdBy) {
              const createdByRow = row.createdById ? sqliteConnection.prepare('SELECT * FROM User WHERE id = ?').get(row.createdById) : null;
              row.createdBy = createdByRow ? convertBooleanFields(createdByRow) : null;
            }
          }
        }
      }

      const selectFields = getSelectFields(select);
      if (selectFields) {
        return convertedRows.map(row => {
          const filtered: any = {};
          for (const field of selectFields) {
            if (row[field] !== undefined) {
              filtered[field] = row[field];
            }
          }
          return filtered;
        });
      }
      return convertedRows;
    },

    create: async (args: { data: Record<string, any>; select?: SelectFields; include?: IncludeClause }) => {
      const { data, select, include } = args;
      const id = data.id || generateId();
      const now = new Date().toISOString();

      const fields = Object.keys(data).filter(k => k !== 'id');
      const values = fields.map(() => '?');
      const params = [id, ...fields.map(f => {
        if (data[f] instanceof Date) return data[f].toISOString();
        // Конвертируем boolean в число для SQLite
        if (typeof data[f] === 'boolean') return data[f] ? 1 : 0;
        return data[f];
      })];

      // Некоторые таблицы не имеют createdAt/updatedAt
      const tablesWithoutTimestamps = ['ActionLog', 'ShiftSwapHistory'];
      
      if (!data.createdAt && !tablesWithoutTimestamps.includes(tableName)) {
        fields.push('createdAt');
        values.push('?');
        params.push(now);
      }
      if (!data.updatedAt && !tablesWithoutTimestamps.includes(tableName)) {
        fields.push('updatedAt');
        values.push('?');
        params.push(now);
      }

      const sql = `INSERT INTO ${tableName} (id, ${fields.join(', ')}) VALUES (?, ${values.join(', ')})`;
      sqliteConnection.prepare(sql).run(...params);

      return createModelMethods(tableName).findUnique({ where: { id }, select, include });
    },

    update: async (args: { where: WhereClause; data: Record<string, any>; select?: SelectFields; include?: IncludeClause }) => {
      const { where, data, select, include } = args;
      const { sql: whereSql, params: whereParams } = buildWhereClause(where);

      // Фильтруем поля, исключая id и undefined значения (но включаем null)
      const updateFields = Object.keys(data).filter(k => k !== 'id' && data[k] !== undefined);
      
      // Если нет полей для обновления, возвращаем текущую запись
      if (updateFields.length === 0) {
        return createModelMethods(tableName).findUnique({ where, select, include });
      }
      
      // Разделяем поля на те, что требуют параметров, и те, что нет (null)
      const fieldsWithParams: string[] = [];
      const nullFields: string[] = [];
      
      for (const f of updateFields) {
        if (data[f] === null) {
          nullFields.push(f);
        } else {
          fieldsWithParams.push(f);
        }
      }
      
      const setClauseParts: string[] = [];
      
      // Добавляем поля с параметрами
      for (const f of fieldsWithParams) {
        if (data[f] && typeof data[f] === 'object' && data[f].increment !== undefined) {
          setClauseParts.push(`${f} = ${f} + ?`);
        } else {
          setClauseParts.push(`${f} = ?`);
        }
      }
      
      // Добавляем поля с null
      for (const f of nullFields) {
        setClauseParts.push(`${f} = NULL`);
      }
      
      const setClause = setClauseParts.join(', ');

      const updateParams = fieldsWithParams.map(f => {
        if (data[f] && typeof data[f] === 'object' && data[f].increment !== undefined) {
          return data[f].increment;
        }
        if (data[f] instanceof Date) return data[f].toISOString();
        // Конвертируем boolean в число для SQLite
        if (typeof data[f] === 'boolean') return data[f] ? 1 : 0;
        return data[f];
      });

      const now = new Date().toISOString();
      // Добавляем updatedAt только если его нет в полях для обновления
      const needsUpdatedAt = !updateFields.includes('updatedAt') && tableName !== 'ActionLog';
      const finalSetClause = needsUpdatedAt ? `${setClause}, updatedAt = ?` : setClause;
      const finalUpdateParams = needsUpdatedAt ? [...updateParams, now] : updateParams;

      // В update смешивались placeholders '?' (SET) и '$1' (WHERE), что приводило к неверному числу параметров.
      // Здесь конвертируем WHERE placeholders в '?' вручную и объединяем параметры.
      const whereSqlWithQuestion = whereSql.replace(/\$\d+/g, '?');
      const finalSql = `UPDATE ${tableName} SET ${finalSetClause} ${whereSqlWithQuestion}`;
      const finalParams = [...finalUpdateParams, ...whereParams];

      // Логируем для отладки
      if (tableName === 'Task') {
        console.log('Task update SQL:', finalSql);
        console.log('Task update params:', finalParams);
        console.log('Update data:', data);
        console.log('Fields with params:', fieldsWithParams);
        console.log('Null fields:', nullFields);
        console.log('Set clause:', finalSetClause);
        console.log('Update params count:', finalUpdateParams.length);
        console.log('Where params count:', whereParams.length);
      }

      try {
        sqliteConnection.prepare(finalSql).run(...finalParams);
      } catch (error: any) {
        console.error(`Error updating ${tableName}:`, error);
        console.error('SQL:', finalSql);
        console.error('Params:', finalParams);
        throw error;
      }

      return createModelMethods(tableName).findUnique({ where, select, include });
    },

    delete: async (args: { where: WhereClause }) => {
      const { where } = args;
      const { sql: whereSql, params } = buildWhereClause(where);
      sqliteConnection.prepare(`DELETE FROM ${tableName} ${whereSql}`).run(...params);
    },

    count: async (args: { where?: WhereClause } = {}) => {
      const { where = {} } = args;
      const { sql: whereSql, params } = buildWhereClause(where);
      const result = sqliteConnection.prepare(`SELECT COUNT(*) as count FROM ${tableName} ${whereSql}`).get(...params) as { count: number };
      return result.count;
    },

    deleteMany: async (args: { where: WhereClause }) => {
      const { where } = args;
      const { sql: whereSql, params } = buildWhereClause(where);
      const result = sqliteConnection.prepare(`DELETE FROM ${tableName} ${whereSql}`).run(...params);
      return { count: result.changes || 0 };
    },

    createMany: async (args: { data: Record<string, any>[] }) => {
      const { data } = args;
      if (data.length === 0) return { count: 0 };
      
      const now = new Date().toISOString();
      const transaction = sqliteConnection.transaction(() => {
        let count = 0;
        for (const item of data) {
          const id = item.id || generateId();
          const fields = Object.keys(item).filter(k => k !== 'id');
          const values = fields.map(() => '?');
          const params = [id, ...fields.map(f => {
            if (item[f] instanceof Date) return item[f].toISOString();
            if (typeof item[f] === 'boolean') return item[f] ? 1 : 0;
            return item[f];
          })];

          if (!item.createdAt) {
            fields.push('createdAt');
            values.push('?');
            params.push(now);
          }
          if (!item.updatedAt && tableName !== 'ActionLog') {
            fields.push('updatedAt');
            values.push('?');
            params.push(now);
          }

          const sql = `INSERT INTO ${tableName} (id, ${fields.join(', ')}) VALUES (?, ${values.join(', ')})`;
          sqliteConnection.prepare(sql).run(...params);
          count++;
        }
        return count;
      });

      const count = transaction();
      return { count };
    },
  };
}

// API для работы с моделями (совместимый с Prisma-подобным API для удобства миграции)
export const dbClient = {
  user: {
    findUnique: async (args: { where: WhereClause; select?: SelectFields; include?: IncludeClause }) => {
      const { where, select, include } = args;
      const { sql: whereSql, params } = buildWhereClause(where);
      const finalSql = `SELECT * FROM User ${whereSql} LIMIT 1`;
      
      const row = sqliteConnection.prepare(finalSql).get(...params) as any;
      if (!row) return null;

      // Обработка include
      if (include) {
        if (include.actionLogs) {
          row.actionLogs = sqliteConnection.prepare('SELECT * FROM ActionLog WHERE userId = ?').all(row.id);
        }
        if (include.restaurants) {
          const restaurants = sqliteConnection.prepare('SELECT * FROM RestaurantUser WHERE userId = ?').all(row.id) as any[];
          const restaurantsInclude = include.restaurants;
          if (typeof restaurantsInclude === 'object' && restaurantsInclude !== null && !Array.isArray(restaurantsInclude)) {
            const restaurantsIncludeObj = restaurantsInclude as any;
            if ('where' in restaurantsIncludeObj && restaurantsIncludeObj.where) {
              const filtered = restaurants.filter((ru: any) => {
                for (const [key, value] of Object.entries(restaurantsIncludeObj.where)) {
                  if (ru[key] !== value) return false;
                }
                return true;
              });
              if ('include' in restaurantsIncludeObj && restaurantsIncludeObj.include) {
                for (const ru of filtered) {
                  if (restaurantsIncludeObj.include && typeof restaurantsIncludeObj.include === 'object' && 'restaurant' in restaurantsIncludeObj.include) {
                    ru.restaurant = sqliteConnection.prepare('SELECT * FROM Restaurant WHERE id = ?').get(ru.restaurantId);
                  }
                }
              }
              row.restaurants = filtered;
            } else {
              row.restaurants = restaurants;
            }
          } else {
            row.restaurants = restaurants;
          }
        }
        if (include.managedRestaurants) {
          row.managedRestaurants = sqliteConnection.prepare('SELECT * FROM Restaurant WHERE managerId = ?').all(row.id);
        }
        if (include.pushSubscriptions) {
          row.pushSubscriptions = sqliteConnection.prepare('SELECT * FROM PushSubscription WHERE userId = ? AND isActive = 1').all(row.id);
        }
        if (include.NotificationSettings) {
          row.NotificationSettings = sqliteConnection.prepare('SELECT * FROM NotificationSettings WHERE userId = ?').get(row.id);
        }
      }

      // Обработка select
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
      let sql = `SELECT * FROM User ${whereSql}`;
      
      if (orderBy) {
        const orderByKey = Object.keys(orderBy)[0];
        const orderByValue = orderBy[orderByKey];
        sql += ` ORDER BY ${orderByKey} ${orderByValue === 'desc' ? 'DESC' : 'ASC'}`;
      }
      
      sql += ' LIMIT 1';
      const rows = sqliteConnection.prepare(sql).all(...params) as any[];
      
      if (!rows.length) return null;

      if (include) {
        if (include.actionLogs) {
          rows[0].actionLogs = sqliteConnection.prepare('SELECT * FROM ActionLog WHERE userId = ?').all(rows[0].id);
        }
        if (include.restaurants) {
          rows[0].restaurants = sqliteConnection.prepare('SELECT * FROM RestaurantUser WHERE userId = ?').all(rows[0].id);
        }
      }

      const selectFields = getSelectFields(select);
      if (selectFields) {
        const filtered: any = {};
        for (const field of selectFields) {
          if (rows[0][field] !== undefined) {
            filtered[field] = rows[0][field];
          }
        }
        return filtered;
      }

      return rows[0];
    },

    findMany: async (args: { where?: WhereClause; select?: SelectFields; include?: IncludeClause; orderBy?: any; take?: number; skip?: number } = {}) => {
      const { where = {}, select, include, orderBy, take, skip } = args;
      const { sql: whereSql, params } = buildWhereClause(where);
      let sql = `SELECT * FROM User ${whereSql}`;
      
      if (orderBy) {
        const orderByKey = Object.keys(orderBy)[0];
        const orderByValue = orderBy[orderByKey];
        sql += ` ORDER BY ${orderByKey} ${orderByValue === 'desc' ? 'DESC' : 'ASC'}`;
      }
      
      if (take) sql += ` LIMIT ${take}`;
      if (skip) sql += ` OFFSET ${skip}`;
      
      const rows = sqliteConnection.prepare(sql).all(...params) as any[];

      if (include) {
        for (const row of rows) {
          if (include.actionLogs) {
            row.actionLogs = sqliteConnection.prepare('SELECT * FROM ActionLog WHERE userId = ?').all(row.id);
          }
          if (include.restaurants) {
            row.restaurants = sqliteConnection.prepare('SELECT * FROM RestaurantUser WHERE userId = ?').all(row.id);
          }
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
      
      const fields = Object.keys(data).filter(k => k !== 'id');
      const values = fields.map(() => '?');
      const params = [id, ...fields.map(f => {
        if (data[f] instanceof Date) return data[f].toISOString();
        // Конвертируем boolean в число для SQLite
        if (typeof data[f] === 'boolean') return data[f] ? 1 : 0;
        return data[f];
      })];

      if (!data.createdAt) {
        fields.push('createdAt');
        values.push('?');
        params.push(now);
      }
      if (!data.updatedAt) {
        fields.push('updatedAt');
        values.push('?');
        params.push(now);
      }

      const sql = `INSERT INTO User (id, ${fields.join(', ')}) VALUES (?, ${values.join(', ')})`;
      sqliteConnection.prepare(sql).run(...params);

      return dbClient.user.findUnique({ where: { id }, select, include });
    },

    update: async (args: { where: WhereClause; data: Record<string, any>; select?: SelectFields; include?: IncludeClause }) => {
      const { where, data, select, include } = args;
      const { sql: whereSql, params: whereParams } = buildWhereClause(where);
      
      const updateFields = Object.keys(data).filter(k => k !== 'id');
      const setClause = updateFields.map(f => `${f} = ?`).join(', ');
      const updateParams = updateFields.map(f => {
        if (data[f] instanceof Date) return data[f].toISOString();
        // Конвертируем boolean в число для SQLite
        if (typeof data[f] === 'boolean') return data[f] ? 1 : 0;
        return data[f];
      });
      
      // Добавляем updatedAt
      const now = new Date().toISOString();
      const finalSetClause = updateFields.includes('updatedAt') ? setClause : `${setClause}, updatedAt = ?`;
      const finalUpdateParams = updateFields.includes('updatedAt') ? updateParams : [...updateParams, now];

      const finalSql = `UPDATE User SET ${finalSetClause} ${whereSql}`;
      const allParams = [...finalUpdateParams, ...whereParams];
      
      sqliteConnection.prepare(finalSql).run(...allParams);

      return dbClient.user.findUnique({ where, select, include });
    },

    delete: async (args: { where: WhereClause }) => {
      const { where } = args;
      const { sql: whereSql, params } = buildWhereClause(where);
      sqliteConnection.prepare(`DELETE FROM User ${whereSql}`).run(...params);
    },

    count: async (args: { where?: WhereClause } = {}) => {
      const { where = {} } = args;
      const { sql: whereSql, params } = buildWhereClause(where);
      const result = sqliteConnection.prepare(`SELECT COUNT(*) as count FROM User ${whereSql}`).get(...params) as { count: number };
      return result.count;
    },
  },

  restaurant: {
    findUnique: async (args: { where: WhereClause; select?: SelectFields; include?: IncludeClause }) => {
      const { where, select, include } = args;
      const { sql: whereSql, params } = buildWhereClause(where);
      const row = sqliteConnection.prepare(`SELECT * FROM Restaurant ${whereSql} LIMIT 1`).get(...params) as any;
      if (!row) return null;

      if (include) {
        if (include.manager) {
          row.manager = sqliteConnection.prepare('SELECT * FROM User WHERE id = ?').get(row.managerId);
        }
        if (include.departments) {
          row.departments = sqliteConnection.prepare('SELECT * FROM Department WHERE restaurantId = ?').all(row.id);
        }
        if (include.employees) {
          row.employees = sqliteConnection.prepare('SELECT * FROM RestaurantUser WHERE restaurantId = ?').all(row.id);
        }
        if (include.positions) {
          row.positions = sqliteConnection.prepare('SELECT * FROM Position WHERE restaurantId = ?').all(row.id);
        }
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
      let sql = `SELECT * FROM Restaurant ${whereSql}`;
      
      if (orderBy) {
        const orderByKey = Object.keys(orderBy)[0];
        const orderByValue = orderBy[orderByKey];
        sql += ` ORDER BY ${orderByKey} ${orderByValue === 'desc' ? 'DESC' : 'ASC'}`;
      }
      
      sql += ' LIMIT 1';
      const rows = sqliteConnection.prepare(sql).all(...params) as any[];
      
      if (!rows.length) return null;

      const selectFields = getSelectFields(select);
      if (selectFields) {
        const filtered: any = {};
        for (const field of selectFields) {
          if (rows[0][field] !== undefined) {
            filtered[field] = rows[0][field];
          }
        }
        return filtered;
      }

      return rows[0];
    },

    findMany: async (args: { where?: WhereClause; select?: SelectFields; include?: IncludeClause; orderBy?: any; take?: number; skip?: number } = {}) => {
      const { where = {}, select, include, orderBy, take, skip } = args;
      const { sql: whereSql, params } = buildWhereClause(where);
      let sql = `SELECT * FROM Restaurant ${whereSql}`;
      
      if (orderBy) {
        const orderByKey = Object.keys(orderBy)[0];
        const orderByValue = orderBy[orderByKey];
        sql += ` ORDER BY ${orderByKey} ${orderByValue === 'desc' ? 'DESC' : 'ASC'}`;
      }
      
      if (take) sql += ` LIMIT ${take}`;
      if (skip) sql += ` OFFSET ${skip}`;
      
      const rows = sqliteConnection.prepare(sql).all(...params) as any[];

      if (include) {
        for (const row of rows) {
          if (include.manager) {
            row.manager = sqliteConnection.prepare('SELECT * FROM User WHERE id = ?').get(row.managerId);
          }
          if (include.departments) {
            row.departments = sqliteConnection.prepare('SELECT * FROM Department WHERE restaurantId = ?').all(row.id);
          }
          if (include.employees) {
            row.employees = sqliteConnection.prepare('SELECT * FROM RestaurantUser WHERE restaurantId = ?').all(row.id);
          }
          if (include.positions) {
            row.positions = sqliteConnection.prepare('SELECT * FROM Position WHERE restaurantId = ?').all(row.id);
          }
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
      
      const fields = Object.keys(data).filter(k => k !== 'id');
      const values = fields.map(() => '?');
      const params = [id, ...fields.map(f => {
        if (data[f] instanceof Date) return data[f].toISOString();
        // Конвертируем boolean в число для SQLite
        if (typeof data[f] === 'boolean') return data[f] ? 1 : 0;
        return data[f];
      })];

      if (!data.createdAt) {
        fields.push('createdAt');
        values.push('?');
        params.push(now);
      }
      if (!data.updatedAt) {
        fields.push('updatedAt');
        values.push('?');
        params.push(now);
      }

      const sql = `INSERT INTO Restaurant (id, ${fields.join(', ')}) VALUES (?, ${values.join(', ')})`;
      sqliteConnection.prepare(sql).run(...params);

      return dbClient.restaurant.findUnique({ where: { id }, select, include });
    },

    update: async (args: { where: WhereClause; data: Record<string, any>; select?: SelectFields; include?: IncludeClause }) => {
      const { where, data, select, include } = args;
      const { sql: whereSql, params: whereParams } = buildWhereClause(where);
      
      const updateFields = Object.keys(data).filter(k => k !== 'id');
      const setClause = updateFields.map(f => {
        // Обработка increment
        if (data[f] && typeof data[f] === 'object' && data[f].increment !== undefined) {
          return `${f} = ${f} + ?`;
        }
        return `${f} = ?`;
      }).join(', ');
      
      const updateParams = updateFields.map(f => {
        if (data[f] && typeof data[f] === 'object' && data[f].increment !== undefined) {
          return data[f].increment;
        }
        if (data[f] instanceof Date) return data[f].toISOString();
        // Конвертируем boolean в число для SQLite
        if (typeof data[f] === 'boolean') return data[f] ? 1 : 0;
        return data[f];
      });
      
      const now = new Date().toISOString();
      const finalSetClause = updateFields.includes('updatedAt') ? setClause : `${setClause}, updatedAt = ?`;
      const finalUpdateParams = updateFields.includes('updatedAt') ? updateParams : [...updateParams, now];

      const finalSql = `UPDATE Restaurant SET ${finalSetClause} ${whereSql}`;
      const allParams = [...finalUpdateParams, ...whereParams];
      
      sqliteConnection.prepare(finalSql).run(...allParams);

      return dbClient.restaurant.findUnique({ where, select, include });
    },

    delete: async (args: { where: WhereClause }) => {
      const { where } = args;
      const { sql: whereSql, params } = buildWhereClause(where);
      sqliteConnection.prepare(`DELETE FROM Restaurant ${whereSql}`).run(...params);
    },

    count: async (args: { where?: WhereClause } = {}) => {
      const { where = {} } = args;
      const { sql: whereSql, params } = buildWhereClause(where);
      const result = sqliteConnection.prepare(`SELECT COUNT(*) as count FROM Restaurant ${whereSql}`).get(...params) as { count: number };
      return result.count;
    },
  },

  restaurantUser: {
    findFirst: async (args: { where?: WhereClause; select?: SelectFields; include?: IncludeClause }) => {
      const { where = {}, select, include } = args;
      const { sql: whereSql, params } = buildWhereClause(where);
      const result = sqliteConnection.prepare(`SELECT * FROM RestaurantUser ${whereSql} LIMIT 1`).get(...params) as any;
      console.log('=== FIND FIRST RESULT ===');
      console.log('Raw result from DB:', result);
      console.log('========================');
      if (!result) return null;
      
      // Конвертируем boolean поля
      const convertedRow = convertBooleanFields(result);

      if (include) {
        if (include.position) {
          const position = sqliteConnection.prepare('SELECT * FROM Position WHERE id = ?').get(convertedRow.positionId) as any;
          if (position) {
            const convertedPosition = convertBooleanFields(position);
            if (include.position === true) {
              convertedRow.position = convertedPosition;
            } else if (typeof include.position === 'object' && include.position.include) {
              convertedRow.position = convertedPosition;
            if (include.position.include.permissions) {
                const permissions = sqliteConnection.prepare(`
                SELECT p.* FROM Permission p
                INNER JOIN PositionPermission pp ON p.id = pp.permissionId
                WHERE pp.positionId = ?
              `).all(position.id);
              convertedRow.position.permissions = permissions.map((p: any) => ({
                  permission: convertBooleanFields(p),
                permissionId: p.id,
                positionId: position.id,
              }));
              }
            }
          }
        }
        if (include.user) {
          const userRow = sqliteConnection.prepare('SELECT * FROM User WHERE id = ?').get(convertedRow.userId);
          convertedRow.user = userRow ? convertBooleanFields(userRow) : null;
        }
        if (include.department) {
          const departmentRow = convertedRow.departmentId ? sqliteConnection.prepare('SELECT * FROM Department WHERE id = ?').get(convertedRow.departmentId) : null;
          convertedRow.department = departmentRow ? convertBooleanFields(departmentRow) : null;
        }
        if (include.restaurant) {
          const restaurantRow = sqliteConnection.prepare('SELECT * FROM Restaurant WHERE id = ?').get(convertedRow.restaurantId);
          convertedRow.restaurant = restaurantRow ? convertBooleanFields(restaurantRow) : null;
        }
      }

      const selectFields = getSelectFields(select);
      if (selectFields) {
        const filtered: any = {};
        for (const field of selectFields) {
          if (convertedRow[field] !== undefined) {
            filtered[field] = convertedRow[field];
          }
        }
        return filtered;
      }

      return convertedRow;
    },

    findUnique: async (args: { where: WhereClause; select?: SelectFields; include?: IncludeClause }) => {
      // Для unique constraints вида { restaurantId_userId: { restaurantId, userId } }
      const { where, select, include } = args;
      let whereClause: WhereClause = where;
      if ((where as any).restaurantId_userId) {
        whereClause = {
          restaurantId: (where as any).restaurantId_userId.restaurantId,
          userId: (where as any).restaurantId_userId.userId,
        };
      }
      return dbClient.restaurantUser.findFirst({ where: whereClause, select, include });
    },

    findMany: async (args: { where?: WhereClause; select?: SelectFields; include?: IncludeClause; orderBy?: any; take?: number; skip?: number } = {}) => {
      const { where = {}, select, include, orderBy } = args;
      const { sql: whereSql, params } = buildWhereClause(where);
      let sql = `SELECT * FROM RestaurantUser ${whereSql}`;
      
      if (orderBy) {
        // Обработка массива orderBy (берем первый элемент)
        const orderByObj = Array.isArray(orderBy) ? orderBy[0] : orderBy;
        const orderByKey = Object.keys(orderByObj)[0];
        const orderByValue = orderByObj[orderByKey];
        sql += ` ORDER BY ${orderByKey} ${orderByValue === 'desc' ? 'DESC' : 'ASC'}`;
      }
      
      const rows = sqliteConnection.prepare(sql).all(...params) as any[];

      // Конвертируем boolean поля для всех строк
      const convertedRows = rows.map(row => convertBooleanFields(row));

      if (include) {
        for (const row of convertedRows) {
          if (include.position) {
            const position = sqliteConnection.prepare('SELECT * FROM Position WHERE id = ?').get(row.positionId) as any;
            if (position) {
              const convertedPosition = convertBooleanFields(position);
              row.position = convertedPosition;
              if (typeof include.position === 'object' && include.position.include?.permissions) {
                const permissions = sqliteConnection.prepare(`
                  SELECT p.* FROM Permission p
                  INNER JOIN PositionPermission pp ON p.id = pp.permissionId
                  WHERE pp.positionId = ?
                `).all(position.id);
                row.position.permissions = permissions.map((p: any) => ({
                  permission: convertBooleanFields(p),
                  permissionId: p.id,
                  positionId: position.id,
                }));
              }
            }
          }
          if (include.user) {
            const userRow = sqliteConnection.prepare('SELECT * FROM User WHERE id = ?').get(row.userId);
            row.user = userRow ? convertBooleanFields(userRow) : null;
          }
          if (include.department) {
            const departmentRow = row.departmentId ? sqliteConnection.prepare('SELECT * FROM Department WHERE id = ?').get(row.departmentId) : null;
            row.department = departmentRow ? convertBooleanFields(departmentRow) : null;
          }
          if (include.restaurant) {
            const restaurantRow = sqliteConnection.prepare('SELECT * FROM Restaurant WHERE id = ?').get(row.restaurantId);
            row.restaurant = restaurantRow ? convertBooleanFields(restaurantRow) : null;
          }
        }
      }

      const selectFields = getSelectFields(select);
      if (selectFields) {
        return convertedRows.map(row => {
          const filtered: any = {};
          for (const field of selectFields) {
            if (row[field] !== undefined) {
              filtered[field] = row[field];
            }
          }
          return filtered;
        });
      }

      return convertedRows;
    },

    create: async (args: { data: Record<string, any>; select?: SelectFields; include?: IncludeClause }) => {
      const { data, select, include } = args;
      const id = data.id || generateId();
      const now = new Date().toISOString();
      
      const fields = Object.keys(data).filter(k => k !== 'id');
      const values = fields.map(() => '?');
      const params = [id, ...fields.map(f => {
        if (data[f] instanceof Date) return data[f].toISOString();
        // Конвертируем boolean в число для SQLite
        if (typeof data[f] === 'boolean') return data[f] ? 1 : 0;
        return data[f];
      })];

      if (!data.createdAt) {
        fields.push('createdAt');
        values.push('?');
        params.push(now);
      }
      if (!data.updatedAt) {
        fields.push('updatedAt');
        values.push('?');
        params.push(now);
      }

      const sql = `INSERT INTO RestaurantUser (id, ${fields.join(', ')}) VALUES (?, ${values.join(', ')})`;
      sqliteConnection.prepare(sql).run(...params);

      return dbClient.restaurantUser.findFirst({ where: { id }, select, include });
    },

    update: async (args: { where: WhereClause; data: Record<string, any>; select?: SelectFields; include?: IncludeClause }) => {
      const { where, data, select, include } = args;
      
      // Обработка unique constraints
      let whereClause = where;
      if (where.restaurantId_userId) {
        whereClause = {
          restaurantId: where.restaurantId_userId.restaurantId,
          userId: where.restaurantId_userId.userId,
        };
      }
      
      const { sql: whereSql, params: whereParams } = buildWhereClause(whereClause);
      
      // Фильтруем undefined значения из data
      const updateFields = Object.keys(data).filter(k => k !== 'id' && data[k] !== undefined);
      const setClause = updateFields.map(f => {
        // Обработка increment
        if (data[f] && typeof data[f] === 'object' && data[f].increment !== undefined) {
          return `${f} = ${f} + ?`;
        }
        return `${f} = ?`;
      }).join(', ');
      
      const updateParams = updateFields.map(f => {
        if (data[f] && typeof data[f] === 'object' && data[f].increment !== undefined) {
          return data[f].increment;
        }
        if (data[f] instanceof Date) return data[f].toISOString();
        // Конвертируем boolean в число для SQLite
        if (typeof data[f] === 'boolean') return data[f] ? 1 : 0;
        return data[f];
      });
      
      const now = new Date().toISOString();
      const finalSetClause = updateFields.includes('updatedAt') ? setClause : `${setClause}, updatedAt = ?`;
      const finalUpdateParams = updateFields.includes('updatedAt') ? updateParams : [...updateParams, now];

      const finalSql = `UPDATE RestaurantUser SET ${finalSetClause} ${whereSql}`;
      const allParams = [...finalUpdateParams, ...whereParams];
      
      console.log('=== UPDATE SQL DEBUG ===');
      console.log('SQL:', finalSql);
      console.log('AllParams:', allParams);
      console.log('UpdateFields:', updateFields);
      console.log('SetClause:', setClause);
      console.log('FinalSetClause:', finalSetClause);
      console.log('======================');
      
      sqliteConnection.prepare(finalSql).run(...allParams);

      return dbClient.restaurantUser.findFirst({ where: whereClause, select, include });
    },

    delete: async (args: { where: WhereClause }) => {
      const { where } = args;
      
      // Обработка unique constraints
      let whereClause = where;
      if (where.restaurantId_userId) {
        whereClause = {
          restaurantId: where.restaurantId_userId.restaurantId,
          userId: where.restaurantId_userId.userId,
        };
      }
      
      const { sql: whereSql, params } = buildWhereClause(whereClause);
      sqliteConnection.prepare(`DELETE FROM RestaurantUser ${whereSql}`).run(...params);
    },

    count: async (args: { where?: WhereClause } = {}) => {
      const { where = {} } = args;
      const { sql: whereSql, params } = buildWhereClause(where);
      const result = sqliteConnection.prepare(`SELECT COUNT(*) as count FROM RestaurantUser ${whereSql}`).get(...params) as { count: number };
      return result.count;
    },
  },
};

// Добавляем остальные модели
const dbClientWithModels = {
  ...dbClient,
  department: createModelMethods('Department'),
  position: createModelMethods('Position'),
  permission: createModelMethods('Permission'),
  positionPermission: createModelMethods('PositionPermission'),
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
};

// Экспортируем dbClient и sqliteConnection
export { sqliteConnection as sqliteDb };
export default dbClientWithModels;

