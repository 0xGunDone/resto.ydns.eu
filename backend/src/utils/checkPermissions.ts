import dbClient from './db';
import { PERMISSIONS, PermissionCode, MANAGER_AUTO_PERMISSIONS, DEFAULT_EMPLOYEE_PERMISSIONS } from './permissions';

// Re-export PermissionCode for external use
export type { PermissionCode };

/**
 * Проверяет, имеет ли пользователь указанное право в конкретном ресторане
 */
export async function checkPermission(
  userId: string,
  restaurantId: string,
  permission: PermissionCode
): Promise<boolean> {
  // Получаем пользователя
  const user = await dbClient.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (!user) {
    return false;
  }

  // OWNER и ADMIN имеют все права
  if (user.role === 'OWNER' || user.role === 'ADMIN') {
    return true;
  }

  // Проверяем, является ли пользователь менеджером этого ресторана
  const restaurant = await dbClient.restaurant.findUnique({
    where: { id: restaurantId },
    select: { managerId: true },
  });

  if (restaurant?.managerId === userId) {
    // Менеджер имеет все права в своем ресторане
    return MANAGER_AUTO_PERMISSIONS.includes(permission) || permission === PERMISSIONS.VIEW_RESTAURANTS;
  }

  // Получаем информацию о работе пользователя в ресторане
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

  // Если пользователь не работает в ресторане
  if (!restaurantUser) {
    // VIEW_RESTAURANTS позволяет только видеть список ресторанов, но не дает доступа к конкретному ресторану
    // Доступ к ресторану возможен только если пользователь является сотрудником (RestaurantUser)
    if (permission === PERMISSIONS.VIEW_RESTAURANTS) {
      return true; // Может видеть список, но не имеет доступа к ресторану
    }
    return false;
  }

  // Получаем права должности
  const positionPermissions = restaurantUser.position.permissions.map(
    (pp) => pp.permission.code as PermissionCode
  );

  // Проверяем наличие права
  if (positionPermissions.includes(permission)) {
    return true;
  }

  // Если у должности нет прав, даем минимальные права сотрудника
  return DEFAULT_EMPLOYEE_PERMISSIONS.includes(permission);
}

/**
 * Получает все права пользователя в конкретном ресторане
 */
export async function getUserPermissions(
  userId: string,
  restaurantId: string
): Promise<PermissionCode[]> {
  const user = await dbClient.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (!user) {
    return [];
  }

  // OWNER и ADMIN имеют все права
  if (user.role === 'OWNER' || user.role === 'ADMIN') {
    return Object.values(PERMISSIONS) as PermissionCode[];
  }

  // Проверяем, является ли пользователь менеджером
  const restaurant = await dbClient.restaurant.findUnique({
    where: { id: restaurantId },
    select: { managerId: true },
  });

  if (restaurant?.managerId === userId) {
    return [...MANAGER_AUTO_PERMISSIONS, PERMISSIONS.VIEW_RESTAURANTS];
  }

  // Получаем права должности
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

  if (!restaurantUser) {
    return DEFAULT_EMPLOYEE_PERMISSIONS;
  }

  const positionPermissions = restaurantUser.position.permissions.map(
    (pp) => pp.permission.code as PermissionCode
  );

  // Объединяем права должности с минимальными правами
  return [...new Set([...positionPermissions, ...DEFAULT_EMPLOYEE_PERMISSIONS])];
}

