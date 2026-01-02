import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import api from '../utils/api';
import {
  permissionsCache,
  getGlobalPermissionsCache,
  setGlobalPermissionsCache,
  isCacheValid,
  clearPermissionsCache,
  invalidateRestaurantCache,
} from '../utils/permissionsCache';

// Re-export cache functions for convenience
export { clearPermissionsCache, invalidateRestaurantCache };

export function usePermissions(restaurantId?: string | null) {
  const { user } = useAuthStore();
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const previousRestaurantIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const loadPermissions = async () => {
      if (!user || !restaurantId) {
        setPermissions([]);
        setLoading(false);
        return;
      }

      // Проверяем, изменился ли restaurantId (для инвалидации)
      const restaurantIdChanged = previousRestaurantIdRef.current !== undefined && 
                                   previousRestaurantIdRef.current !== restaurantId;
      previousRestaurantIdRef.current = restaurantId;

      // Проверяем кэш
      const cached = permissionsCache.get(restaurantId);
      if (cached && isCacheValid(cached.timestamp) && !restaurantIdChanged) {
        setPermissions(cached.permissions);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const response = await api.get(`/permissions/user/${user.id}`, {
          params: { restaurantId },
        });
        const loadedPermissions = response.data.permissions || [];
        
        // Сохраняем в кэш
        permissionsCache.set(restaurantId, {
          permissions: loadedPermissions,
          timestamp: Date.now(),
        });
        
        setPermissions(loadedPermissions);
      } catch (error: any) {
        console.error('Ошибка загрузки прав:', error);
        setPermissions([]);
      } finally {
        setLoading(false);
      }
    };

    loadPermissions();
  }, [user, restaurantId]);

  const hasPermission = useCallback((permission: string) => {
    if (!user) return false;
    if (user.role === 'OWNER' || user.role === 'ADMIN') return true;
    return permissions.includes(permission);
  }, [user, permissions]);

  const hasAnyPermission = useCallback((permissionList: string[]) => {
    return permissionList.some((perm) => hasPermission(perm));
  }, [hasPermission]);

  return { permissions, loading, hasPermission, hasAnyPermission };
}

// Хук для проверки прав по всем ресторанам пользователя
export function useGlobalPermissions() {
  const { user } = useAuthStore();
  const [permissionsMap, setPermissionsMap] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadAllPermissions = async () => {
      if (!user) {
        setPermissionsMap({});
        setLoading(false);
        return;
      }

      // OWNER и ADMIN имеют все права везде
      if (user.role === 'OWNER' || user.role === 'ADMIN') {
        const allPermissions = [
          'VIEW_RESTAURANTS',
          'EDIT_RESTAURANTS',
          'VIEW_SCHEDULE',
          'EDIT_SCHEDULE',
          'VIEW_SHIFT_TYPES',
          'EDIT_SHIFT_TYPES',
          'VIEW_OWN_TASKS',
          'VIEW_ALL_TASKS',
          'EDIT_TASKS',
          'VIEW_OWN_TIMESHEETS',
          'VIEW_ALL_TIMESHEETS',
          'EDIT_TIMESHEETS',
          'VIEW_EMPLOYEES',
          'EDIT_EMPLOYEES',
          'VIEW_POSITIONS',
          'EDIT_POSITIONS',
          'VIEW_DEPARTMENTS',
          'EDIT_DEPARTMENTS',
        ];
        setPermissionsMap({ global: allPermissions });
        setLoading(false);
        return;
      }

      // Проверяем глобальный кэш
      const globalCache = getGlobalPermissionsCache();
      if (
        globalCache &&
        globalCache.userId === user.id &&
        isCacheValid(globalCache.timestamp)
      ) {
        setPermissionsMap(globalCache.permissionsMap);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        
        // Получаем список ресторанов пользователя
        const restaurantsRes = await api.get('/restaurants');
        const restaurants = restaurantsRes.data.restaurants || [];

        if (restaurants.length === 0) {
          setPermissionsMap({});
          setLoading(false);
          return;
        }

        // Загружаем права для всех ресторанов параллельно (Promise.all) - Requirements 9.3
        const permissionsPromises = restaurants.map(async (restaurant: any) => {
          try {
            const response = await api.get(`/permissions/user/${user.id}`, {
              params: { restaurantId: restaurant.id },
            });
            return {
              restaurantId: restaurant.id,
              permissions: response.data.permissions || [],
            };
          } catch (error) {
            return {
              restaurantId: restaurant.id,
              permissions: [],
            };
          }
        });

        const permissionsResults = await Promise.all(permissionsPromises);
        const map: Record<string, string[]> = {};

        permissionsResults.forEach((result) => {
          map[result.restaurantId] = result.permissions;
          
          // Также обновляем кэш для usePermissions
          permissionsCache.set(result.restaurantId, {
            permissions: result.permissions,
            timestamp: Date.now(),
          });
        });

        // Также создаем объединенный список прав из всех ресторанов
        const allPermissionsSet = new Set<string>();
        permissionsResults.forEach((result) => {
          result.permissions.forEach((perm: string) => allPermissionsSet.add(perm));
        });
        map['global'] = Array.from(allPermissionsSet);

        // Сохраняем в глобальный кэш
        setGlobalPermissionsCache({
          permissionsMap: map,
          timestamp: Date.now(),
          userId: user.id,
        });

        setPermissionsMap(map);
      } catch (error: any) {
        console.error('Ошибка загрузки прав:', error);
        setPermissionsMap({});
      } finally {
        setLoading(false);
      }
    };

    loadAllPermissions();
  }, [user]);

  const hasPermission = useCallback((permission: string) => {
    if (!user) return false;
    if (user.role === 'OWNER' || user.role === 'ADMIN') return true;
    
    // Проверяем объединенные права из всех ресторанов
    return permissionsMap['global']?.includes(permission) || false;
  }, [user, permissionsMap]);

  const hasAnyPermission = useCallback((permissionList: string[]) => {
    return permissionList.some((perm) => hasPermission(perm));
  }, [hasPermission]);

  return { permissionsMap, loading, hasPermission, hasAnyPermission };
}
