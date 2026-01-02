/**
 * Error Handler Middleware
 * Centralized error handling with consistent response format
 * 
 * Requirements: 8.1, 8.2, 8.3
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../services/loggerService';

/**
 * Standard API error response format
 */
export interface ApiErrorResponse {
  status: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
  stack?: string;
}

/**
 * Error codes for consistent error identification
 */
export const ErrorCodes = {
  // Authentication
  AUTH_TOKEN_MISSING: 'AUTH_TOKEN_MISSING',
  AUTH_TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_USER_INACTIVE: 'AUTH_USER_INACTIVE',
  
  // Authorization
  FORBIDDEN_NO_PERMISSION: 'FORBIDDEN_NO_PERMISSION',
  FORBIDDEN_NO_RESTAURANT_ACCESS: 'FORBIDDEN_NO_RESTAURANT_ACCESS',
  
  // Validation
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  RESTAURANT_NOT_FOUND: 'RESTAURANT_NOT_FOUND',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  POSITION_NOT_FOUND: 'POSITION_NOT_FOUND',
  
  // Internal errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  
  // Rate limiting
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

/**
 * Custom application error class
 * Use this to throw errors with consistent format
 */
export class AppError extends Error {
  public readonly status: number;
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown>;

  constructor(
    status: number,
    code: ErrorCode,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
    
    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Creates a 400 Bad Request error
   */
  static badRequest(code: ErrorCode, message: string, details?: Record<string, unknown>): AppError {
    return new AppError(400, code, message, details);
  }

  /**
   * Creates a 401 Unauthorized error
   */
  static unauthorized(code: ErrorCode, message: string): AppError {
    return new AppError(401, code, message);
  }

  /**
   * Creates a 403 Forbidden error
   */
  static forbidden(code: ErrorCode, message: string): AppError {
    return new AppError(403, code, message);
  }

  /**
   * Creates a 404 Not Found error
   */
  static notFound(code: ErrorCode, message: string): AppError {
    return new AppError(404, code, message);
  }

  /**
   * Creates a 429 Too Many Requests error
   */
  static rateLimited(message: string = 'Too many requests'): AppError {
    return new AppError(429, ErrorCodes.RATE_LIMIT_EXCEEDED, message);
  }

  /**
   * Creates a 500 Internal Server Error
   */
  static internal(message: string = 'Internal server error'): AppError {
    return new AppError(500, ErrorCodes.INTERNAL_ERROR, message);
  }
}

/**
 * Checks if we're in production environment
 */
function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Builds the error response object
 */
function buildErrorResponse(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
  stack?: string
): ApiErrorResponse {
  const response: ApiErrorResponse = {
    status,
    code,
    message,
    timestamp: new Date().toISOString(),
  };

  if (details && Object.keys(details).length > 0) {
    response.details = details;
  }

  // Only include stack trace in non-production environments
  if (stack && !isProduction()) {
    response.stack = stack;
  }

  return response;
}

/**
 * Express error handling middleware
 * Must be registered after all routes
 */
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Handle AppError instances
  if (err instanceof AppError) {
    logger.warn(`AppError: ${err.code}`, {
      status: err.status,
      message: err.message,
      action: req.method + ' ' + req.path,
      userId: (req as any).user?.id,
    });

    const response = buildErrorResponse(
      err.status,
      err.code,
      err.message,
      err.details,
      err.stack
    );

    res.status(err.status).json(response);
    return;
  }

  // Handle unexpected errors
  logger.error('Unexpected error', {
    error: err.message,
    action: req.method + ' ' + req.path,
    userId: (req as any).user?.id,
  });

  const response = buildErrorResponse(
    500,
    ErrorCodes.INTERNAL_ERROR,
    isProduction() ? 'Internal server error' : err.message,
    undefined,
    err.stack
  );

  res.status(500).json(response);
};

/**
 * Async handler wrapper to catch errors in async route handlers
 * Usage: app.get('/route', asyncHandler(async (req, res) => { ... }))
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
