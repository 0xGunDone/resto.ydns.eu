/**
 * RestaurantUser Repository (PostgreSQL)
 * Data access layer for RestaurantUser entity (user-restaurant membership)
 * Requirements: 10.4
 */

import { pgPool } from '../../utils/db';
import { RestaurantUser, RestaurantUserWithRelations, User, Restaurant, Position, Department, Permission } from '../types';
import { createBaseRepository } from './baseRepository';

/**
 * Include options for restaurant user queries
 */
export interface RestaurantUserIncludeOptions {
  user?: boolean;
  restaurant?: boolean;
  position?: boolean | { includePermissions?: boolean };
  department?: boolean;
}

/**
 * Create a RestaurantUser repository
 */
export function createRestaurantUserRepository() {
  const base = createBaseRepository<RestaurantUser>({ tableName: 'RestaurantUser' });

  /**
   * Load relations for a RestaurantUser
   */
  async function loadRelations(ru: RestaurantUser, include: RestaurantUserIncludeOptions): Promise<RestaurantUserWithRelations> {
    const result: RestaurantUserWithRelations = { ...ru };

    if (include.user) {
      const row = await pgPool.query('SELECT * FROM "User" WHERE "id" = $1', [ru.userId]);
      result.user = row.rows[0] as User | undefined;
    }

    if (include.restaurant) {
      const row = await pgPool.query('SELECT * FROM "Restaurant" WHERE "id" = $1', [ru.restaurantId]);
      result.restaurant = row.rows[0] as Restaurant | undefined;
    }

    if (include.position) {
      const positionRow = await pgPool.query('SELECT * FROM "Position" WHERE "id" = $1', [ru.positionId]);
      if (positionRow.rows[0]) {
        const position = positionRow.rows[0] as Position;
        
        // Check if we need to include permissions
        const includePermissions = typeof include.position === 'object' && include.position.includePermissions;
        
        if (includePermissions) {
          const permissionRows = await pgPool.query(`
            SELECT p.*, pp."id" as "ppId", pp."positionId", pp."permissionId"
            FROM "Permission" p
            INNER JOIN "PositionPermission" pp ON p."id" = pp."permissionId"
            WHERE pp."positionId" = $1
          `, [position.id]);
          
          (result as any).position = {
            ...position,
            permissions: permissionRows.rows.map(row => ({
              id: row.ppId,
              positionId: row.positionId,
              permissionId: row.permissionId,
              permission: {
                id: row.id,
                code: row.code,
                name: row.name,
                description: row.description,
              } as Permission,
            })),
          };
        } else {
          result.position = position as any;
        }
      }
    }

    if (include.department && ru.departmentId) {
      const row = await pgPool.query('SELECT * FROM "Department" WHERE "id" = $1', [ru.departmentId]);
      result.department = row.rows[0] as Department | undefined;
    }

    return result;
  }

  return {
    ...base,

    /**
     * Find by user and restaurant (unique constraint)
     */
    async findByUserAndRestaurant(userId: string, restaurantId: string): Promise<RestaurantUser | null> {
      const result = await pgPool.query(
        'SELECT * FROM "RestaurantUser" WHERE "userId" = $1 AND "restaurantId" = $2',
        [userId, restaurantId]
      );
      return result.rows[0] || null;
    },

    /**
     * Find with relations
     */
    async findByIdWithRelations(id: string, include: RestaurantUserIncludeOptions = {}): Promise<RestaurantUserWithRelations | null> {
      const ru = await base.findById(id);
      if (!ru) return null;

      return loadRelations(ru, include);
    },

    /**
     * Find by user and restaurant with relations
     */
    async findByUserAndRestaurantWithRelations(
      userId: string, 
      restaurantId: string, 
      include: RestaurantUserIncludeOptions = {}
    ): Promise<RestaurantUserWithRelations | null> {
      const ru = await this.findByUserAndRestaurant(userId, restaurantId);
      if (!ru) return null;

      return loadRelations(ru, include);
    },

    /**
     * Load relations for a RestaurantUser
     */
    loadRelations,

    /**
     * Find all memberships for a user
     */
    async findByUserId(userId: string, activeOnly: boolean = true): Promise<RestaurantUser[]> {
      const where = activeOnly ? { userId, isActive: true } : { userId };
      return base.findMany({ where });
    },

    /**
     * Find all memberships for a restaurant
     */
    async findByRestaurantId(restaurantId: string, activeOnly: boolean = true): Promise<RestaurantUser[]> {
      const where = activeOnly ? { restaurantId, isActive: true } : { restaurantId };
      return base.findMany({ where });
    },

    /**
     * Find all memberships for a restaurant with user details
     */
    async findByRestaurantIdWithUsers(restaurantId: string, activeOnly: boolean = true): Promise<RestaurantUserWithRelations[]> {
      const memberships = await this.findByRestaurantId(restaurantId, activeOnly);
      return Promise.all(memberships.map(ru => loadRelations(ru, { user: true, position: true, department: true })));
    },

    /**
     * Check if user is member of restaurant
     */
    async isMember(userId: string, restaurantId: string): Promise<boolean> {
      const ru = await this.findByUserAndRestaurant(userId, restaurantId);
      return ru !== null && ru.isActive;
    },

    /**
     * Get user's permissions in a restaurant
     */
    async getUserPermissions(userId: string, restaurantId: string): Promise<string[]> {
      const result = await pgPool.query(`
        SELECT DISTINCT p."code"
        FROM "Permission" p
        INNER JOIN "PositionPermission" pp ON p."id" = pp."permissionId"
        INNER JOIN "Position" pos ON pp."positionId" = pos."id"
        INNER JOIN "RestaurantUser" ru ON pos."id" = ru."positionId"
        WHERE ru."userId" = $1 AND ru."restaurantId" = $2 AND ru."isActive" = true
      `, [userId, restaurantId]);
      
      return result.rows.map(row => row.code);
    },

    /**
     * Check if user has a specific permission in a restaurant
     */
    async hasPermission(userId: string, restaurantId: string, permissionCode: string): Promise<boolean> {
      const result = await pgPool.query(`
        SELECT COUNT(*) as count
        FROM "Permission" p
        INNER JOIN "PositionPermission" pp ON p."id" = pp."permissionId"
        INNER JOIN "Position" pos ON pp."positionId" = pos."id"
        INNER JOIN "RestaurantUser" ru ON pos."id" = ru."positionId"
        WHERE ru."userId" = $1 AND ru."restaurantId" = $2 AND ru."isActive" = true AND p."code" = $3
      `, [userId, restaurantId, permissionCode]);
      
      return parseInt(result.rows[0].count, 10) > 0;
    },

    /**
     * Update user's position in a restaurant
     */
    async updatePosition(userId: string, restaurantId: string, positionId: string): Promise<RestaurantUser | null> {
      const ru = await this.findByUserAndRestaurant(userId, restaurantId);
      if (!ru) return null;
      return base.updateById(ru.id, { positionId });
    },

    /**
     * Update user's department in a restaurant
     */
    async updateDepartment(userId: string, restaurantId: string, departmentId: string | null): Promise<RestaurantUser | null> {
      const ru = await this.findByUserAndRestaurant(userId, restaurantId);
      if (!ru) return null;
      return base.updateById(ru.id, { departmentId });
    },

    /**
     * Deactivate membership
     */
    async deactivate(userId: string, restaurantId: string): Promise<RestaurantUser | null> {
      const ru = await this.findByUserAndRestaurant(userId, restaurantId);
      if (!ru) return null;
      return base.updateById(ru.id, { isActive: false });
    },

    /**
     * Activate membership
     */
    async activate(userId: string, restaurantId: string): Promise<RestaurantUser | null> {
      const ru = await this.findByUserAndRestaurant(userId, restaurantId);
      if (!ru) return null;
      return base.updateById(ru.id, { isActive: true });
    },

    /**
     * Create or reactivate membership
     */
    async createOrReactivate(data: {
      userId: string;
      restaurantId: string;
      positionId: string;
      departmentId?: string | null;
      hourlyRate?: number | null;
      hireDate?: string | null;
    }): Promise<RestaurantUser> {
      const existing = await this.findByUserAndRestaurant(data.userId, data.restaurantId);
      
      if (existing) {
        // Reactivate and update
        return base.updateById(existing.id, {
          isActive: true,
          positionId: data.positionId,
          departmentId: data.departmentId ?? existing.departmentId,
          hourlyRate: data.hourlyRate ?? existing.hourlyRate,
          hireDate: data.hireDate ?? existing.hireDate,
        }) as Promise<RestaurantUser>;
      }
      
      // Create new
      return base.create({
        userId: data.userId,
        restaurantId: data.restaurantId,
        positionId: data.positionId,
        departmentId: data.departmentId ?? null,
        hourlyRate: data.hourlyRate ?? null,
        hireDate: data.hireDate ?? null,
        isActive: true,
      } as any);
    },
  };
}

export type RestaurantUserRepository = ReturnType<typeof createRestaurantUserRepository>;
