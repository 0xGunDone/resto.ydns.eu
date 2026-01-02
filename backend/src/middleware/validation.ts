/**
 * Validation Middleware
 * Express middleware for request validation
 * 
 * Requirements: 5.4
 */

import { Request, Response, NextFunction } from 'express';
import { AppError, ErrorCodes } from './errorHandler';
import { 
  createValidationService, 
  ValidationSchema,
  ValidationError 
} from '../services/validationService';
import { sqliteDb } from '../utils/db';

/**
 * Get validation service instance
 */
function getValidationService() {
  return createValidationService(sqliteDb);
}

/**
 * Middleware to validate request body against a schema
 */
export function validateBody(schema: ValidationSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const validationService = getValidationService();
    const result = validationService.validateFields(req.body, schema);
    
    if (!result.valid) {
      throw AppError.badRequest(
        ErrorCodes.VALIDATION_FAILED,
        'Validation failed',
        { errors: result.errors }
      );
    }
    
    next();
  };
}

/**
 * Middleware to validate that restaurantId exists
 */
export function validateRestaurantId(paramName: string = 'restaurantId') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const restaurantId = req.params[paramName] || req.body[paramName] || req.query[paramName];
    
    if (!restaurantId) {
      throw AppError.badRequest(
        ErrorCodes.VALIDATION_FAILED,
        `${paramName} is required`,
        { errors: [{ field: paramName, message: `${paramName} is required`, code: 'REQUIRED_FIELD' }] }
      );
    }
    
    const validationService = getValidationService();
    const result = validationService.validateRestaurantExists(restaurantId as string);
    
    if (!result.valid) {
      throw AppError.badRequest(
        ErrorCodes.RESTAURANT_NOT_FOUND,
        result.errors![0].message,
        { errors: result.errors }
      );
    }
    
    next();
  };
}

/**
 * Middleware to validate that userId exists
 */
export function validateUserId(paramName: string = 'userId') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const userId = req.params[paramName] || req.body[paramName] || req.query[paramName];
    
    if (!userId) {
      throw AppError.badRequest(
        ErrorCodes.VALIDATION_FAILED,
        `${paramName} is required`,
        { errors: [{ field: paramName, message: `${paramName} is required`, code: 'REQUIRED_FIELD' }] }
      );
    }
    
    const validationService = getValidationService();
    const result = validationService.validateUserExists(userId as string);
    
    if (!result.valid) {
      throw AppError.badRequest(
        ErrorCodes.USER_NOT_FOUND,
        result.errors![0].message,
        { errors: result.errors }
      );
    }
    
    next();
  };
}

/**
 * Middleware to validate date range parameters
 */
export function validateDateRange(startDateParam: string = 'startDate', endDateParam: string = 'endDate') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const startDate = req.query[startDateParam] || req.body[startDateParam];
    const endDate = req.query[endDateParam] || req.body[endDateParam];
    
    // If neither date is provided, skip validation
    if (!startDate && !endDate) {
      next();
      return;
    }
    
    const errors: ValidationError[] = [];
    
    if (!startDate) {
      errors.push({ field: startDateParam, message: `${startDateParam} is required when ${endDateParam} is provided`, code: 'REQUIRED_FIELD' });
    }
    
    if (!endDate) {
      errors.push({ field: endDateParam, message: `${endDateParam} is required when ${startDateParam} is provided`, code: 'REQUIRED_FIELD' });
    }
    
    if (errors.length > 0) {
      throw AppError.badRequest(
        ErrorCodes.VALIDATION_FAILED,
        'Validation failed',
        { errors }
      );
    }
    
    const validationService = getValidationService();
    const result = validationService.validateDateRange(startDate as string, endDate as string);
    
    if (!result.valid) {
      throw AppError.badRequest(
        ErrorCodes.VALIDATION_FAILED,
        'Invalid date range',
        { errors: result.errors }
      );
    }
    
    next();
  };
}

/**
 * Middleware to validate restaurant membership
 */
export function validateMembership(userIdSource: 'user' | 'param' | 'body' = 'user', restaurantIdSource: 'param' | 'body' | 'query' = 'param') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    let userId: string | undefined;
    let restaurantId: string | undefined;
    
    // Get userId based on source
    if (userIdSource === 'user') {
      userId = (req as any).user?.id;
    } else if (userIdSource === 'param') {
      userId = req.params.userId;
    } else {
      userId = req.body.userId;
    }
    
    // Get restaurantId based on source
    if (restaurantIdSource === 'param') {
      restaurantId = req.params.restaurantId;
    } else if (restaurantIdSource === 'body') {
      restaurantId = req.body.restaurantId;
    } else {
      restaurantId = req.query.restaurantId as string;
    }
    
    if (!userId || !restaurantId) {
      throw AppError.badRequest(
        ErrorCodes.VALIDATION_FAILED,
        'User ID and Restaurant ID are required',
        { errors: [
          ...(!userId ? [{ field: 'userId', message: 'User ID is required', code: 'REQUIRED_FIELD' }] : []),
          ...(!restaurantId ? [{ field: 'restaurantId', message: 'Restaurant ID is required', code: 'REQUIRED_FIELD' }] : []),
        ]}
      );
    }
    
    const validationService = getValidationService();
    const result = validationService.validateRestaurantMembership(userId, restaurantId);
    
    if (!result.valid) {
      const firstError = result.errors![0];
      
      if (firstError.code === ErrorCodes.RESTAURANT_NOT_FOUND) {
        throw AppError.badRequest(ErrorCodes.RESTAURANT_NOT_FOUND, firstError.message, { errors: result.errors });
      }
      
      if (firstError.code === ErrorCodes.USER_NOT_FOUND) {
        throw AppError.badRequest(ErrorCodes.USER_NOT_FOUND, firstError.message, { errors: result.errors });
      }
      
      throw AppError.forbidden(
        ErrorCodes.FORBIDDEN_NO_RESTAURANT_ACCESS,
        firstError.message
      );
    }
    
    next();
  };
}

/**
 * Combine multiple validation middlewares
 */
export function validate(...validators: Array<(req: Request, res: Response, next: NextFunction) => void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    let index = 0;
    
    const runNext = (err?: unknown): void => {
      if (err) {
        next(err as Error);
        return;
      }
      
      if (index >= validators.length) {
        next();
        return;
      }
      
      const validator = validators[index++];
      try {
        validator(req, res, runNext as NextFunction);
      } catch (error) {
        next(error);
      }
    };
    
    runNext();
  };
}
