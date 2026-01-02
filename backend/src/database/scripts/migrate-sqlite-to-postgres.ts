/**
 * SQLite to PostgreSQL Migration Script
 * 
 * This script exports data from SQLite and imports it into PostgreSQL.
 * It handles:
 * - Data type conversions (TEXT to UUID, DATETIME to TIMESTAMPTZ)
 * - JSON field conversions
 * - Data integrity validation
 * 
 * Usage:
 *   npx ts-node src/database/scripts/migrate-sqlite-to-postgres.ts
 * 
 * Environment variables:
 *   SQLITE_PATH - Path to SQLite database (default: ./dev.db)
 *   POSTGRES_URL - PostgreSQL connection string
 */

import * as Database from 'better-sqlite3';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs';

// Configuration
const SQLITE_PATH = process.env.SQLITE_PATH || path.join(__dirname, '../../../dev.db');
const POSTGRES_URL = process.env.POSTGRES_URL || process.env.DATABASE_URL;

// Tables in order of dependencies (parent tables first)
const TABLES_ORDER = [
  'User',
  'Restaurant',
  'Department',
  'Position',
  'Permission',
  'PositionPermission',
  'RestaurantUser',
  'ShiftTemplate',
  'ScheduleTemplate',
  'Shift',
  'Task',
  'TaskAttachment',
  'Timesheet',
  'Feedback',
  'FeedbackAttachment',
  'ActionLog',
  'InviteLink',
  'ShiftSwapHistory',
  'Holiday',
  'Bonus',
  'Penalty',
  'Notification',
  'PushSubscription',
  'NotificationSettings',
  'TelegramSession',
  'SwapRequest'
];

// ID mapping for TEXT to UUID conversion
const idMappings: Map<string, Map<string, string>> = new Map();

interface MigrationStats {
  table: string;
  exported: number;
  imported: number;
  errors: number;
}

interface ValidationResult {
  table: string;
  sqliteCount: number;
  postgresCount: number;
  isValid: boolean;
}

/**
 * Initialize ID mapping for a table
 */
function initIdMapping(tableName: string): void {
  if (!idMappings.has(tableName)) {
    idMappings.set(tableName, new Map());
  }
}

/**
 * Get or create UUID for a TEXT id
 */
function getOrCreateUuid(tableName: string, textId: string | null): string | null {
  if (!textId) return null;
  
  initIdMapping(tableName);
  const tableMap = idMappings.get(tableName)!;
  
  if (!tableMap.has(textId)) {
    // Check if it's already a valid UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(textId)) {
      tableMap.set(textId, textId);
    } else {
      tableMap.set(textId, uuidv4());
    }
  }
  
  return tableMap.get(textId)!;
}

/**
 * Convert SQLite datetime to PostgreSQL timestamptz
 */
function convertDatetime(value: string | null): string | null {
  if (!value) return null;
  
  // Handle various datetime formats
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    console.warn(`Invalid datetime value: ${value}`);
    return null;
  }
  
  return date.toISOString();
}

/**
 * Convert SQLite boolean (0/1) to PostgreSQL boolean
 */
function convertBoolean(value: number | boolean | null): boolean | null {
  if (value === null || value === undefined) return null;
  return Boolean(value);
}


/**
 * Parse JSON field safely
 */
function parseJson(value: string | null): any {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * Get column definitions for a table
 */
function getTableColumns(sqlite: Database.Database, tableName: string): string[] {
  const info = sqlite.prepare(`PRAGMA table_info("${tableName}")`).all() as { name: string }[];
  return info.map(col => col.name);
}

/**
 * Transform row data for PostgreSQL
 */
function transformRow(
  tableName: string, 
  row: Record<string, any>,
  columns: string[]
): Record<string, any> {
  const transformed: Record<string, any> = {};
  
  // ID columns that need UUID conversion
  const idColumns = ['id', 'userId', 'restaurantId', 'departmentId', 'positionId', 
    'permissionId', 'createdById', 'assignedToId', 'approvedById', 'managerId',
    'taskId', 'feedbackId', 'timesheetId', 'shiftId', 'fromUserId', 'toUserId',
    'swapRequestedTo', 'entityId'];
  
  // Datetime columns
  const datetimeColumns = ['createdAt', 'updatedAt', 'startTime', 'endTime', 
    'dueDate', 'completedAt', 'approvedAt', 'resolvedAt', 'readAt', 'expiresAt',
    'requestedAt', 'respondedAt', 'shiftDate', 'shiftStartTime', 'shiftEndTime',
    'created_at', 'updated_at', 'expires_at', 'date'];
  
  // Boolean columns
  const booleanColumns = ['isActive', 'isConfirmed', 'isCompleted', 'isRecurring',
    'isApproved', 'isAnonymous', 'isRead', 'twoFactorEnabled', 'swapRequested',
    'swapApproved', 'enablePushNotifications', 'enableTaskNotifications',
    'enableShiftNotifications', 'enableSwapNotifications', 'enableTimesheetNotifications',
    'enableInAppNotifications', 'enableReminders'];
  
  // JSON columns
  const jsonColumns = ['metadata', 'shiftsData', 'registration_data'];
  
  for (const col of columns) {
    let value = row[col];
    
    // Handle ID columns
    if (idColumns.includes(col)) {
      if (col === 'id') {
        value = getOrCreateUuid(tableName, value);
      } else {
        // Foreign key - look up in appropriate table mapping
        const refTable = getReferencedTable(col);
        if (refTable && value) {
          value = getOrCreateUuid(refTable, value);
        }
      }
    }
    // Handle datetime columns
    else if (datetimeColumns.includes(col)) {
      value = convertDatetime(value);
    }
    // Handle boolean columns
    else if (booleanColumns.includes(col)) {
      value = convertBoolean(value);
    }
    // Handle JSON columns
    else if (jsonColumns.includes(col)) {
      value = parseJson(value);
    }
    
    transformed[col] = value;
  }
  
  return transformed;
}

/**
 * Get referenced table for a foreign key column
 */
function getReferencedTable(columnName: string): string | null {
  const mappings: Record<string, string> = {
    'userId': 'User',
    'restaurantId': 'Restaurant',
    'departmentId': 'Department',
    'positionId': 'Position',
    'permissionId': 'Permission',
    'createdById': 'User',
    'assignedToId': 'User',
    'approvedById': 'User',
    'managerId': 'User',
    'taskId': 'Task',
    'feedbackId': 'Feedback',
    'timesheetId': 'Timesheet',
    'shiftId': 'Shift',
    'fromUserId': 'User',
    'toUserId': 'User',
    'swapRequestedTo': 'User',
    'entityId': null // Can reference multiple tables
  };
  
  return mappings[columnName] || null;
}

/**
 * Export data from SQLite
 */
async function exportFromSqlite(sqlite: Database.Database): Promise<Map<string, any[]>> {
  const data = new Map<string, any[]>();
  
  console.log('\n📤 Exporting data from SQLite...\n');
  
  for (const tableName of TABLES_ORDER) {
    try {
      const rows = sqlite.prepare(`SELECT * FROM "${tableName}"`).all();
      data.set(tableName, rows);
      console.log(`  ✓ ${tableName}: ${rows.length} rows`);
    } catch (error: any) {
      if (error.message.includes('no such table')) {
        console.log(`  ⚠ ${tableName}: table does not exist (skipping)`);
        data.set(tableName, []);
      } else {
        throw error;
      }
    }
  }
  
  return data;
}


/**
 * Import data into PostgreSQL
 */
async function importToPostgres(
  pool: Pool, 
  data: Map<string, any[]>,
  sqlite: Database.Database
): Promise<MigrationStats[]> {
  const stats: MigrationStats[] = [];
  
  console.log('\n📥 Importing data into PostgreSQL...\n');
  
  // Disable foreign key checks temporarily
  await pool.query('SET session_replication_role = replica;');
  
  for (const tableName of TABLES_ORDER) {
    const rows = data.get(tableName) || [];
    const stat: MigrationStats = {
      table: tableName,
      exported: rows.length,
      imported: 0,
      errors: 0
    };
    
    if (rows.length === 0) {
      console.log(`  ⚠ ${tableName}: no data to import`);
      stats.push(stat);
      continue;
    }
    
    const columns = getTableColumns(sqlite, tableName);
    
    // Clear existing data
    try {
      await pool.query(`TRUNCATE TABLE "${tableName}" CASCADE`);
    } catch (error: any) {
      console.log(`  ⚠ ${tableName}: could not truncate (${error.message})`);
    }
    
    // Import rows in batches
    const batchSize = 100;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      
      for (const row of batch) {
        try {
          const transformed = transformRow(tableName, row, columns);
          
          const cols = Object.keys(transformed);
          const values = Object.values(transformed);
          const placeholders = cols.map((_, idx) => `$${idx + 1}`).join(', ');
          const colNames = cols.map(c => `"${c}"`).join(', ');
          
          await pool.query(
            `INSERT INTO "${tableName}" (${colNames}) VALUES (${placeholders})`,
            values
          );
          
          stat.imported++;
        } catch (error: any) {
          stat.errors++;
          console.error(`  ✗ ${tableName} row error: ${error.message}`);
        }
      }
    }
    
    console.log(`  ✓ ${tableName}: ${stat.imported}/${stat.exported} rows imported`);
    if (stat.errors > 0) {
      console.log(`    ⚠ ${stat.errors} errors`);
    }
    
    stats.push(stat);
  }
  
  // Re-enable foreign key checks
  await pool.query('SET session_replication_role = DEFAULT;');
  
  return stats;
}

/**
 * Validate data integrity after migration
 */
async function validateMigration(
  sqlite: Database.Database,
  pool: Pool
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];
  
  console.log('\n🔍 Validating data integrity...\n');
  
  for (const tableName of TABLES_ORDER) {
    let sqliteCount = 0;
    let postgresCount = 0;
    
    try {
      const sqliteResult = sqlite.prepare(`SELECT COUNT(*) as count FROM "${tableName}"`).get() as { count: number };
      sqliteCount = sqliteResult.count;
    } catch {
      // Table doesn't exist in SQLite
    }
    
    try {
      const pgResult = await pool.query(`SELECT COUNT(*) as count FROM "${tableName}"`);
      postgresCount = parseInt(pgResult.rows[0].count, 10);
    } catch {
      // Table doesn't exist in PostgreSQL
    }
    
    const isValid = sqliteCount === postgresCount;
    results.push({
      table: tableName,
      sqliteCount,
      postgresCount,
      isValid
    });
    
    const status = isValid ? '✓' : '✗';
    console.log(`  ${status} ${tableName}: SQLite=${sqliteCount}, PostgreSQL=${postgresCount}`);
  }
  
  return results;
}

/**
 * Generate migration report
 */
function generateReport(
  stats: MigrationStats[],
  validation: ValidationResult[]
): void {
  console.log('\n' + '='.repeat(60));
  console.log('📊 MIGRATION REPORT');
  console.log('='.repeat(60));
  
  const totalExported = stats.reduce((sum, s) => sum + s.exported, 0);
  const totalImported = stats.reduce((sum, s) => sum + s.imported, 0);
  const totalErrors = stats.reduce((sum, s) => sum + s.errors, 0);
  const validTables = validation.filter(v => v.isValid).length;
  
  console.log(`\nTotal rows exported: ${totalExported}`);
  console.log(`Total rows imported: ${totalImported}`);
  console.log(`Total errors: ${totalErrors}`);
  console.log(`\nValidation: ${validTables}/${validation.length} tables match`);
  
  if (totalErrors > 0) {
    console.log('\n⚠️  Migration completed with errors. Please review the logs.');
  } else if (validTables === validation.length) {
    console.log('\n✅ Migration completed successfully!');
  } else {
    console.log('\n⚠️  Migration completed but some tables have mismatched counts.');
  }
  
  console.log('='.repeat(60) + '\n');
}


/**
 * Main migration function
 */
async function migrate(): Promise<void> {
  console.log('🚀 SQLite to PostgreSQL Migration');
  console.log('='.repeat(60));
  
  // Validate configuration
  if (!POSTGRES_URL) {
    console.error('❌ Error: POSTGRES_URL or DATABASE_URL environment variable is required');
    process.exit(1);
  }
  
  if (!fs.existsSync(SQLITE_PATH)) {
    console.error(`❌ Error: SQLite database not found at ${SQLITE_PATH}`);
    process.exit(1);
  }
  
  console.log(`\nSQLite path: ${SQLITE_PATH}`);
  console.log(`PostgreSQL URL: ${POSTGRES_URL.replace(/:[^:@]+@/, ':****@')}`);
  
  // Connect to databases
  const sqlite = new Database(SQLITE_PATH, { readonly: true });
  const pool = new Pool({ connectionString: POSTGRES_URL });
  
  try {
    // Test PostgreSQL connection
    await pool.query('SELECT 1');
    console.log('\n✓ Connected to PostgreSQL');
    
    // Export from SQLite
    const data = await exportFromSqlite(sqlite);
    
    // Import to PostgreSQL
    const stats = await importToPostgres(pool, data, sqlite);
    
    // Validate migration
    const validation = await validateMigration(sqlite, pool);
    
    // Generate report
    generateReport(stats, validation);
    
  } catch (error: any) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    sqlite.close();
    await pool.end();
  }
}

/**
 * Export data to JSON file (for backup/review)
 */
async function exportToJson(outputPath: string): Promise<void> {
  console.log('📤 Exporting SQLite data to JSON...');
  
  if (!fs.existsSync(SQLITE_PATH)) {
    console.error(`❌ Error: SQLite database not found at ${SQLITE_PATH}`);
    process.exit(1);
  }
  
  const sqlite = new Database(SQLITE_PATH, { readonly: true });
  const data: Record<string, any[]> = {};
  
  for (const tableName of TABLES_ORDER) {
    try {
      const rows = sqlite.prepare(`SELECT * FROM "${tableName}"`).all();
      data[tableName] = rows;
      console.log(`  ✓ ${tableName}: ${rows.length} rows`);
    } catch (error: any) {
      if (error.message.includes('no such table')) {
        console.log(`  ⚠ ${tableName}: table does not exist`);
        data[tableName] = [];
      } else {
        throw error;
      }
    }
  }
  
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
  console.log(`\n✓ Data exported to ${outputPath}`);
  
  sqlite.close();
}

/**
 * Import data from JSON file
 */
async function importFromJson(inputPath: string): Promise<void> {
  console.log('📥 Importing data from JSON to PostgreSQL...');
  
  if (!POSTGRES_URL) {
    console.error('❌ Error: POSTGRES_URL or DATABASE_URL environment variable is required');
    process.exit(1);
  }
  
  if (!fs.existsSync(inputPath)) {
    console.error(`❌ Error: JSON file not found at ${inputPath}`);
    process.exit(1);
  }
  
  const data = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
  const pool = new Pool({ connectionString: POSTGRES_URL });
  
  // Create a mock sqlite for column info (we'll use the JSON keys)
  const dataMap = new Map<string, any[]>();
  for (const [table, rows] of Object.entries(data)) {
    dataMap.set(table, rows as any[]);
  }
  
  try {
    await pool.query('SELECT 1');
    console.log('✓ Connected to PostgreSQL');
    
    // Disable foreign key checks
    await pool.query('SET session_replication_role = replica;');
    
    for (const tableName of TABLES_ORDER) {
      const rows = dataMap.get(tableName) || [];
      if (rows.length === 0) {
        console.log(`  ⚠ ${tableName}: no data`);
        continue;
      }
      
      // Clear existing data
      try {
        await pool.query(`TRUNCATE TABLE "${tableName}" CASCADE`);
      } catch (error: any) {
        console.log(`  ⚠ ${tableName}: could not truncate`);
      }
      
      let imported = 0;
      let errors = 0;
      
      for (const row of rows) {
        try {
          const columns = Object.keys(row);
          const transformed = transformRow(tableName, row, columns);
          
          const cols = Object.keys(transformed);
          const values = Object.values(transformed);
          const placeholders = cols.map((_, idx) => `$${idx + 1}`).join(', ');
          const colNames = cols.map(c => `"${c}"`).join(', ');
          
          await pool.query(
            `INSERT INTO "${tableName}" (${colNames}) VALUES (${placeholders})`,
            values
          );
          
          imported++;
        } catch (error: any) {
          errors++;
        }
      }
      
      console.log(`  ✓ ${tableName}: ${imported}/${rows.length} rows`);
      if (errors > 0) {
        console.log(`    ⚠ ${errors} errors`);
      }
    }
    
    // Re-enable foreign key checks
    await pool.query('SET session_replication_role = DEFAULT;');
    
    console.log('\n✅ Import completed!');
    
  } finally {
    await pool.end();
  }
}

// CLI handling
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'export':
    const exportPath = args[1] || './sqlite-export.json';
    exportToJson(exportPath);
    break;
  case 'import':
    const importPath = args[1] || './sqlite-export.json';
    importFromJson(importPath);
    break;
  case 'migrate':
  default:
    migrate();
    break;
}

export { migrate, exportToJson, importFromJson };
