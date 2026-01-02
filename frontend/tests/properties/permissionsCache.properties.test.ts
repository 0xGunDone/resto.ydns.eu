import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import {
  permissionsCache,
  clearPermissionsCache,
  invalidateRestaurantCache,
  isCacheValid,
  CACHE_TTL,
  setGlobalPermissionsCache,
  getGlobalPermissionsCache,
  getCacheSize,
  hasCacheEntry,
} from '../../src/utils/permissionsCache';

describe('Permission Cache Property Tests', () => {
  // Arbitraries for generating test data
  const restaurantIdArb = fc.uuid();
  const permissionNameArb = fc.stringMatching(/^[A-Z_]{3,20}$/);
  const permissionsArrayArb = fc.array(permissionNameArb, { minLength: 0, maxLength: 10 });
  const userIdArb = fc.uuid();

  beforeEach(() => {
    clearPermissionsCache();
  });

  afterEach(() => {
    clearPermissionsCache();
  });

  describe('Property 18: Permission Cache Invalidation', () => {
    it('should invalidate cache for specific restaurant when restaurantId changes', () => {
      fc.assert(
        fc.property(
          restaurantIdArb,
          restaurantIdArb,
          permissionsArrayArb,
          permissionsArrayArb,
          (restaurantId1, restaurantId2, permissions1, permissions2) => {
            fc.pre(restaurantId1 !== restaurantId2);

            permissionsCache.set(restaurantId1, {
              permissions: permissions1,
              timestamp: Date.now(),
            });
            permissionsCache.set(restaurantId2, {
              permissions: permissions2,
              timestamp: Date.now(),
            });

            expect(hasCacheEntry(restaurantId1)).toBe(true);
            expect(hasCacheEntry(restaurantId2)).toBe(true);

            invalidateRestaurantCache(restaurantId1);

            expect(hasCacheEntry(restaurantId1)).toBe(false);
            expect(hasCacheEntry(restaurantId2)).toBe(true);

            const cached = permissionsCache.get(restaurantId2);
            expect(cached?.permissions).toEqual(permissions2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly report cache validity based on TTL', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: CACHE_TTL * 2 }),
          (elapsedTime) => {
            const timestamp = Date.now() - elapsedTime;
            const isValid = isCacheValid(timestamp);

            if (elapsedTime < CACHE_TTL) {
              expect(isValid).toBe(true);
            } else {
              expect(isValid).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain cache integrity when multiple restaurants are cached', () => {
      fc.assert(
        fc.property(
          fc.array(fc.tuple(restaurantIdArb, permissionsArrayArb), { minLength: 1, maxLength: 10 }),
          (restaurantData) => {
            // Clear cache at start of each iteration
            clearPermissionsCache();
            
            const uniqueData = new Map<string, string[]>();
            restaurantData.forEach(([id, perms]) => {
              uniqueData.set(id, perms);
            });

            uniqueData.forEach((permissions, restaurantId) => {
              permissionsCache.set(restaurantId, {
                permissions,
                timestamp: Date.now(),
              });
            });

            uniqueData.forEach((expectedPermissions, restaurantId) => {
              const cached = permissionsCache.get(restaurantId);
              expect(cached).toBeDefined();
              expect(cached?.permissions).toEqual(expectedPermissions);
            });

            expect(getCacheSize()).toBe(uniqueData.size);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle invalidation of non-existent restaurant gracefully', () => {
      fc.assert(
        fc.property(
          restaurantIdArb,
          restaurantIdArb,
          permissionsArrayArb,
          (existingId, nonExistingId, permissions) => {
            fc.pre(existingId !== nonExistingId);

            permissionsCache.set(existingId, {
              permissions,
              timestamp: Date.now(),
            });

            const sizeBefore = getCacheSize();

            invalidateRestaurantCache(nonExistingId);

            expect(getCacheSize()).toBe(sizeBefore);
            expect(hasCacheEntry(existingId)).toBe(true);
            expect(permissionsCache.get(existingId)?.permissions).toEqual(permissions);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Property 19: Logout Cache Clearing', () => {
    it('should clear all cached permissions on logout', () => {
      fc.assert(
        fc.property(
          fc.array(fc.tuple(restaurantIdArb, permissionsArrayArb), { minLength: 1, maxLength: 20 }),
          userIdArb,
          (restaurantData, userId) => {
            const uniqueData = new Map<string, string[]>();
            restaurantData.forEach(([id, perms]) => {
              uniqueData.set(id, perms);
            });

            uniqueData.forEach((permissions, restaurantId) => {
              permissionsCache.set(restaurantId, {
                permissions,
                timestamp: Date.now(),
              });
            });

            const globalPermsMap: Record<string, string[]> = {};
            uniqueData.forEach((permissions, restaurantId) => {
              globalPermsMap[restaurantId] = permissions;
            });
            setGlobalPermissionsCache({
              permissionsMap: globalPermsMap,
              timestamp: Date.now(),
              userId,
            });

            expect(getCacheSize()).toBeGreaterThan(0);
            expect(getGlobalPermissionsCache()).not.toBeNull();

            clearPermissionsCache();

            expect(getCacheSize()).toBe(0);
            expect(getGlobalPermissionsCache()).toBeNull();
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle clearing empty cache gracefully', () => {
      fc.assert(
        fc.property(
          fc.constant(null),
          () => {
            expect(getCacheSize()).toBe(0);
            expect(getGlobalPermissionsCache()).toBeNull();

            clearPermissionsCache();

            expect(getCacheSize()).toBe(0);
            expect(getGlobalPermissionsCache()).toBeNull();
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should ensure no stale data remains after logout', () => {
      fc.assert(
        fc.property(
          restaurantIdArb,
          permissionsArrayArb,
          userIdArb,
          (restaurantId, permissions, userId) => {
            permissionsCache.set(restaurantId, {
              permissions,
              timestamp: Date.now(),
            });
            setGlobalPermissionsCache({
              permissionsMap: { [restaurantId]: permissions },
              timestamp: Date.now(),
              userId,
            });

            clearPermissionsCache();

            expect(hasCacheEntry(restaurantId)).toBe(false);
            expect(permissionsCache.get(restaurantId)).toBeUndefined();
            expect(getGlobalPermissionsCache()).toBeNull();
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
