/**
 * Restaurant Repository (PostgreSQL)
 * Data access layer for Restaurant entity
 * Requirements: 10.4
 */

import { pgPool } from '../../utils/db';
import { Restaurant, RestaurantWithRelations, User, Department, RestaurantUser, Position } from '../types';
import { createBaseRepository } from './baseRepository';

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
export function createRestaurantRepository() {
  const base = createBaseRepository<Restaurant>({ tableName: 'Restaurant' });

  return {
    ...base,

    /**
     * Find restaurant by name
     */
    async findByName(name: string): Promise<Restaurant | null> {
      const result = await pgPool.query('SELECT * FROM "Restaurant" WHERE "name" = $1', [name]);
      return result.rows[0] || null;
    },

    /**
     * Find restaurant with relations
     */
    async findByIdWithRelations(id: string, include: RestaurantIncludeOptions = {}): Promise<RestaurantWithRelations | null> {
      const restaurant = await base.findById(id);
      if (!restaurant) return null;

      const result: RestaurantWithRelations = { ...restaurant };

      if (include.manager && restaurant.managerId) {
        const row = await pgPool.query('SELECT * FROM "User" WHERE "id" = $1', [restaurant.managerId]);
        result.manager = row.rows[0] as User | undefined;
      }

      if (include.departments) {
        const rows = await pgPool.query('SELECT * FROM "Department" WHERE "restaurantId" = $1', [id]);
        result.departments = rows.rows as Department[];
      }

      if (include.employees) {
        const rows = await pgPool.query('SELECT * FROM "RestaurantUser" WHERE "restaurantId" = $1', [id]);
        result.employees = rows.rows as RestaurantUser[];
      }

      if (include.positions) {
        const rows = await pgPool.query('SELECT * FROM "Position" WHERE "restaurantId" = $1', [id]);
        result.positions = rows.rows as Position[];
      }

      return result;
    },

    /**
     * Find all active restaurants
     */
    async findAllActive(): Promise<Restaurant[]> {
      return base.findMany({ where: { isActive: true } });
    },

    /**
     * Find restaurants managed by a user
     */
    async findByManagerId(managerId: string): Promise<Restaurant[]> {
      return base.findMany({ where: { managerId } });
    },

    /**
     * Check if user is manager of restaurant
     */
    async isManager(restaurantId: string, userId: string): Promise<boolean> {
      const restaurant = await base.findById(restaurantId);
      return restaurant !== null && restaurant.managerId === userId;
    },

    /**
     * Set restaurant manager
     */
    async setManager(restaurantId: string, managerId: string | null): Promise<Restaurant | null> {
      return base.updateById(restaurantId, { managerId });
    },

    /**
     * Deactivate restaurant
     */
    async deactivate(restaurantId: string): Promise<Restaurant | null> {
      return base.updateById(restaurantId, { isActive: false });
    },

    /**
     * Activate restaurant
     */
    async activate(restaurantId: string): Promise<Restaurant | null> {
      return base.updateById(restaurantId, { isActive: true });
    },

    /**
     * Get employee count for restaurant
     */
    async getEmployeeCount(restaurantId: string): Promise<number> {
      const result = await pgPool.query(
        'SELECT COUNT(*) as count FROM "RestaurantUser" WHERE "restaurantId" = $1 AND "isActive" = true',
        [restaurantId]
      );
      return parseInt(result.rows[0].count, 10);
    },

    /**
     * Get all restaurants a user has access to
     */
    async findByUserId(userId: string): Promise<Restaurant[]> {
      const result = await pgPool.query(`
        SELECT r.* FROM "Restaurant" r
        INNER JOIN "RestaurantUser" ru ON r."id" = ru."restaurantId"
        WHERE ru."userId" = $1 AND ru."isActive" = true AND r."isActive" = true
      `, [userId]);
      
      return result.rows as Restaurant[];
    },
  };
}

export type RestaurantRepository = ReturnType<typeof createRestaurantRepository>;
