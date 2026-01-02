/**
 * PostgreSQL Database Seeding
 * 
 * Seeds the database with initial data (admin user, permissions, etc.)
 */
import { Pool } from 'pg';
import { hashPassword } from './bcrypt';
import { logger } from '../services/loggerService';
import { PERMISSIONS, PERMISSION_CATEGORIES } from './permissions';

const connectionString = process.env.DATABASE_URL || 'postgresql://localhost:5432/resto';

const pool = new Pool({
  connectionString,
  max: 5,
});

function generateId(): string {
  const bytes = require('crypto').randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function seedDatabase(): Promise<void> {
  logger.info('Seeding PostgreSQL database...');

  try {
    // Create admin user
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@resto.local';
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!';

    const existingAdmin = await pool.query(
      'SELECT * FROM "User" WHERE "email" = $1',
      [adminEmail]
    );

    if (existingAdmin.rows.length === 0) {
      const adminPasswordHash = await hashPassword(adminPassword);
      const adminId = generateId();

      await pool.query(`
        INSERT INTO "User" ("id", "email", "passwordHash", "firstName", "lastName", "role", "isActive", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      `, [adminId, adminEmail, adminPasswordHash, 'Admin', 'User', 'OWNER', true]);

      logger.info(`Admin user created: ${adminEmail}`);
    } else {
      logger.info(`Admin user already exists: ${adminEmail}`);
    }

    // Seed permissions
    await seedPermissions();

    logger.info('Database seeding completed');
  } catch (error: any) {
    logger.error('Error seeding database', { error: error.message });
    throw error;
  } finally {
    await pool.end();
  }
}

async function seedPermissions(): Promise<void> {
  logger.info('Seeding permissions...');

  const permissionEntries = Object.entries(PERMISSIONS);
  
  for (const [code, _] of permissionEntries) {
    const existingPermission = await pool.query(
      'SELECT * FROM "Permission" WHERE "code" = $1',
      [code]
    );

    if (existingPermission.rows.length === 0) {
      const id = generateId();
      const name = code.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
      const category = getPermissionCategory(code);

      await pool.query(`
        INSERT INTO "Permission" ("id", "code", "name", "category", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, NOW(), NOW())
      `, [id, code, name, category]);
    }
  }

  logger.info('Permissions seeded');
}

function getPermissionCategory(code: string): string {
  for (const [category, permissions] of Object.entries(PERMISSION_CATEGORIES)) {
    if (permissions.includes(code)) {
      return category;
    }
  }
  return 'OTHER';
}

// Run if called directly
if (require.main === module) {
  seedDatabase()
    .then(() => {
      logger.info('Seeding complete');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Seeding failed', { error: error.message });
      process.exit(1);
    });
}
