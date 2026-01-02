/**
 * Property-Based Tests for Permission Service
 * Tests for Properties 1, 2, 3, 4, 8 from the design document
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  createPermissionService,
  PermissionServiceDatabase,
  PERMISSIONS,
  MANAGER_AUTO_PERMISSIONS,
  DEFAULT_EMPLOYEE_PERMISSIONS,
  PermissionCode,
} from '../../src/services/permissionService';

/**
 * Mock database for testing
 */
function createMockDatabase(config: {
  userRoles?: Map<string, string>;
  restaurantManagers?: Map<string, string>;
  memberships?: Set<string>; // "userId:restaurantId"
  positionPermissions?: Map<string, string[]>; // "userId:restaurantId" -> permissions
}): PermissionServiceDatabase {
  const {
    userRoles = new Map(),
    restaurantManagers = new Map(),
    memberships = new Set(),
    positionPermissions = new Map(),
  } = config;

  return {
    async getUserRole(userId: string): Promise<string | null> {
      return userRoles.get(userId) ?? null;
    },
    async getRestaurantManagerId(restaurantId: string): Promise<string | null> {
      return restaurantManagers.get(restaurantId) ?? null;
    },
    async isRestaurantMember(userId: string, restaurantId: string): Promise<boolean> {
      return memberships.has(`${userId}:${restaurantId}`);
    },
    async getUserPositionPermissions(userId: string, restaurantId: string): Promise<string[]> {
      return positionPermissions.get(`${userId}:${restaurantId}`) ?? [];
    },
  };
}

// Arbitrary generators
const userIdArb = fc.uuid();
const restaurantIdArb = fc.uuid();
const allPermissions = Object.values(PERMISSIONS) as PermissionCode[];
const permissionArb = fc.constantFrom(...allPermissions);

describe('Permission Service Properties', () => {
  /**
   * **Feature: project-refactoring, Property 1: OWNER/ADMIN Permission Bypass**
   * **Validates: Requirements 1.3**
   * 
   * For any user with OWNER or ADMIN role, and for any permission code,
   * the permission check SHALL return allowed: true.
   */
  describe('Property 1: OWNER/ADMIN Permission Bypass', () => {
    it('should grant all permissions to OWNER users', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          restaurantIdArb,
          permissionArb,
          async (userId, restaurantId, permission) => {
            const db = createMockDatabase({
              userRoles: new Map([[userId, 'OWNER']]),
            });
            const service = createPermissionService(db);

            const result = await service.checkPermission(
              { userId, restaurantId },
              permission
            );

            expect(result.allowed).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should grant all permissions to ADMIN users', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          restaurantIdArb,
          permissionArb,
          async (userId, restaurantId, permission) => {
            const db = createMockDatabase({
              userRoles: new Map([[userId, 'ADMIN']]),
            });
            const service = createPermissionService(db);

            const result = await service.checkPermission(
              { userId, restaurantId },
              permission
            );

            expect(result.allowed).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should grant all permissions to OWNER/ADMIN regardless of restaurant membership', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          restaurantIdArb,
          permissionArb,
          fc.constantFrom('OWNER', 'ADMIN'),
          async (userId, restaurantId, permission, role) => {
            // User is NOT a member of the restaurant, but is OWNER/ADMIN
            const db = createMockDatabase({
              userRoles: new Map([[userId, role]]),
              memberships: new Set(), // Empty - no memberships
            });
            const service = createPermissionService(db);

            const result = await service.checkPermission(
              { userId, restaurantId },
              permission
            );

            expect(result.allowed).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  /**
   * **Feature: project-refactoring, Property 2: Restaurant Membership Prerequisite**
   * **Validates: Requirements 1.2**
   * 
   * For any user without OWNER/ADMIN role, and for any restaurantId where the user
   * is not a member (no active RestaurantUser record), permission checks SHALL return
   * allowed: false regardless of the specific permission requested.
   */
  describe('Property 2: Restaurant Membership Prerequisite', () => {
    it('should deny permissions to non-members without OWNER/ADMIN role', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          restaurantIdArb,
          permissionArb,
          fc.constantFrom('MANAGER', 'EMPLOYEE'),
          async (userId, restaurantId, permission, role) => {
            // Skip VIEW_RESTAURANTS as it's allowed for all users
            if (permission === PERMISSIONS.VIEW_RESTAURANTS) {
              return;
            }

            const db = createMockDatabase({
              userRoles: new Map([[userId, role]]),
              memberships: new Set(), // Not a member
              restaurantManagers: new Map(), // Not a manager
            });
            const service = createPermissionService(db);

            const result = await service.checkPermission(
              { userId, restaurantId },
              permission
            );

            expect(result.allowed).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should allow VIEW_RESTAURANTS for non-members', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          restaurantIdArb,
          fc.constantFrom('MANAGER', 'EMPLOYEE'),
          async (userId, restaurantId, role) => {
            const db = createMockDatabase({
              userRoles: new Map([[userId, role]]),
              memberships: new Set(), // Not a member
            });
            const service = createPermissionService(db);

            const result = await service.checkPermission(
              { userId, restaurantId },
              PERMISSIONS.VIEW_RESTAURANTS
            );

            expect(result.allowed).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: project-refactoring, Property 3: Manager Auto-Permissions**
   * **Validates: Requirements 1.4**
   * 
   * For any user who is the manager of a restaurant (restaurant.managerId === userId),
   * and for any permission in MANAGER_AUTO_PERMISSIONS, the permission check for that
   * restaurant SHALL return allowed: true.
   */
  describe('Property 3: Manager Auto-Permissions', () => {
    const managerPermissionArb = fc.constantFrom(...MANAGER_AUTO_PERMISSIONS);

    it('should grant MANAGER_AUTO_PERMISSIONS to restaurant managers', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          restaurantIdArb,
          managerPermissionArb,
          async (userId, restaurantId, permission) => {
            const db = createMockDatabase({
              userRoles: new Map([[userId, 'MANAGER']]),
              restaurantManagers: new Map([[restaurantId, userId]]), // User is manager
              memberships: new Set(), // Not necessarily a member
            });
            const service = createPermissionService(db);

            const result = await service.checkPermission(
              { userId, restaurantId },
              permission
            );

            expect(result.allowed).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should grant VIEW_RESTAURANTS to restaurant managers', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          restaurantIdArb,
          async (userId, restaurantId) => {
            const db = createMockDatabase({
              userRoles: new Map([[userId, 'MANAGER']]),
              restaurantManagers: new Map([[restaurantId, userId]]),
            });
            const service = createPermissionService(db);

            const result = await service.checkPermission(
              { userId, restaurantId },
              PERMISSIONS.VIEW_RESTAURANTS
            );

            expect(result.allowed).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not grant manager permissions to non-managers', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          fc.uuid(), // Different user as manager
          restaurantIdArb,
          managerPermissionArb,
          async (userId, managerId, restaurantId, permission) => {
            // Ensure userId !== managerId
            if (userId === managerId) {
              return;
            }

            const db = createMockDatabase({
              userRoles: new Map([[userId, 'EMPLOYEE']]),
              restaurantManagers: new Map([[restaurantId, managerId]]), // Different user is manager
              memberships: new Set(), // Not a member
            });
            const service = createPermissionService(db);

            const result = await service.checkPermission(
              { userId, restaurantId },
              permission
            );

            expect(result.allowed).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  /**
   * **Feature: project-refactoring, Property 4: Permission Denial Response Format**
   * **Validates: Requirements 1.5, 8.6**
   * 
   * For any API request that fails permission check, the response SHALL have
   * status 403 and body containing { status: 403, code: string, message: string, timestamp: string }.
   * 
   * Note: This property tests the service-level denial format.
   * The HTTP response format is tested in the middleware tests.
   */
  describe('Property 4: Permission Denial Response Format', () => {
    it('should return consistent denial format with reason', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          restaurantIdArb,
          permissionArb,
          async (userId, restaurantId, permission) => {
            // Skip VIEW_RESTAURANTS as it's always allowed
            if (permission === PERMISSIONS.VIEW_RESTAURANTS) {
              return;
            }

            const db = createMockDatabase({
              userRoles: new Map([[userId, 'EMPLOYEE']]),
              memberships: new Set(), // Not a member
              restaurantManagers: new Map(), // Not a manager
            });
            const service = createPermissionService(db);

            const result = await service.checkPermission(
              { userId, restaurantId },
              permission
            );

            // Verify denial format
            expect(result.allowed).toBe(false);
            expect(typeof result.reason).toBe('string');
            expect(result.reason!.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return consistent approval format with reason', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          restaurantIdArb,
          permissionArb,
          async (userId, restaurantId, permission) => {
            const db = createMockDatabase({
              userRoles: new Map([[userId, 'OWNER']]),
            });
            const service = createPermissionService(db);

            const result = await service.checkPermission(
              { userId, restaurantId },
              permission
            );

            // Verify approval format
            expect(result.allowed).toBe(true);
            expect(typeof result.reason).toBe('string');
            expect(result.reason!.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Additional property: getUserPermissions returns correct permissions
   */
  describe('getUserPermissions', () => {
    it('should return all permissions for OWNER/ADMIN', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          restaurantIdArb,
          fc.constantFrom('OWNER', 'ADMIN'),
          async (userId, restaurantId, role) => {
            const db = createMockDatabase({
              userRoles: new Map([[userId, role]]),
            });
            const service = createPermissionService(db);

            const permissions = await service.getUserPermissions(userId, restaurantId);

            // Should have all permissions
            expect(permissions.length).toBe(allPermissions.length);
            for (const perm of allPermissions) {
              expect(permissions).toContain(perm);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return MANAGER_AUTO_PERMISSIONS for restaurant managers', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          restaurantIdArb,
          async (userId, restaurantId) => {
            const db = createMockDatabase({
              userRoles: new Map([[userId, 'MANAGER']]),
              restaurantManagers: new Map([[restaurantId, userId]]),
            });
            const service = createPermissionService(db);

            const permissions = await service.getUserPermissions(userId, restaurantId);

            // Should have all manager auto permissions
            for (const perm of MANAGER_AUTO_PERMISSIONS) {
              expect(permissions).toContain(perm);
            }
            // Should also have VIEW_RESTAURANTS
            expect(permissions).toContain(PERMISSIONS.VIEW_RESTAURANTS);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Additional property: checkRestaurantAccess
   */
  describe('checkRestaurantAccess', () => {
    it('should grant access to OWNER/ADMIN for any restaurant', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          restaurantIdArb,
          fc.constantFrom('OWNER', 'ADMIN'),
          async (userId, restaurantId, role) => {
            const db = createMockDatabase({
              userRoles: new Map([[userId, role]]),
            });
            const service = createPermissionService(db);

            const hasAccess = await service.checkRestaurantAccess(userId, restaurantId);

            expect(hasAccess).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should grant access to restaurant managers', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          restaurantIdArb,
          async (userId, restaurantId) => {
            const db = createMockDatabase({
              userRoles: new Map([[userId, 'MANAGER']]),
              restaurantManagers: new Map([[restaurantId, userId]]),
            });
            const service = createPermissionService(db);

            const hasAccess = await service.checkRestaurantAccess(userId, restaurantId);

            expect(hasAccess).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should grant access to restaurant members', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          restaurantIdArb,
          async (userId, restaurantId) => {
            const db = createMockDatabase({
              userRoles: new Map([[userId, 'EMPLOYEE']]),
              memberships: new Set([`${userId}:${restaurantId}`]),
            });
            const service = createPermissionService(db);

            const hasAccess = await service.checkRestaurantAccess(userId, restaurantId);

            expect(hasAccess).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should deny access to non-members without special roles', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          restaurantIdArb,
          async (userId, restaurantId) => {
            const db = createMockDatabase({
              userRoles: new Map([[userId, 'EMPLOYEE']]),
              memberships: new Set(), // Not a member
              restaurantManagers: new Map(), // Not a manager
            });
            const service = createPermissionService(db);

            const hasAccess = await service.checkRestaurantAccess(userId, restaurantId);

            expect(hasAccess).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Additional property: isDataOwner
   */
  describe('isDataOwner', () => {
    it('should return true when userId equals targetUserId', () => {
      fc.assert(
        fc.property(userIdArb, (userId) => {
          const db = createMockDatabase({});
          const service = createPermissionService(db);

          expect(service.isDataOwner(userId, userId)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('should return false when userId differs from targetUserId', () => {
      fc.assert(
        fc.property(userIdArb, userIdArb, (userId, targetUserId) => {
          if (userId === targetUserId) {
            return; // Skip when they happen to be equal
          }

          const db = createMockDatabase({});
          const service = createPermissionService(db);

          expect(service.isDataOwner(userId, targetUserId)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: platform-upgrade, Property 8: New permissions exist**
   * **Validates: Requirements 6.1, 6.2, 7.1, 7.2, 8.1, 8.2**
   * 
   * For all new permission codes (REQUEST_SHIFT_SWAP, APPROVE_SHIFT_SWAP, 
   * SEND_ANNOUNCEMENTS, VIEW_ANNOUNCEMENTS, VIEW_REPORTS, EXPORT_REPORTS),
   * they SHALL exist in PERMISSIONS constant.
   */
  describe('Property 8: New permissions exist', () => {
    const newPermissions = [
      'REQUEST_SHIFT_SWAP',
      'APPROVE_SHIFT_SWAP',
      'SEND_ANNOUNCEMENTS',
      'VIEW_ANNOUNCEMENTS',
      'VIEW_REPORTS',
      'EXPORT_REPORTS',
    ] as const;

    it('should have all new permission codes in PERMISSIONS constant', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...newPermissions),
          (permissionKey) => {
            // Verify the permission exists in PERMISSIONS
            expect(PERMISSIONS).toHaveProperty(permissionKey);
            // Verify the value matches the key (convention)
            expect(PERMISSIONS[permissionKey as keyof typeof PERMISSIONS]).toBe(permissionKey);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should include REQUEST_SHIFT_SWAP in DEFAULT_EMPLOYEE_PERMISSIONS', () => {
      expect(DEFAULT_EMPLOYEE_PERMISSIONS).toContain(PERMISSIONS.REQUEST_SHIFT_SWAP);
    });

    it('should include VIEW_ANNOUNCEMENTS in DEFAULT_EMPLOYEE_PERMISSIONS', () => {
      expect(DEFAULT_EMPLOYEE_PERMISSIONS).toContain(PERMISSIONS.VIEW_ANNOUNCEMENTS);
    });

    it('should include APPROVE_SHIFT_SWAP in MANAGER_AUTO_PERMISSIONS', () => {
      expect(MANAGER_AUTO_PERMISSIONS).toContain(PERMISSIONS.APPROVE_SHIFT_SWAP);
    });

    it('should include SEND_ANNOUNCEMENTS in MANAGER_AUTO_PERMISSIONS', () => {
      expect(MANAGER_AUTO_PERMISSIONS).toContain(PERMISSIONS.SEND_ANNOUNCEMENTS);
    });

    it('should include VIEW_ANNOUNCEMENTS in MANAGER_AUTO_PERMISSIONS', () => {
      expect(MANAGER_AUTO_PERMISSIONS).toContain(PERMISSIONS.VIEW_ANNOUNCEMENTS);
    });

    it('should include VIEW_REPORTS in MANAGER_AUTO_PERMISSIONS', () => {
      expect(MANAGER_AUTO_PERMISSIONS).toContain(PERMISSIONS.VIEW_REPORTS);
    });

    it('should include EXPORT_REPORTS in MANAGER_AUTO_PERMISSIONS', () => {
      expect(MANAGER_AUTO_PERMISSIONS).toContain(PERMISSIONS.EXPORT_REPORTS);
    });

    it('should grant new permissions to OWNER/ADMIN users', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          restaurantIdArb,
          fc.constantFrom(...newPermissions),
          fc.constantFrom('OWNER', 'ADMIN'),
          async (userId, restaurantId, permissionKey, role) => {
            const permission = PERMISSIONS[permissionKey as keyof typeof PERMISSIONS];
            const db = createMockDatabase({
              userRoles: new Map([[userId, role]]),
            });
            const service = createPermissionService(db);

            const result = await service.checkPermission(
              { userId, restaurantId },
              permission
            );

            expect(result.allowed).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
