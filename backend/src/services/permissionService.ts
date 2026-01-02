/**
 * Permission Service
 * Centralized permission checking with logging
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.6
 */

import { logger } from './loggerService';
import { PERMISSIONS, PermissionCode, MANAGER_AUTO_PERMISSIONS, DEFAULT_EMPLOYEE_PERMISSIONS } from '../utils/permissions';

// Re-export for convenience
export { PERMISSIONS, PermissionCode, MANAGER_AUTO_PERMISSIONS, DEFAULT_EMPLOYEE_PERMISSIONS };

/**
 * Result of a permission check
 */
export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  permissions?: PermissionCode[];
}

/**
 * Context for permission checks
 */
export interface PermissionContext {
  userId: string;
  restaurantId?: string;
  targetUserId?: string;
}

/**
 * Database interface for permission service
 * This allows for dependency injection and easier testing
 */
export interface PermissionServiceDatabase {
  getUserRole(userId: string): Promise<string | null>;
  getRestaurantManagerId(restaurantId: string): Promise<string | null>;
  isRestaurantMember(userId: string, restaurantId: string): Promise<boolean>;
  getUserPositionPermissions(userId: string, restaurantId: string): Promise<string[]>;
}

/**
 * Permission Service interface
 */
export interface IPermissionService {
  checkPermission(ctx: PermissionContext, permission: PermissionCode): Promise<PermissionCheckResult>;
  checkAnyPermission(ctx: PermissionContext, permissions: PermissionCode[]): Promise<PermissionCheckResult>;
  getUserPermissions(userId: string, restaurantId: string): Promise<PermissionCode[]>;
  checkRestaurantAccess(userId: string, restaurantId: string): Promise<boolean>;
  isDataOwner(userId: string, targetUserId: string): boolean;
}


/**
 * Create a Permission Service instance
 */
export function createPermissionService(db: PermissionServiceDatabase): IPermissionService {
  /**
   * Check if user has OWNER or ADMIN role
   */
  async function isOwnerOrAdmin(userId: string): Promise<boolean> {
    const role = await db.getUserRole(userId);
    return role === 'OWNER' || role === 'ADMIN';
  }

  /**
   * Check if user is manager of the restaurant
   */
  async function isRestaurantManager(userId: string, restaurantId: string): Promise<boolean> {
    const managerId = await db.getRestaurantManagerId(restaurantId);
    return managerId === userId;
  }

  /**
   * Check a single permission
   * Requirements: 1.1, 1.2, 1.3, 1.4, 1.6
   */
  async function checkPermission(
    ctx: PermissionContext,
    permission: PermissionCode
  ): Promise<PermissionCheckResult> {
    const { userId, restaurantId } = ctx;

    logger.debug('Permission check started', {
      userId,
      restaurantId,
      action: `check:${permission}`,
    });

    // Requirement 1.3: OWNER/ADMIN bypass - grant all permissions
    if (await isOwnerOrAdmin(userId)) {
      logger.debug('Permission granted: OWNER/ADMIN bypass', {
        userId,
        restaurantId,
        action: `granted:${permission}`,
      });
      return { allowed: true, reason: 'OWNER/ADMIN role grants all permissions' };
    }

    // If no restaurantId provided, only VIEW_RESTAURANTS is allowed for non-admin users
    if (!restaurantId) {
      if (permission === PERMISSIONS.VIEW_RESTAURANTS) {
        logger.debug('Permission granted: VIEW_RESTAURANTS without restaurant context', {
          userId,
          action: `granted:${permission}`,
        });
        return { allowed: true, reason: 'VIEW_RESTAURANTS allowed without restaurant context' };
      }
      logger.debug('Permission denied: no restaurant context', {
        userId,
        action: `denied:${permission}`,
      });
      return { allowed: false, reason: 'Restaurant context required for this permission' };
    }

    // Requirement 1.2: Check restaurant membership first
    const isMember = await db.isRestaurantMember(userId, restaurantId);
    
    // Requirement 1.4: Check if user is restaurant manager
    const isManager = await isRestaurantManager(userId, restaurantId);

    // If user is manager, grant MANAGER_AUTO_PERMISSIONS
    if (isManager) {
      if (MANAGER_AUTO_PERMISSIONS.includes(permission) || permission === PERMISSIONS.VIEW_RESTAURANTS) {
        logger.debug('Permission granted: restaurant manager', {
          userId,
          restaurantId,
          action: `granted:${permission}`,
        });
        return { allowed: true, reason: 'Restaurant manager has this permission' };
      }
    }

    // If not a member and not a manager, deny access
    if (!isMember && !isManager) {
      // VIEW_RESTAURANTS is special - allows seeing the list but not accessing specific restaurant
      if (permission === PERMISSIONS.VIEW_RESTAURANTS) {
        logger.debug('Permission granted: VIEW_RESTAURANTS for non-member', {
          userId,
          restaurantId,
          action: `granted:${permission}`,
        });
        return { allowed: true, reason: 'VIEW_RESTAURANTS allowed for all users' };
      }
      
      logger.debug('Permission denied: not a restaurant member', {
        userId,
        restaurantId,
        action: `denied:${permission}`,
      });
      return { allowed: false, reason: 'User is not a member of this restaurant' };
    }

    // Get position permissions
    const positionPermissions = await db.getUserPositionPermissions(userId, restaurantId);

    // Check if permission is in position permissions
    if (positionPermissions.includes(permission)) {
      logger.debug('Permission granted: position permission', {
        userId,
        restaurantId,
        action: `granted:${permission}`,
      });
      return { allowed: true, reason: 'Permission granted by position' };
    }

    // Check default employee permissions
    if (DEFAULT_EMPLOYEE_PERMISSIONS.includes(permission)) {
      logger.debug('Permission granted: default employee permission', {
        userId,
        restaurantId,
        action: `granted:${permission}`,
      });
      return { allowed: true, reason: 'Default employee permission' };
    }

    // Requirement 1.6: Log denial
    logger.debug('Permission denied: insufficient permissions', {
      userId,
      restaurantId,
      action: `denied:${permission}`,
    });
    return { allowed: false, reason: 'Insufficient permissions' };
  }

  /**
   * Check if user has any of the specified permissions
   */
  async function checkAnyPermission(
    ctx: PermissionContext,
    permissions: PermissionCode[]
  ): Promise<PermissionCheckResult> {
    for (const permission of permissions) {
      const result = await checkPermission(ctx, permission);
      if (result.allowed) {
        return result;
      }
    }
    return { allowed: false, reason: 'None of the required permissions granted' };
  }

  /**
   * Get all permissions for a user in a restaurant
   */
  async function getUserPermissions(
    userId: string,
    restaurantId: string
  ): Promise<PermissionCode[]> {
    // OWNER/ADMIN get all permissions
    if (await isOwnerOrAdmin(userId)) {
      return Object.values(PERMISSIONS) as PermissionCode[];
    }

    // Manager gets MANAGER_AUTO_PERMISSIONS
    if (await isRestaurantManager(userId, restaurantId)) {
      return [...MANAGER_AUTO_PERMISSIONS, PERMISSIONS.VIEW_RESTAURANTS];
    }

    // Check membership
    const isMember = await db.isRestaurantMember(userId, restaurantId);
    if (!isMember) {
      return DEFAULT_EMPLOYEE_PERMISSIONS;
    }

    // Get position permissions and merge with defaults
    const positionPermissions = await db.getUserPositionPermissions(userId, restaurantId);
    const allPermissions = new Set([
      ...positionPermissions,
      ...DEFAULT_EMPLOYEE_PERMISSIONS,
    ]);

    return Array.from(allPermissions) as PermissionCode[];
  }

  /**
   * Check if user has access to a restaurant
   */
  async function checkRestaurantAccess(
    userId: string,
    restaurantId: string
  ): Promise<boolean> {
    // OWNER/ADMIN have access to all restaurants
    if (await isOwnerOrAdmin(userId)) {
      return true;
    }

    // Manager has access to their restaurant
    if (await isRestaurantManager(userId, restaurantId)) {
      return true;
    }

    // Check membership
    return db.isRestaurantMember(userId, restaurantId);
  }

  /**
   * Check if user is the owner of the data (same user)
   */
  function isDataOwner(userId: string, targetUserId: string): boolean {
    return userId === targetUserId;
  }

  return {
    checkPermission,
    checkAnyPermission,
    getUserPermissions,
    checkRestaurantAccess,
    isDataOwner,
  };
}


/**
 * Create database adapter from dbClient
 * This wraps the existing database client to match PermissionServiceDatabase interface
 */
export function createDatabaseAdapter(dbClient: any): PermissionServiceDatabase {
  return {
    async getUserRole(userId: string): Promise<string | null> {
      const user = await dbClient.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });
      return user?.role ?? null;
    },

    async getRestaurantManagerId(restaurantId: string): Promise<string | null> {
      const restaurant = await dbClient.restaurant.findUnique({
        where: { id: restaurantId },
        select: { managerId: true },
      });
      return restaurant?.managerId ?? null;
    },

    async isRestaurantMember(userId: string, restaurantId: string): Promise<boolean> {
      const membership = await dbClient.restaurantUser.findFirst({
        where: {
          userId,
          restaurantId,
          isActive: true,
        },
      });
      return membership !== null;
    },

    async getUserPositionPermissions(userId: string, restaurantId: string): Promise<string[]> {
      const restaurantUser = await dbClient.restaurantUser.findFirst({
        where: {
          userId,
          restaurantId,
          isActive: true,
        },
        include: {
          position: {
            include: {
              permissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      });

      if (!restaurantUser?.position?.permissions) {
        return [];
      }

      return restaurantUser.position.permissions.map(
        (pp: any) => pp.permission.code
      );
    },
  };
}

// Default instance using the main database client
// This will be initialized when the module is imported
let defaultPermissionService: IPermissionService | null = null;

/**
 * Get the default permission service instance
 * Lazily initializes with the main database client
 */
export function getPermissionService(): IPermissionService {
  if (!defaultPermissionService) {
    // Lazy import to avoid circular dependencies
    const dbClient = require('../utils/db').default;
    const dbAdapter = createDatabaseAdapter(dbClient);
    defaultPermissionService = createPermissionService(dbAdapter);
  }
  return defaultPermissionService;
}

/**
 * Set a custom permission service (useful for testing)
 */
export function setPermissionService(service: IPermissionService): void {
  defaultPermissionService = service;
}

/**
 * Reset the permission service to default (useful for testing)
 */
export function resetPermissionService(): void {
  defaultPermissionService = null;
}
