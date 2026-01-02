/**
 * User Repository
 * Data access layer for User entity
 * Requirements: 10.4
 */

import Database from 'better-sqlite3';
import { User, UserRole, UserWithRelations, RestaurantUser, Restaurant, ActionLog, PushSubscription, NotificationSettings } from '../types';
import { createBaseRepository, generateId } from './baseRepository';
import { convertBooleanFields } from '../typeConverters';

/**
 * Helper to safely cast converted row to type
 */
function toType<T>(row: unknown): T {
  return row as T;
}

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
export function createUserRepository(db: Database.Database) {
  const base = createBaseRepository<User>({ db, tableName: 'User' });

  return {
    ...base,

    /**
     * Find user by email
     */
    findByEmail(email: string): User | null {
      const row = db.prepare('SELECT * FROM User WHERE email = ?').get(email);
      return row ? toType<User>(convertBooleanFields(row as Record<string, unknown>)) : null;
    },

    /**
     * Find user by Telegram ID
     */
    findByTelegramId(telegramId: string): User | null {
      const row = db.prepare('SELECT * FROM User WHERE telegramId = ?').get(telegramId);
      return row ? toType<User>(convertBooleanFields(row as Record<string, unknown>)) : null;
    },

    /**
     * Find user with relations
     */
    findByIdWithRelations(id: string, include: UserIncludeOptions = {}): UserWithRelations | null {
      const user = base.findById(id);
      if (!user) return null;

      const result: UserWithRelations = { ...user };

      if (include.restaurants) {
        const rows = db.prepare('SELECT * FROM RestaurantUser WHERE userId = ?').all(id) as Record<string, unknown>[];
        result.restaurants = rows.map(row => toType<RestaurantUser>(convertBooleanFields(row))) as any;
      }

      if (include.managedRestaurants) {
        const rows = db.prepare('SELECT * FROM Restaurant WHERE managerId = ?').all(id) as Record<string, unknown>[];
        result.managedRestaurants = rows.map(row => toType<Restaurant>(convertBooleanFields(row)));
      }

      if (include.actionLogs) {
        const rows = db.prepare('SELECT * FROM ActionLog WHERE userId = ?').all(id) as Record<string, unknown>[];
        result.actionLogs = rows.map(row => toType<ActionLog>(convertBooleanFields(row)));
      }

      if (include.pushSubscriptions) {
        const rows = db.prepare('SELECT * FROM PushSubscription WHERE userId = ? AND isActive = 1').all(id) as Record<string, unknown>[];
        result.pushSubscriptions = rows.map(row => toType<PushSubscription>(convertBooleanFields(row)));
      }

      if (include.NotificationSettings) {
        const row = db.prepare('SELECT * FROM NotificationSettings WHERE userId = ?').get(id);
        result.NotificationSettings = row ? toType<NotificationSettings>(convertBooleanFields(row as Record<string, unknown>)) : undefined;
      }

      return result;
    },

    /**
     * Find all active users
     */
    findAllActive(): User[] {
      return base.findMany({ where: { isActive: true } });
    },

    /**
     * Find users by role
     */
    findByRole(role: UserRole): User[] {
      return base.findMany({ where: { role } });
    },

    /**
     * Check if user is owner or admin
     */
    isOwnerOrAdmin(userId: string): boolean {
      const user = base.findById(userId);
      return user !== null && (user.role === 'OWNER' || user.role === 'ADMIN');
    },

    /**
     * Update user's last activity (for session tracking)
     */
    updateLastActivity(userId: string): void {
      db.prepare('UPDATE User SET updatedAt = ? WHERE id = ?').run(new Date().toISOString(), userId);
    },

    /**
     * Deactivate user
     */
    deactivate(userId: string): User | null {
      return base.updateById(userId, { isActive: false });
    },

    /**
     * Activate user
     */
    activate(userId: string): User | null {
      return base.updateById(userId, { isActive: true });
    },

    /**
     * Update user's Telegram ID
     */
    setTelegramId(userId: string, telegramId: string | null): User | null {
      return base.updateById(userId, { telegramId });
    },

    /**
     * Enable two-factor authentication
     */
    enableTwoFactor(userId: string, secret: string): User | null {
      return base.updateById(userId, { 
        twoFactorSecret: secret, 
        twoFactorEnabled: true 
      });
    },

    /**
     * Disable two-factor authentication
     */
    disableTwoFactor(userId: string): User | null {
      return base.updateById(userId, { 
        twoFactorSecret: null, 
        twoFactorEnabled: false 
      });
    },
  };
}

export type UserRepository = ReturnType<typeof createUserRepository>;
