/**
 * Validation Service
 * Centralized validation for input data
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.5
 */

import { Pool } from 'pg';
import { AppError, ErrorCodes } from '../middleware/errorHandler';
import { logger } from './loggerService';
import { pgPool } from '../utils/db';

/**
 * Validation result interface
 */
export interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[];
}

/**
 * Individual validation error
 */
export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

/**
 * Field validation rule
 */
export interface FieldRule {
  required?: boolean;
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object';
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  custom?: (value: unknown) => boolean;
  customMessage?: string;
}

/**
 * Validation schema - map of field names to rules
 */
export type ValidationSchema = Record<string, FieldRule>;

/**
 * ISO 8601 date regex pattern
 */
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})?)?$/;

/**
 * Simple date pattern (YYYY-MM-DD)
 */
const SIMPLE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validation Service Interface
 */
export interface IValidationService {
  validateRestaurantExists(restaurantId: string): ValidationResult;
  validateUserExists(userId: string): ValidationResult;
  validateRestaurantMembership(userId: string, restaurantId: string): ValidationResult;
  validateDateRange(startDate: string, endDate: string): ValidationResult;
  validateDate(dateString: string, fieldName?: string): ValidationResult;
  validateRequiredFields(data: Record<string, unknown>, schema: ValidationSchema): ValidationResult;
  validateFields(data: Record<string, unknown>, schema: ValidationSchema): ValidationResult;
}

/**
 * Create a Validation Service instance (synchronous version for middleware)
 * Note: Database validations are now no-ops in sync mode, use async versions
 */
export function createValidationService(_pool?: Pool): IValidationService {
  /**
   * Validate that a restaurant exists (sync stub - always returns valid)
   * Use validateRestaurantExistsAsync for actual validation
   */
  function validateRestaurantExists(restaurantId: string): ValidationResult {
    if (!restaurantId || typeof restaurantId !== 'string') {
      return {
        valid: false,
        errors: [{
          field: 'restaurantId',
          message: 'Restaurant ID is required',
          code: 'REQUIRED_FIELD',
        }],
      };
    }
    // Sync validation just checks format, async version checks DB
    return { valid: true };
  }

  /**
   * Validate that a user exists (sync stub - always returns valid)
   * Use validateUserExistsAsync for actual validation
   */
  function validateUserExists(userId: string): ValidationResult {
    if (!userId || typeof userId !== 'string') {
      return {
        valid: false,
        errors: [{
          field: 'userId',
          message: 'User ID is required',
          code: 'REQUIRED_FIELD',
        }],
      };
    }
    return { valid: true };
  }

  /**
   * Validate restaurant membership (sync stub)
   */
  function validateRestaurantMembership(userId: string, restaurantId: string): ValidationResult {
    const restaurantResult = validateRestaurantExists(restaurantId);
    if (!restaurantResult.valid) return restaurantResult;

    const userResult = validateUserExists(userId);
    if (!userResult.valid) return userResult;

    return { valid: true };
  }

  /**
   * Validate a single date string
   */
  function validateDate(dateString: string, fieldName: string = 'date'): ValidationResult {
    if (!dateString || typeof dateString !== 'string') {
      return {
        valid: false,
        errors: [{
          field: fieldName,
          message: `${fieldName} is required`,
          code: 'REQUIRED_FIELD',
        }],
      };
    }

    if (!ISO_DATE_PATTERN.test(dateString) && !SIMPLE_DATE_PATTERN.test(dateString)) {
      return {
        valid: false,
        errors: [{
          field: fieldName,
          message: `${fieldName} must be a valid ISO 8601 date format`,
          code: 'INVALID_DATE_FORMAT',
        }],
      };
    }

    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return {
        valid: false,
        errors: [{
          field: fieldName,
          message: `${fieldName} is not a valid date`,
          code: 'INVALID_DATE',
        }],
      };
    }

    return { valid: true };
  }

  /**
   * Validate a date range
   */
  function validateDateRange(startDate: string, endDate: string): ValidationResult {
    const errors: ValidationError[] = [];

    const startResult = validateDate(startDate, 'startDate');
    if (!startResult.valid && startResult.errors) {
      errors.push(...startResult.errors);
    }

    const endResult = validateDate(endDate, 'endDate');
    if (!endResult.valid && endResult.errors) {
      errors.push(...endResult.errors);
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start > end) {
      return {
        valid: false,
        errors: [{
          field: 'dateRange',
          message: 'Start date must be before or equal to end date',
          code: 'INVALID_DATE_RANGE',
        }],
      };
    }

    return { valid: true };
  }

  /**
   * Validate required fields
   */
  function validateRequiredFields(data: Record<string, unknown>, schema: ValidationSchema): ValidationResult {
    const errors: ValidationError[] = [];

    for (const [field, rules] of Object.entries(schema)) {
      if (rules.required) {
        const value = data[field];
        if (value === undefined || value === null || value === '') {
          errors.push({
            field,
            message: `${field} is required`,
            code: 'REQUIRED_FIELD',
          });
        }
      }
    }

    return errors.length > 0 ? { valid: false, errors } : { valid: true };
  }

  /**
   * Validate fields against a schema
   */
  function validateFields(data: Record<string, unknown>, schema: ValidationSchema): ValidationResult {
    const errors: ValidationError[] = [];

    for (const [field, rules] of Object.entries(schema)) {
      const value = data[field];

      if (rules.required && (value === undefined || value === null || value === '')) {
        errors.push({ field, message: `${field} is required`, code: 'REQUIRED_FIELD' });
        continue;
      }

      if (value === undefined || value === null) continue;

      if (rules.type) {
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        if (actualType !== rules.type) {
          errors.push({ field, message: `${field} must be of type ${rules.type}`, code: 'INVALID_TYPE' });
          continue;
        }
      }

      if (typeof value === 'string') {
        if (rules.minLength !== undefined && value.length < rules.minLength) {
          errors.push({ field, message: `${field} must be at least ${rules.minLength} characters`, code: 'MIN_LENGTH' });
        }
        if (rules.maxLength !== undefined && value.length > rules.maxLength) {
          errors.push({ field, message: `${field} must be at most ${rules.maxLength} characters`, code: 'MAX_LENGTH' });
        }
        if (rules.pattern && !rules.pattern.test(value)) {
          errors.push({ field, message: rules.customMessage || `${field} has invalid format`, code: 'INVALID_FORMAT' });
        }
      }

      if (typeof value === 'number') {
        if (rules.min !== undefined && value < rules.min) {
          errors.push({ field, message: `${field} must be at least ${rules.min}`, code: 'MIN_VALUE' });
        }
        if (rules.max !== undefined && value > rules.max) {
          errors.push({ field, message: `${field} must be at most ${rules.max}`, code: 'MAX_VALUE' });
        }
      }

      if (rules.custom && !rules.custom(value)) {
        errors.push({ field, message: rules.customMessage || `${field} is invalid`, code: 'CUSTOM_VALIDATION' });
      }
    }

    return errors.length > 0 ? { valid: false, errors } : { valid: true };
  }

  return {
    validateRestaurantExists,
    validateUserExists,
    validateRestaurantMembership,
    validateDateRange,
    validateDate,
    validateRequiredFields,
    validateFields,
  };
}

// Async validation functions using PostgreSQL
export async function validateRestaurantExistsAsync(restaurantId: string): Promise<ValidationResult> {
  if (!restaurantId || typeof restaurantId !== 'string') {
    return {
      valid: false,
      errors: [{ field: 'restaurantId', message: 'Restaurant ID is required', code: 'REQUIRED_FIELD' }],
    };
  }

  const result = await pgPool.query('SELECT "id" FROM "Restaurant" WHERE "id" = $1', [restaurantId]);
  
  if (result.rows.length === 0) {
    logger.debug('Restaurant not found', { restaurantId });
    return {
      valid: false,
      errors: [{ field: 'restaurantId', message: 'Restaurant not found', code: ErrorCodes.RESTAURANT_NOT_FOUND }],
    };
  }

  return { valid: true };
}

export async function validateUserExistsAsync(userId: string): Promise<ValidationResult> {
  if (!userId || typeof userId !== 'string') {
    return {
      valid: false,
      errors: [{ field: 'userId', message: 'User ID is required', code: 'REQUIRED_FIELD' }],
    };
  }

  const result = await pgPool.query('SELECT "id", "isActive" FROM "User" WHERE "id" = $1', [userId]);
  
  if (result.rows.length === 0) {
    logger.debug('User not found', { userId });
    return {
      valid: false,
      errors: [{ field: 'userId', message: 'User not found', code: ErrorCodes.USER_NOT_FOUND }],
    };
  }

  if (!result.rows[0].isActive) {
    logger.debug('User is inactive', { userId });
    return {
      valid: false,
      errors: [{ field: 'userId', message: 'User is inactive', code: 'USER_INACTIVE' }],
    };
  }

  return { valid: true };
}

export async function validateRestaurantMembershipAsync(userId: string, restaurantId: string): Promise<ValidationResult> {
  const restaurantResult = await validateRestaurantExistsAsync(restaurantId);
  if (!restaurantResult.valid) return restaurantResult;

  const userResult = await validateUserExistsAsync(userId);
  if (!userResult.valid) return userResult;

  const result = await pgPool.query(
    'SELECT "id" FROM "RestaurantUser" WHERE "userId" = $1 AND "restaurantId" = $2 AND "isActive" = true',
    [userId, restaurantId]
  );

  if (result.rows.length === 0) {
    logger.debug('User is not a member of restaurant', { userId, restaurantId });
    return {
      valid: false,
      errors: [{ field: 'membership', message: 'User is not a member of this restaurant', code: 'NOT_A_MEMBER' }],
    };
  }

  return { valid: true };
}

/**
 * Helper function to throw AppError from validation result
 */
export function throwIfInvalid(result: ValidationResult): void {
  if (!result.valid && result.errors && result.errors.length > 0) {
    const firstError = result.errors[0];
    
    if (firstError.code === ErrorCodes.RESTAURANT_NOT_FOUND) {
      throw AppError.badRequest(ErrorCodes.RESTAURANT_NOT_FOUND, firstError.message, { errors: result.errors });
    }
    
    if (firstError.code === ErrorCodes.USER_NOT_FOUND) {
      throw AppError.badRequest(ErrorCodes.USER_NOT_FOUND, firstError.message, { errors: result.errors });
    }

    throw AppError.badRequest(ErrorCodes.VALIDATION_FAILED, 'Validation failed', { errors: result.errors });
  }
}

export type ValidationService = ReturnType<typeof createValidationService>;
