/**
 * Restaurant Repository
 * Data access layer for Restaurant entity
 * Requirements: 10.4
 */

import Database from 'better-sqlite3';
import { Restaurant, RestaurantWithRelations, User, Department, RestaurantUser, Position } from '../types';
import { createBaseRepository } from './baseRepository';
import { convertBooleanFields } from '../typeConverters';

/**
 * Helper to safely cast converted row to type
 */
function toType<T>(row: unknown): T {
  return row as T;
}

/**
 * Include options for restaurant queries
 */
export interface RestaurantIncludeOptions {
  manager?: boolean;
  departments?: boolean;
  employees?: boolean;
  positions?: boolean;
}

/**
 * Create a Restaurant repository
 */
export function createRestaurantRepository(db: Database.Database) {
  const base = createBaseRepository<Restaurant>({ db, tableName: 'Restaurant' });

  return {
    ...base,

    /**
     * Find restaurant by name
     */
    findByName(name: string): Restaurant | null {
      const row = db.prepare('SELECT * FROM Restaurant WHERE name = ?').get(name);
      return row ? toType<Restaurant>(convertBooleanFields(row as Record<string, unknown>)) : null;
    },

    /**
     * Find restaurant with relations
     */
    findByIdWithRelations(id: string, include: RestaurantIncludeOptions = {}): RestaurantWithRelations | null {
      const restaurant = base.findById(id);
      if (!restaurant) return null;

      const result: RestaurantWithRelations = { ...restaurant };

      if (include.manager && restaurant.managerId) {
        const row = db.prepare('SELECT * FROM User WHERE id = ?').get(restaurant.managerId);
        result.manager = row ? toType<User>(convertBooleanFields(row as Record<string, unknown>)) : undefined;
      }

      if (include.departments) {
        const rows = db.prepare('SELECT * FROM Department WHERE restaurantId = ?').all(id) as Record<string, unknown>[];
        result.departments = rows.map(row => toType<Department>(convertBooleanFields(row)));
      }

      if (include.employees) {
        const rows = db.prepare('SELECT * FROM RestaurantUser WHERE restaurantId = ?').all(id) as Record<string, unknown>[];
        result.employees = rows.map(row => toType<RestaurantUser>(convertBooleanFields(row)));
      }

      if (include.positions) {
        const rows = db.prepare('SELECT * FROM Position WHERE restaurantId = ?').all(id) as Record<string, unknown>[];
        result.positions = rows.map(row => toType<Position>(convertBooleanFields(row)));
      }

      return result;
    },

    /**
     * Find all active restaurants
     */
    findAllActive(): Restaurant[] {
      return base.findMany({ where: { isActive: true } });
    },

    /**
     * Find restaurants managed by a user
     */
    findByManagerId(managerId: string): Restaurant[] {
      return base.findMany({ where: { managerId } });
    },

    /**
     * Check if user is manager of restaurant
     */
    isManager(restaurantId: string, userId: string): boolean {
      const restaurant = base.findById(restaurantId);
      return restaurant !== null && restaurant.managerId === userId;
    },

    /**
     * Set restaurant manager
     */
    setManager(restaurantId: string, managerId: string | null): Restaurant | null {
      return base.updateById(restaurantId, { managerId });
    },

    /**
     * Deactivate restaurant
     */
    deactivate(restaurantId: string): Restaurant | null {
      return base.updateById(restaurantId, { isActive: false });
    },

    /**
     * Activate restaurant
     */
    activate(restaurantId: string): Restaurant | null {
      return base.updateById(restaurantId, { isActive: true });
    },

    /**
     * Get employee count for restaurant
     */
    getEmployeeCount(restaurantId: string): number {
      const result = db.prepare(
        'SELECT COUNT(*) as count FROM RestaurantUser WHERE restaurantId = ? AND isActive = 1'
      ).get(restaurantId) as { count: number };
      return result.count;
    },

    /**
     * Get all restaurants a user has access to
     */
    findByUserId(userId: string): Restaurant[] {
      const rows = db.prepare(`
        SELECT r.* FROM Restaurant r
        INNER JOIN RestaurantUser ru ON r.id = ru.restaurantId
        WHERE ru.userId = ? AND ru.isActive = 1 AND r.isActive = 1
      `).all(userId) as Record<string, unknown>[];
      
      return rows.map(row => toType<Restaurant>(convertBooleanFields(row)));
    },
  };
}

export type RestaurantRepository = ReturnType<typeof createRestaurantRepository>;
