/**
 * User Repository (PostgreSQL)
 * Data access layer for User entity
 * Requirements: 10.4
 */

import { pgPool } from '../../utils/db';
import { User, UserRole, UserWithRelations, RestaurantUser, Restaurant, ActionLog, PushSubscription, NotificationSettings } from '../types';
import { createBaseRepository, generateId } from './baseRepository';

/**
 * Create options for user queries
 */
export interface UserIncludeOptions {
  restaurants?: boolean;
  managedRestaurants?: boolean;
  actionLogs?: boolean;
  pushSubscriptions?: boolean;
  NotificationSettings?: boolean;
}

/**
 * Create a User repository
 */
export function createUserRepository() {
  const base = createBaseRepository<User>({ tableName: 'User' });

  return {
    ...base,

    /**
     * Find user by email
     */
    async findByEmail(email: string): Promise<User | null> {
      const result = await pgPool.query('SELECT * FROM "User" WHERE "email" = $1', [email]);
      return result.rows[0] || null;
    },

    /**
     * Find user by Telegram ID
     */
    async findByTelegramId(telegramId: string): Promise<User | null> {
      const result = await pgPool.query('SELECT * FROM "User" WHERE "telegramId" = $1', [telegramId]);
      return result.rows[0] || null;
    },

    /**
     * Find user with relations
     */
    async findByIdWithRelations(id: string, include: UserIncludeOptions = {}): Promise<UserWithRelations | null> {
      const user = await base.findById(id);
      if (!user) return null;

      const result: UserWithRelations = { ...user };

      if (include.restaurants) {
        const rows = await pgPool.query('SELECT * FROM "RestaurantUser" WHERE "userId" = $1', [id]);
        result.restaurants = rows.rows as any;
      }

      if (include.managedRestaurants) {
        const rows = await pgPool.query('SELECT * FROM "Restaurant" WHERE "managerId" = $1', [id]);
        result.managedRestaurants = rows.rows as Restaurant[];
      }

      if (include.actionLogs) {
        const rows = await pgPool.query('SELECT * FROM "ActionLog" WHERE "userId" = $1', [id]);
        result.actionLogs = rows.rows as ActionLog[];
      }

      if (include.pushSubscriptions) {
        const rows = await pgPool.query('SELECT * FROM "PushSubscription" WHERE "userId" = $1 AND "isActive" = true', [id]);
        result.pushSubscriptions = rows.rows as PushSubscription[];
      }

      if (include.NotificationSettings) {
        const row = await pgPool.query('SELECT * FROM "NotificationSettings" WHERE "userId" = $1', [id]);
        result.NotificationSettings = row.rows[0] as NotificationSettings | undefined;
      }

      return result;
    },

    /**
     * Find all active users
     */
    async findAllActive(): Promise<User[]> {
      return base.findMany({ where: { isActive: true } });
    },

    /**
     * Find users by role
     */
    async findByRole(role: UserRole): Promise<User[]> {
      return base.findMany({ where: { role } });
    },

    /**
     * Check if user is owner or admin
     */
    async isOwnerOrAdmin(userId: string): Promise<boolean> {
      const user = await base.findById(userId);
      return user !== null && (user.role === 'OWNER' || user.role === 'ADMIN');
    },

    /**
     * Update user's last activity (for session tracking)
     */
    async updateLastActivity(userId: string): Promise<void> {
      await pgPool.query('UPDATE "User" SET "updatedAt" = $1 WHERE "id" = $2', [new Date().toISOString(), userId]);
    },

    /**
     * Deactivate user
     */
    async deactivate(userId: string): Promise<User | null> {
      return base.updateById(userId, { isActive: false });
    },

    /**
     * Activate user
     */
    async activate(userId: string): Promise<User | null> {
      return base.updateById(userId, { isActive: true });
    },

    /**
     * Update user's Telegram ID
     */
    async setTelegramId(userId: string, telegramId: string | null): Promise<User | null> {
      return base.updateById(userId, { telegramId });
    },

    /**
     * Enable two-factor authentication
     */
    async enableTwoFactor(userId: string, secret: string): Promise<User | null> {
      return base.updateById(userId, { 
        twoFactorSecret: secret, 
        twoFactorEnabled: true 
      });
    },

    /**
     * Disable two-factor authentication
     */
    async disableTwoFactor(userId: string): Promise<User | null> {
      return base.updateById(userId, { 
        twoFactorSecret: null, 
        twoFactorEnabled: false 
      });
    },
  };
}

export type UserRepository = ReturnType<typeof createUserRepository>;
