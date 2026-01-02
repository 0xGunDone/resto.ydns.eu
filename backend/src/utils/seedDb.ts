import { hashPassword } from './bcrypt';
import dbClient from './db';
import { logger } from '../services/loggerService';

export async function seedDatabase() {
  logger.info('Seeding database...');

  // Создаем admin пользователя
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@resto.local';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!';

  const existingAdmin = await dbClient.user.findUnique({
    where: { email: adminEmail },
  });

  if (!existingAdmin) {
    const adminPasswordHash = await hashPassword(adminPassword);

    await dbClient.user.create({
      data: {
        id: 'admin-001',
        email: adminEmail,
        passwordHash: adminPasswordHash,
        firstName: 'Admin',
        lastName: 'User',
        role: 'OWNER',
        isActive: true,
      },
    });

    logger.info(`Admin user created: ${adminEmail}`);
  } else {
    logger.info(`Admin user already exists: ${adminEmail}`);
  }

  logger.info('Database seeding completed');
}
