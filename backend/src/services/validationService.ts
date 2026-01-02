/**
 * Validation Service
 * Centralized validation for input data
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.5
 */

import Database from 'better-sqlite3';
import { AppError, ErrorCodes } from '../middleware/errorHandler';
import { logger } from './loggerService';

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
 * Matches: YYYY-MM-DD, YYYY-MM-DDTHH:mm:ss, YYYY-MM-DDTHH:mm:ss.sssZ
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
 * Create a Validation Service instance
 */
export function createValidationService(db: Database.Database): IValidationService {
  /**
   * Validate that a restaurant exists
   * Requirements: 5.1
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

    const restaurant = db.prepare('SELECT id FROM Restaurant WHERE id = ?').get(restaurantId);
    
    if (!restaurant) {
      logger.debug('Restaurant not found', { restaurantId });
      return {
        valid: false,
        errors: [{
          field: 'restaurantId',
          message: 'Restaurant not found',
          code: ErrorCodes.RESTAURANT_NOT_FOUND,
        }],
      };
    }

    return { valid: true };
  }

  /**
   * Validate that a user exists and is active
   * Requirements: 5.2
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

    const user = db.prepare('SELECT id, isActive FROM User WHERE id = ?').get(userId) as { id: string; isActive: number } | undefined;
    
    if (!user) {
      logger.debug('User not found', { userId });
      return {
        valid: false,
        errors: [{
          field: 'userId',
          message: 'User not found',
          code: ErrorCodes.USER_NOT_FOUND,
        }],
      };
    }

    if (!user.isActive) {
      logger.debug('User is inactive', { userId });
      return {
        valid: false,
        errors: [{
          field: 'userId',
          message: 'User is inactive',
          code: 'USER_INACTIVE',
        }],
      };
    }

    return { valid: true };
  }

  /**
   * Validate that a user is a member of a restaurant
   * Requirements: 5.1, 5.2
   */
  function validateRestaurantMembership(userId: string, restaurantId: string): ValidationResult {
    // First validate both exist
    const restaurantResult = validateRestaurantExists(restaurantId);
    if (!restaurantResult.valid) {
      return restaurantResult;
    }

    const userResult = validateUserExists(userId);
    if (!userResult.valid) {
      return userResult;
    }

    // Check membership
    const membership = db.prepare(
      'SELECT id FROM RestaurantUser WHERE userId = ? AND restaurantId = ? AND isActive = 1'
    ).get(userId, restaurantId);

    if (!membership) {
      logger.debug('User is not a member of restaurant', { userId, restaurantId });
      return {
        valid: false,
        errors: [{
          field: 'membership',
          message: 'User is not a member of this restaurant',
          code: 'NOT_A_MEMBER',
        }],
      };
    }

    return { valid: true };
  }

  /**
   * Validate a single date string
   * Requirements: 5.5
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

    // Check format
    if (!ISO_DATE_PATTERN.test(dateString) && !SIMPLE_DATE_PATTERN.test(dateString)) {
      return {
        valid: false,
        errors: [{
          field: fieldName,
          message: `${fieldName} must be a valid ISO 8601 date format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)`,
          code: 'INVALID_DATE_FORMAT',
        }],
      };
    }

    // Check if it's a valid date
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
   * Requirements: 5.5
   */
  function validateDateRange(startDate: string, endDate: string): ValidationResult {
    const errors: ValidationError[] = [];

    // Validate start date
    const startResult = validateDate(startDate, 'startDate');
    if (!startResult.valid && startResult.errors) {
      errors.push(...startResult.errors);
    }

    // Validate end date
    const endResult = validateDate(endDate, 'endDate');
    if (!endResult.valid && endResult.errors) {
      errors.push(...endResult.errors);
    }

    // If either date is invalid, return errors
    if (errors.length > 0) {
      return { valid: false, errors };
    }

    // Check that start is before or equal to end
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
   * Validate required fields in data object
   * Requirements: 5.3
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

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    return { valid: true };
  }

  /**
   * Validate fields against a schema
   * Requirements: 5.3, 5.4
   */
  function validateFields(data: Record<string, unknown>, schema: ValidationSchema): ValidationResult {
    const errors: ValidationError[] = [];

    for (const [field, rules] of Object.entries(schema)) {
      const value = data[field];

      // Check required
      if (rules.required && (value === undefined || value === null || value === '')) {
        errors.push({
          field,
          message: `${field} is required`,
          code: 'REQUIRED_FIELD',
        });
        continue; // Skip other validations if required field is missing
      }

      // Skip validation if value is not provided and not required
      if (value === undefined || value === null) {
        continue;
      }

      // Check type
      if (rules.type) {
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        if (actualType !== rules.type) {
          errors.push({
            field,
            message: `${field} must be of type ${rules.type}`,
            code: 'INVALID_TYPE',
          });
          continue;
        }
      }

      // String validations
      if (typeof value === 'string') {
        if (rules.minLength !== undefined && value.length < rules.minLength) {
          errors.push({
            field,
            message: `${field} must be at least ${rules.minLength} characters`,
            code: 'MIN_LENGTH',
          });
        }

        if (rules.maxLength !== undefined && value.length > rules.maxLength) {
          errors.push({
            field,
            message: `${field} must be at most ${rules.maxLength} characters`,
            code: 'MAX_LENGTH',
          });
        }

        if (rules.pattern && !rules.pattern.test(value)) {
          errors.push({
            field,
            message: rules.customMessage || `${field} has invalid format`,
            code: 'INVALID_FORMAT',
          });
        }
      }

      // Number validations
      if (typeof value === 'number') {
        if (rules.min !== undefined && value < rules.min) {
          errors.push({
            field,
            message: `${field} must be at least ${rules.min}`,
            code: 'MIN_VALUE',
          });
        }

        if (rules.max !== undefined && value > rules.max) {
          errors.push({
            field,
            message: `${field} must be at most ${rules.max}`,
            code: 'MAX_VALUE',
          });
        }
      }

      // Custom validation
      if (rules.custom && !rules.custom(value)) {
        errors.push({
          field,
          message: rules.customMessage || `${field} is invalid`,
          code: 'CUSTOM_VALIDATION',
        });
      }
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    return { valid: true };
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

/**
 * Helper function to throw AppError from validation result
 */
export function throwIfInvalid(result: ValidationResult): void {
  if (!result.valid && result.errors && result.errors.length > 0) {
    const firstError = result.errors[0];
    
    // Map specific error codes to appropriate AppError
    if (firstError.code === ErrorCodes.RESTAURANT_NOT_FOUND) {
      throw AppError.badRequest(ErrorCodes.RESTAURANT_NOT_FOUND, firstError.message, {
        errors: result.errors,
      });
    }
    
    if (firstError.code === ErrorCodes.USER_NOT_FOUND) {
      throw AppError.badRequest(ErrorCodes.USER_NOT_FOUND, firstError.message, {
        errors: result.errors,
      });
    }

    throw AppError.badRequest(ErrorCodes.VALIDATION_FAILED, 'Validation failed', {
      errors: result.errors,
    });
  }
}

export type ValidationService = ReturnType<typeof createValidationService>;
