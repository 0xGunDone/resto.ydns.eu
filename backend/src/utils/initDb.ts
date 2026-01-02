/**
 * PostgreSQL Database Initialization
 * 
 * This module initializes the PostgreSQL database schema and seeds initial data.
 */
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../services/loggerService';

const connectionString = process.env.DATABASE_URL || 'postgresql://localhost:5432/resto';

const pool = new Pool({
  connectionString,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

/**
 * Check if a table exists in the database
 */
async function tableExists(tableName: string): Promise<boolean> {
  const result = await pool.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = $1
    )
  `, [tableName]);
  return result.rows[0].exists;
}

/**
 * Execute SQL schema file
 */
async function executeSchemaFile(filePath: string): Promise<void> {
  const sql = fs.readFileSync(filePath, 'utf-8');
  
  // Split by semicolons but handle $$ blocks for functions
  const statements: string[] = [];
  let current = '';
  let inDollarBlock = false;
  
  for (const line of sql.split('\n')) {
    const trimmed = line.trim();
    
    // Skip comments
    if (trimmed.startsWith('--')) {
      continue;
    }
    
    // Track $$ blocks (for functions/triggers)
    if (trimmed.includes('$$')) {
      const count = (trimmed.match(/\$\$/g) || []).length;
      if (count % 2 === 1) {
        inDollarBlock = !inDollarBlock;
      }
    }
    
    current += line + '\n';
    
    // If we're not in a $$ block and line ends with semicolon, it's a complete statement
    if (!inDollarBlock && trimmed.endsWith(';')) {
      const stmt = current.trim();
      if (stmt && !stmt.startsWith('--')) {
        statements.push(stmt);
      }
      current = '';
    }
  }
  
  // Add any remaining statement
  if (current.trim()) {
    statements.push(current.trim());
  }
  
  for (const statement of statements) {
    if (statement.trim()) {
      try {
        await pool.query(statement);
      } catch (error: any) {
        // Ignore "already exists" errors
        if (!error.message.includes('already exists') && 
            !error.message.includes('duplicate key')) {
          logger.warn(`Warning executing SQL: ${statement.substring(0, 100)}...`, { error: error.message });
        }
      }
    }
  }
}

/**
 * Initialize the database schema
 */
export async function initDatabase(): Promise<void> {
  logger.info('Initializing PostgreSQL database...');
  
  try {
    // Test connection
    await pool.query('SELECT 1');
    logger.info('Connected to PostgreSQL');
    
    // Check if database is already initialized
    if (await tableExists('User')) {
      logger.info('Database already initialized');
      
      // Check for new tables that might need to be added
      if (!(await tableExists('TelegramSession'))) {
        logger.info('Creating TelegramSession table...');
        await pool.query(`
          CREATE TABLE IF NOT EXISTS "TelegramSession" (
            "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            "telegram_user_id" VARCHAR(100) NOT NULL,
            "step" VARCHAR(50) NOT NULL DEFAULT 'idle',
            "invite_token" VARCHAR(255),
            "registration_data" JSONB,
            "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "expires_at" TIMESTAMPTZ NOT NULL
          )
        `);
        await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS "TelegramSession_telegram_user_id_key" ON "TelegramSession"("telegram_user_id")`);
        logger.info('TelegramSession table created');
      }
      
      if (!(await tableExists('SwapRequest'))) {
        logger.info('Creating SwapRequest table...');
        await pool.query(`
          CREATE TABLE IF NOT EXISTS "SwapRequest" (
            "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            "shiftId" UUID NOT NULL REFERENCES "Shift"("id") ON DELETE CASCADE,
            "fromUserId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
            "toUserId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
            "status" VARCHAR(50) NOT NULL DEFAULT 'PENDING',
            "requestedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "respondedAt" TIMESTAMPTZ,
            "approvedAt" TIMESTAMPTZ,
            "approvedById" UUID REFERENCES "User"("id") ON DELETE SET NULL,
            "expiresAt" TIMESTAMPTZ NOT NULL,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);
        await pool.query(`CREATE INDEX IF NOT EXISTS "SwapRequest_status_idx" ON "SwapRequest"("status")`);
        logger.info('SwapRequest table created');
      }
      
      await pool.end();
      return;
    }
    
    logger.info('Creating database schema...');
    
    // Execute the PostgreSQL schema file
    const schemaPath = path.join(__dirname, '../database/scripts/postgresql-schema.sql');
    
    if (fs.existsSync(schemaPath)) {
      await executeSchemaFile(schemaPath);
      logger.info('Schema created from postgresql-schema.sql');
    } else {
      logger.error('Schema file not found:', schemaPath);
      throw new Error('PostgreSQL schema file not found');
    }
    
    logger.info('Database successfully initialized');
    
    // Seed the database with initial data
    await seedDatabase();
    
  } catch (error: any) {
    logger.error('Failed to initialize database', { error: error.message });
    throw error;
  } finally {
    await pool.end();
  }
}

/**
 * Seed the database with initial data
 */
async function seedDatabase(): Promise<void> {
  logger.info('Seeding database with initial data...');
  
  // Import seed function
  const { seedDatabase: seed } = await import('./seedDb-postgres');
  await seed();
  
  logger.info('Database seeded successfully');
}

// Run if called directly
if (require.main === module) {
  initDatabase()
    .then(() => {
      logger.info('Database initialization complete');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Database initialization failed', { error: error.message });
      process.exit(1);
    });
}
