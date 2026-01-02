/**
 * Authentication and Authorization Middleware
 * 
 * Requirements: 1.1, 1.5, 4.1, 8.5, 8.6
 */

import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, TokenPayload } from '../utils/jwt';
import dbClient from '../utils/db';
import { 
  getPermissionService, 
  PermissionCode,
  PERMISSIONS 
} from '../services/permissionService';
import { AppError, ErrorCodes } from './errorHandler';
import { logger } from '../services/loggerService';

export interface AuthRequest extends Request {
  user?: TokenPayload & {
    id: string;
  };
}

/**
 * Authentication middleware
 * Validates JWT token and attaches user to request
 * 
 * Requirements: 8.5 - Returns 401 for authentication failures
 */
export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    // Check for missing token
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const response = {
        status: 401,
        code: ErrorCodes.AUTH_TOKEN_MISSING,
        message: 'Authentication required: No token provided',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const token = authHeader.substring(7);
    
    let payload: TokenPayload;
    try {
      payload = verifyAccessToken(token);
    } catch (error: any) {
      // Handle invalid or expired token
      const isExpired = error.name === 'TokenExpiredError';
      const response = {
        status: 401,
        code: isExpired ? ErrorCodes.AUTH_TOKEN_EXPIRED : ErrorCodes.AUTH_TOKEN_INVALID,
        message: isExpired ? 'Authentication failed: Token has expired' : 'Authentication failed: Invalid token',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    // Verify user exists and is active
    const user = await dbClient.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, role: true, isActive: true },
    });

    if (!user) {
      const response = {
        status: 401,
        code: ErrorCodes.USER_NOT_FOUND,
        message: 'Authentication failed: User not found',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    if (!user.isActive) {
      const response = {
        status: 401,
        code: ErrorCodes.AUTH_USER_INACTIVE,
        message: 'Authentication failed: User account is inactive',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    req.user = {
      ...payload,
      id: user.id,
    };

    next();
  } catch (error) {
    next(error);
  }
};


/**
 * Role-based access control middleware
 * 
 * Requirements: 8.6 - Returns 403 for authorization failures
 */
export const requireRole = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      const response = {
        status: 401,
        code: ErrorCodes.AUTH_TOKEN_MISSING,
        message: 'Authentication required',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    if (!roles.includes(req.user.role)) {
      logger.debug('Role check failed', {
        userId: req.user.id,
        action: `role:${req.user.role}`,
        restaurantId: undefined,
      });
      
      const response = {
        status: 403,
        code: ErrorCodes.FORBIDDEN_NO_PERMISSION,
        message: 'Access denied: Insufficient role permissions',
        timestamp: new Date().toISOString(),
      };
      res.status(403).json(response);
      return;
    }

    next();
  };
};

/**
 * Restaurant access middleware
 * Uses Permission Service to check restaurant access
 * 
 * Requirements: 1.2, 8.6
 */
export const requireRestaurantAccess = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      const response = {
        status: 401,
        code: ErrorCodes.AUTH_TOKEN_MISSING,
        message: 'Authentication required',
        timestamp: new Date().toISOString(),
      };
      res.status(401).json(response);
      return;
    }

    const restaurantId = req.params.restaurantId || req.body.restaurantId || req.query.restaurantId;

    if (!restaurantId) {
      const response = {
        status: 400,
        code: ErrorCodes.VALIDATION_FAILED,
        message: 'Restaurant ID is required',
        timestamp: new Date().toISOString(),
      };
      res.status(400).json(response);
      return;
    }

    const permissionService = getPermissionService();
    const hasAccess = await permissionService.checkRestaurantAccess(
      req.user.id,
      restaurantId as string
    );

    if (hasAccess) {
      next();
      return;
    }

    logger.debug('Restaurant access denied', {
      userId: req.user.id,
      restaurantId: restaurantId as string,
      action: 'restaurant_access_denied',
    });

    const response = {
      status: 403,
      code: ErrorCodes.FORBIDDEN_NO_RESTAURANT_ACCESS,
      message: 'Access denied: No access to this restaurant',
      timestamp: new Date().toISOString(),
    };
    res.status(403).json(response);
  } catch (error) {
    next(error);
  }
};


/**
 * Permission-based access control middleware
 * Uses the centralized Permission Service for all permission checks
 * 
 * Requirements: 1.1, 1.5, 4.1, 8.6
 * 
 * Usage: 
 *   requirePermission('VIEW_SCHEDULE')
 *   requirePermission(['VIEW_SCHEDULE', 'EDIT_SCHEDULE'])
 */
export const requirePermission = (permission: PermissionCode | PermissionCode[]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Check authentication first
      if (!req.user) {
        const response = {
          status: 401,
          code: ErrorCodes.AUTH_TOKEN_MISSING,
          message: 'Authentication required',
          timestamp: new Date().toISOString(),
        };
        res.status(401).json(response);
        return;
      }

      const restaurantId = req.params.restaurantId || req.body.restaurantId || req.query.restaurantId;
      const permissionService = getPermissionService();
      const permissions = Array.isArray(permission) ? permission : [permission];

      // Check all required permissions
      const results = await Promise.all(
        permissions.map((perm) =>
          permissionService.checkPermission(
            { userId: req.user!.id, restaurantId: restaurantId as string | undefined },
            perm
          )
        )
      );

      // All permissions must be granted
      const allGranted = results.every((result) => result.allowed);

      if (allGranted) {
        next();
        return;
      }

      // Find the first denied permission for the error message
      const deniedIndex = results.findIndex((result) => !result.allowed);
      const deniedPermission = permissions[deniedIndex];
      const deniedReason = results[deniedIndex]?.reason || 'Insufficient permissions';

      logger.debug('Permission denied', {
        userId: req.user.id,
        restaurantId: restaurantId as string | undefined,
        action: `denied:${deniedPermission}`,
      });

      // Return consistent 403 error format
      // Requirements: 1.5, 8.6
      const response = {
        status: 403,
        code: ErrorCodes.FORBIDDEN_NO_PERMISSION,
        message: `Access denied: ${deniedReason}`,
        timestamp: new Date().toISOString(),
      };
      res.status(403).json(response);
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Check if user has any of the specified permissions
 * Useful when multiple permissions can grant access
 * 
 * Usage:
 *   requireAnyPermission(['VIEW_OWN_TASKS', 'VIEW_ALL_TASKS'])
 */
export const requireAnyPermission = (permissions: PermissionCode[]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        const response = {
          status: 401,
          code: ErrorCodes.AUTH_TOKEN_MISSING,
          message: 'Authentication required',
          timestamp: new Date().toISOString(),
        };
        res.status(401).json(response);
        return;
      }

      const restaurantId = req.params.restaurantId || req.body.restaurantId || req.query.restaurantId;
      const permissionService = getPermissionService();

      const result = await permissionService.checkAnyPermission(
        { userId: req.user.id, restaurantId: restaurantId as string | undefined },
        permissions
      );

      if (result.allowed) {
        next();
        return;
      }

      logger.debug('All permissions denied', {
        userId: req.user.id,
        restaurantId: restaurantId as string | undefined,
        action: `denied:any_of:${permissions.join(',')}`,
      });

      const response = {
        status: 403,
        code: ErrorCodes.FORBIDDEN_NO_PERMISSION,
        message: `Access denied: ${result.reason || 'None of the required permissions granted'}`,
        timestamp: new Date().toISOString(),
      };
      res.status(403).json(response);
    } catch (error) {
      next(error);
    }
  };
};

// Re-export PermissionCode and PERMISSIONS for convenience
export { PermissionCode, PERMISSIONS };
