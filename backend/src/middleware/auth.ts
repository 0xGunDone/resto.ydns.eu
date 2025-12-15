import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, TokenPayload } from '../utils/jwt';
import prisma from '../utils/prisma';
import { checkPermission, PermissionCode } from '../utils/checkPermissions';

export interface AuthRequest extends Request {
  user?: TokenPayload & {
    id: string;
  };
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized: No token provided' });
      return;
    }

    const token = authHeader.substring(7);
    const payload = verifyAccessToken(token);

    // Проверяем, что пользователь существует и активен
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      res.status(401).json({ error: 'Unauthorized: User not found or inactive' });
      return;
    }

    req.user = {
      ...payload,
      id: user.id,
    };

    next();
  } catch (error: any) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
      return;
    }
    next(error);
  }
};

export const requireRole = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
      return;
    }

    next();
  };
};

// Проверка доступа к ресторану
export const requireRestaurantAccess = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const restaurantId = req.params.restaurantId || req.body.restaurantId || req.query.restaurantId;

    if (!restaurantId) {
      res.status(400).json({ error: 'Restaurant ID is required' });
      return;
    }

    // Владельцы и админы имеют доступ ко всем ресторанам
    if (req.user.role === 'OWNER' || req.user.role === 'ADMIN') {
      next();
      return;
    }

    // Менеджеры имеют доступ к своему ресторану
    if (req.user.role === 'MANAGER') {
      const restaurant = await prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { managerId: true },
      });

      if (restaurant?.managerId === req.user.id) {
        next();
        return;
      }
    }

    // Сотрудники имеют доступ к ресторанам, где они работают (являются активными сотрудниками)
    // VIEW_RESTAURANTS позволяет только видеть список ресторанов, но не дает доступа к конкретному ресторану
    // Доступ к ресторану возможен только если пользователь является сотрудником (RestaurantUser с isActive=true)
    if (req.user.role === 'EMPLOYEE') {
      const restaurantUser = await prisma.restaurantUser.findFirst({
        where: {
          restaurantId,
          userId: req.user.id,
          isActive: true,
        },
      });

      if (restaurantUser) {
        next();
        return;
      }
    }

    res.status(403).json({ error: 'Forbidden: No access to this restaurant' });
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware для проверки прав доступа на основе должности
 * Использование: requirePermission('VIEW_SCHEDULE') или requirePermission(['VIEW_SCHEDULE', 'EDIT_SCHEDULE'])
 */
export const requirePermission = (permission: PermissionCode | PermissionCode[]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const restaurantId = req.params.restaurantId || req.body.restaurantId || req.query.restaurantId;

      // Если требуется доступ к ресторану, сначала проверяем доступ
      if (restaurantId) {
        // Владельцы и админы имеют все права
        if (req.user.role === 'OWNER' || req.user.role === 'ADMIN') {
          next();
          return;
        }
      }

      const permissions = Array.isArray(permission) ? permission : [permission];
      const hasAllPermissions = await Promise.all(
        permissions.map((perm) => {
          if (restaurantId) {
            return checkPermission(req.user!.id, restaurantId, perm);
          }
          // Если restaurantId не указан, проверяем только глобальные права
          // Например, VIEW_RESTAURANTS не требует restaurantId
          if (req.user!.role === 'OWNER' || req.user!.role === 'ADMIN') {
            return true;
          }
          return false;
        })
      );

      if (hasAllPermissions.every((has) => has)) {
        next();
      } else {
        res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
      }
    } catch (error) {
      next(error);
    }
  };
};

