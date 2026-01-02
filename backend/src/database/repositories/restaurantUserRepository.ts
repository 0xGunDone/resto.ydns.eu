/**
 * RestaurantUser Repository
 * Data access layer for RestaurantUser entity (user-restaurant membership)
 * Requirements: 10.4
 */

import Database from 'better-sqlite3';
import { RestaurantUser, RestaurantUserWithRelations, User, Restaurant, Position, Department, Permission, PositionPermission } from '../types';
import { createBaseRepository } from './baseRepository';
import { convertBooleanFields } from '../typeConverters';

/**
 * Helper to safely cast converted row to type
 */
function toType<T>(row: unknown): T {
  return row as T;
}

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
export function createRestaurantUserRepository(db: Database.Database) {
  const base = createBaseRepository<RestaurantUser>({ db, tableName: 'RestaurantUser' });

  return {
    ...base,

    /**
     * Find by user and restaurant (unique constraint)
     */
    findByUserAndRestaurant(userId: string, restaurantId: string): RestaurantUser | null {
      const row = db.prepare(
        'SELECT * FROM RestaurantUser WHERE userId = ? AND restaurantId = ?'
      ).get(userId, restaurantId);
      return row ? toType<RestaurantUser>(convertBooleanFields(row as Record<string, unknown>)) : null;
    },

    /**
     * Find with relations
     */
    findByIdWithRelations(id: string, include: RestaurantUserIncludeOptions = {}): RestaurantUserWithRelations | null {
      const ru = base.findById(id);
      if (!ru) return null;

      return this.loadRelations(ru, include);
    },

    /**
     * Find by user and restaurant with relations
     */
    findByUserAndRestaurantWithRelations(
      userId: string, 
      restaurantId: string, 
      include: RestaurantUserIncludeOptions = {}
    ): RestaurantUserWithRelations | null {
      const ru = this.findByUserAndRestaurant(userId, restaurantId);
      if (!ru) return null;

      return this.loadRelations(ru, include);
    },

    /**
     * Load relations for a RestaurantUser
     */
    loadRelations(ru: RestaurantUser, include: RestaurantUserIncludeOptions): RestaurantUserWithRelations {
      const result: RestaurantUserWithRelations = { ...ru };

      if (include.user) {
        const row = db.prepare('SELECT * FROM User WHERE id = ?').get(ru.userId);
        result.user = row ? toType<User>(convertBooleanFields(row as Record<string, unknown>)) : undefined;
      }

      if (include.restaurant) {
        const row = db.prepare('SELECT * FROM Restaurant WHERE id = ?').get(ru.restaurantId);
        result.restaurant = row ? toType<Restaurant>(convertBooleanFields(row as Record<string, unknown>)) : undefined;
      }

      if (include.position) {
        const positionRow = db.prepare('SELECT * FROM Position WHERE id = ?').get(ru.positionId);
        if (positionRow) {
          const position = toType<Position>(convertBooleanFields(positionRow as Record<string, unknown>));
          
          // Check if we need to include permissions
          const includePermissions = typeof include.position === 'object' && include.position.includePermissions;
          
          if (includePermissions) {
            const permissionRows = db.prepare(`
              SELECT p.*, pp.id as ppId, pp.positionId, pp.permissionId
              FROM Permission p
              INNER JOIN PositionPermission pp ON p.id = pp.permissionId
              WHERE pp.positionId = ?
            `).all(position.id) as Record<string, unknown>[];
            
            (result as any).position = {
              ...position,
              permissions: permissionRows.map(row => ({
                id: row.ppId,
                positionId: row.positionId,
                permissionId: row.permissionId,
                permission: toType<Permission>(convertBooleanFields({
                  id: row.id,
                  code: row.code,
                  name: row.name,
                  description: row.description,
                })),
              })),
            };
          } else {
            result.position = position as any;
          }
        }
      }

      if (include.department && ru.departmentId) {
        const row = db.prepare('SELECT * FROM Department WHERE id = ?').get(ru.departmentId);
        result.department = row ? toType<Department>(convertBooleanFields(row as Record<string, unknown>)) : undefined;
      }

      return result;
    },

    /**
     * Find all memberships for a user
     */
    findByUserId(userId: string, activeOnly: boolean = true): RestaurantUser[] {
      const where = activeOnly ? { userId, isActive: true } : { userId };
      return base.findMany({ where });
    },

    /**
     * Find all memberships for a restaurant
     */
    findByRestaurantId(restaurantId: string, activeOnly: boolean = true): RestaurantUser[] {
      const where = activeOnly ? { restaurantId, isActive: true } : { restaurantId };
      return base.findMany({ where });
    },

    /**
     * Find all memberships for a restaurant with user details
     */
    findByRestaurantIdWithUsers(restaurantId: string, activeOnly: boolean = true): RestaurantUserWithRelations[] {
      const memberships = this.findByRestaurantId(restaurantId, activeOnly);
      return memberships.map(ru => this.loadRelations(ru, { user: true, position: true, department: true }));
    },

    /**
     * Check if user is member of restaurant
     */
    isMember(userId: string, restaurantId: string): boolean {
      const ru = this.findByUserAndRestaurant(userId, restaurantId);
      return ru !== null && ru.isActive;
    },

    /**
     * Get user's permissions in a restaurant
     */
    getUserPermissions(userId: string, restaurantId: string): string[] {
      const rows = db.prepare(`
        SELECT DISTINCT p.code
        FROM Permission p
        INNER JOIN PositionPermission pp ON p.id = pp.permissionId
        INNER JOIN Position pos ON pp.positionId = pos.id
        INNER JOIN RestaurantUser ru ON pos.id = ru.positionId
        WHERE ru.userId = ? AND ru.restaurantId = ? AND ru.isActive = 1
      `).all(userId, restaurantId) as { code: string }[];
      
      return rows.map(row => row.code);
    },

    /**
     * Check if user has a specific permission in a restaurant
     */
    hasPermission(userId: string, restaurantId: string, permissionCode: string): boolean {
      const result = db.prepare(`
        SELECT COUNT(*) as count
        FROM Permission p
        INNER JOIN PositionPermission pp ON p.id = pp.permissionId
        INNER JOIN Position pos ON pp.positionId = pos.id
        INNER JOIN RestaurantUser ru ON pos.id = ru.positionId
        WHERE ru.userId = ? AND ru.restaurantId = ? AND ru.isActive = 1 AND p.code = ?
      `).get(userId, restaurantId, permissionCode) as { count: number };
      
      return result.count > 0;
    },

    /**
     * Update user's position in a restaurant
     */
    updatePosition(userId: string, restaurantId: string, positionId: string): RestaurantUser | null {
      const ru = this.findByUserAndRestaurant(userId, restaurantId);
      if (!ru) return null;
      return base.updateById(ru.id, { positionId });
    },

    /**
     * Update user's department in a restaurant
     */
    updateDepartment(userId: string, restaurantId: string, departmentId: string | null): RestaurantUser | null {
      const ru = this.findByUserAndRestaurant(userId, restaurantId);
      if (!ru) return null;
      return base.updateById(ru.id, { departmentId });
    },

    /**
     * Deactivate membership
     */
    deactivate(userId: string, restaurantId: string): RestaurantUser | null {
      const ru = this.findByUserAndRestaurant(userId, restaurantId);
      if (!ru) return null;
      return base.updateById(ru.id, { isActive: false });
    },

    /**
     * Activate membership
     */
    activate(userId: string, restaurantId: string): RestaurantUser | null {
      const ru = this.findByUserAndRestaurant(userId, restaurantId);
      if (!ru) return null;
      return base.updateById(ru.id, { isActive: true });
    },

    /**
     * Create or reactivate membership
     */
    createOrReactivate(data: {
      userId: string;
      restaurantId: string;
      positionId: string;
      departmentId?: string | null;
      hourlyRate?: number | null;
      hireDate?: string | null;
    }): RestaurantUser {
      const existing = this.findByUserAndRestaurant(data.userId, data.restaurantId);
      
      if (existing) {
        // Reactivate and update
        return base.updateById(existing.id, {
          isActive: true,
          positionId: data.positionId,
          departmentId: data.departmentId ?? existing.departmentId,
          hourlyRate: data.hourlyRate ?? existing.hourlyRate,
          hireDate: data.hireDate ?? existing.hireDate,
        }) as RestaurantUser;
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
