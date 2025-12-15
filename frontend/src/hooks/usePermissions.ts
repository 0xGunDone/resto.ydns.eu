import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import api from '../utils/api';

export function usePermissions(restaurantId?: string | null) {
  const { user } = useAuthStore();
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPermissions = async () => {
      if (!user || !restaurantId) {
        setPermissions([]);
        setLoading(false);
        return;
      }

      try {
        const response = await api.get(`/permissions/user/${user.id}`, {
          params: { restaurantId },
        });
        setPermissions(response.data.permissions || []);
      } catch (error: any) {
        console.error('Ошибка загрузки прав:', error);
        setPermissions([]);
      } finally {
        setLoading(false);
      }
    };

    loadPermissions();
  }, [user, restaurantId]);

  const hasPermission = (permission: string) => {
    if (!user) return false;
    if (user.role === 'OWNER' || user.role === 'ADMIN') return true;
    return permissions.includes(permission);
  };

  const hasAnyPermission = (permissionList: string[]) => {
    return permissionList.some((perm) => hasPermission(perm));
  };

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

      try {
        // Получаем список ресторанов пользователя
        const restaurantsRes = await api.get('/restaurants');
        const restaurants = restaurantsRes.data.restaurants || [];

        if (restaurants.length === 0) {
          setPermissionsMap({});
          setLoading(false);
          return;
        }

        // Загружаем права для каждого ресторана
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
        });

        // Также создаем объединенный список прав из всех ресторанов
        const allPermissionsSet = new Set<string>();
        permissionsResults.forEach((result) => {
          result.permissions.forEach((perm: string) => allPermissionsSet.add(perm));
        });
        map['global'] = Array.from(allPermissionsSet);

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

  const hasPermission = (permission: string) => {
    if (!user) return false;
    if (user.role === 'OWNER' || user.role === 'ADMIN') return true;
    
    // Проверяем объединенные права из всех ресторанов
    return permissionsMap['global']?.includes(permission) || false;
  };

  const hasAnyPermission = (permissionList: string[]) => {
    return permissionList.some((perm) => hasPermission(perm));
  };

  return { permissionsMap, loading, hasPermission, hasAnyPermission };
}

