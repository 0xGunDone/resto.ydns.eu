import { Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import dbClient from '../utils/db';
import { logAction } from '../utils/actionLog';
import { AuthRequest } from '../middleware/auth';

// Получение всех прав
export const getPermissions = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const permissions = await dbClient.permission.findMany({
      orderBy: [
        { category: 'asc' },
        { name: 'asc' },
      ],
    });

    // Группируем по категориям
    const grouped = permissions.reduce((acc, perm) => {
      if (!acc[perm.category]) {
        acc[perm.category] = [];
      }
      acc[perm.category].push(perm);
      return acc;
    }, {} as Record<string, typeof permissions>);

    res.json({ permissions, grouped });
  } catch (error) {
    next(error);
  }
};

// Получение прав должности
export const getPositionPermissions = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { positionId } = req.params;

    const position = await dbClient.position.findUnique({
      where: { id: positionId },
    });

    if (!position) {
      res.status(404).json({ error: 'Position not found' });
      return;
    }

    // Получаем ресторан отдельным запросом
    const restaurant = await dbClient.restaurant.findUnique({
      where: { id: position.restaurantId },
      select: { id: true, name: true, managerId: true },
    });

    // Проверка доступа - только владелец ресторана или админ
    if (req.user?.role !== 'OWNER' && req.user?.role !== 'ADMIN') {
      const restaurantUser = await dbClient.restaurantUser.findFirst({
        where: {
          userId: req.user?.id,
          restaurantId: position.restaurantId,
          isActive: true,
        },
      });

      if (!restaurantUser) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      // Проверяем, является ли пользователь менеджером ресторана
      if (restaurant?.managerId !== req.user.id) {
        res.status(403).json({ error: 'Forbidden: Only restaurant manager can edit positions' });
        return;
      }
    }

    // Получаем права должности отдельным запросом
    const positionPermissions = await dbClient.positionPermission.findMany({
      where: { positionId },
    });

    // Получаем детали прав
    const permissionIds = positionPermissions.map((pp: any) => pp.permissionId);
    let permissions: any[] = [];
    
    if (permissionIds.length > 0) {
      const allPermissions = await dbClient.permission.findMany({});
      permissions = allPermissions
        .filter((p: any) => permissionIds.includes(p.id))
        .map((p: any) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          category: p.category,
        }));
    }

    res.json({
      position: {
        id: position.id,
        name: position.name,
        restaurant: restaurant ? { id: restaurant.id, name: restaurant.name } : null,
      },
      permissions,
    });
  } catch (error) {
    next(error);
  }
};

// Назначение прав должности
export const updatePositionPermissions = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }

    const { positionId } = req.params;
    const { permissionIds } = req.body;

    if (!Array.isArray(permissionIds)) {
      res.status(400).json({ error: 'permissionIds must be an array' });
      return;
    }

    const position = await dbClient.position.findUnique({
      where: { id: positionId },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!position) {
      res.status(404).json({ error: 'Position not found' });
      return;
    }

    // Проверка доступа
    if (req.user?.role !== 'OWNER' && req.user?.role !== 'ADMIN') {
      const restaurant = await dbClient.restaurant.findUnique({
        where: { id: position.restaurantId },
        select: { managerId: true },
      });

      if (restaurant?.managerId !== req.user?.id) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
    }

    // Проверяем, что все права существуют
    const permissions = await dbClient.permission.findMany({
      where: {
        id: { in: permissionIds },
      },
    });

    if (permissions.length !== permissionIds.length) {
      res.status(400).json({ error: 'Some permissions not found' });
      return;
    }

    // Удаляем старые права
    await dbClient.positionPermission.deleteMany({
      where: {
        positionId,
      },
    });

    // Создаем новые права
    if (permissionIds.length > 0) {
      await dbClient.positionPermission.createMany({
        data: permissionIds.map((permissionId: string) => ({
          positionId,
          permissionId,
        })),
      });
    }

    await logAction({
      userId: req.user!.id,
      type: 'UPDATE',
      entityType: 'Position',
      entityId: positionId,
      description: `Updated permissions for position: ${position.name}`,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      message: 'Permissions updated successfully',
      position: {
        id: position.id,
        name: position.name,
      },
      permissions: permissions.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
      })),
    });
  } catch (error) {
    next(error);
  }
};

// Получение прав пользователя в ресторане
export const getUserPermissions = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { userId } = req.params;
    const { restaurantId } = req.query;

    if (!restaurantId) {
      res.status(400).json({ error: 'restaurantId is required' });
      return;
    }

    // Пользователь может запрашивать только свои права
    if (req.user?.id !== userId && req.user?.role !== 'OWNER' && req.user?.role !== 'ADMIN') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const { getUserPermissions: getUserPermissionsUtil } = await import('../utils/checkPermissions');
    const permissions = await getUserPermissionsUtil(userId, restaurantId as string);

    res.json({ permissions });
  } catch (error) {
    next(error);
  }
};

