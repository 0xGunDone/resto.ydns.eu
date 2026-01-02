/**
 * Property-Based Tests for Error Handling
 * 
 * Tests correctness properties for error response format and stack trace hiding
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { Request, Response } from 'express';
import { 
  AppError, 
  ErrorCodes, 
  errorHandler,
  ApiErrorResponse 
} from '../../src/middleware/errorHandler';
import { createMockRequest, createMockResponse, createMockNext } from '../helpers';

// Mock the logger to prevent console output during tests
vi.mock('../../src/services/loggerService', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Error Handling Properties', () => {
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  /**
   * **Feature: project-refactoring, Property 15: Error Response Format Consistency**
   * **Validates: Requirements 8.1, 8.2**
   * 
   * For any API error response, the body SHALL contain at minimum:
   * - status (number)
   * - message (string)
   * - timestamp (ISO 8601 string)
   */
  describe('Property 15: Error Response Format Consistency', () => {
    // Arbitrary for valid HTTP error status codes
    const httpErrorStatusArb = fc.integer({ min: 400, max: 599 });
    
    // Arbitrary for error codes
    const errorCodeArb = fc.constantFrom(...Object.values(ErrorCodes));
    
    // Arbitrary for non-empty error messages
    const errorMessageArb = fc.string({ minLength: 1, maxLength: 200 })
      .filter(s => s.trim().length > 0);

    it('should always include status, message, and timestamp in AppError responses', () => {
      fc.assert(
        fc.property(
          httpErrorStatusArb,
          errorCodeArb,
          errorMessageArb,
          (status, code, message) => {
            const req = createMockRequest() as Request;
            const res = createMockResponse();
            const next = createMockNext();
            
            const error = new AppError(status, code, message);
            
            errorHandler(error, req, res as unknown as Response, next);
            
            // Verify status was called with correct code
            expect(res.status).toHaveBeenCalledWith(status);
            
            // Verify json was called
            expect(res.json).toHaveBeenCalled();
            
            // Get the response body
            const responseBody = res.json.mock.calls[0][0] as ApiErrorResponse;
            
            // Property: status must be a number
            expect(typeof responseBody.status).toBe('number');
            expect(responseBody.status).toBe(status);
            
            // Property: message must be a string
            expect(typeof responseBody.message).toBe('string');
            expect(responseBody.message).toBe(message);
            
            // Property: timestamp must be a valid ISO 8601 string
            expect(typeof responseBody.timestamp).toBe('string');
            const parsedDate = new Date(responseBody.timestamp);
            expect(parsedDate.toISOString()).toBe(responseBody.timestamp);
            
            // Property: code must be present
            expect(typeof responseBody.code).toBe('string');
            expect(responseBody.code).toBe(code);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should always include status, message, and timestamp in unexpected error responses', () => {
      fc.assert(
        fc.property(
          errorMessageArb,
          (message) => {
            process.env.NODE_ENV = 'development';
            
            const req = createMockRequest() as Request;
            const res = createMockResponse();
            const next = createMockNext();
            
            const error = new Error(message);
            
            errorHandler(error, req, res as unknown as Response, next);
            
            // Verify status was called with 500
            expect(res.status).toHaveBeenCalledWith(500);
            
            // Get the response body
            const responseBody = res.json.mock.calls[0][0] as ApiErrorResponse;
            
            // Property: status must be 500 for unexpected errors
            expect(typeof responseBody.status).toBe('number');
            expect(responseBody.status).toBe(500);
            
            // Property: message must be a string
            expect(typeof responseBody.message).toBe('string');
            
            // Property: timestamp must be a valid ISO 8601 string
            expect(typeof responseBody.timestamp).toBe('string');
            const parsedDate = new Date(responseBody.timestamp);
            expect(parsedDate.toISOString()).toBe(responseBody.timestamp);
            
            // Property: code must be INTERNAL_ERROR
            expect(responseBody.code).toBe(ErrorCodes.INTERNAL_ERROR);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: project-refactoring, Property 16: Production Stack Trace Hiding**
   * **Validates: Requirements 8.3**
   * 
   * For any 500 Internal Server Error in production mode,
   * the response body SHALL NOT contain a stack field.
   */
  describe('Property 16: Production Stack Trace Hiding', () => {
    // Arbitrary for error messages
    const errorMessageArb = fc.string({ minLength: 1, maxLength: 200 })
      .filter(s => s.trim().length > 0);

    it('should never include stack trace in production for AppError', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 400, max: 599 }),
          fc.constantFrom(...Object.values(ErrorCodes)),
          errorMessageArb,
          (status, code, message) => {
            process.env.NODE_ENV = 'production';
            
            const req = createMockRequest() as Request;
            const res = createMockResponse();
            const next = createMockNext();
            
            const error = new AppError(status, code, message);
            
            errorHandler(error, req, res as unknown as Response, next);
            
            const responseBody = res.json.mock.calls[0][0] as ApiErrorResponse;
            
            // Property: stack must NOT be present in production
            expect(responseBody.stack).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should never include stack trace in production for unexpected errors', () => {
      fc.assert(
        fc.property(
          errorMessageArb,
          (message) => {
            process.env.NODE_ENV = 'production';
            
            const req = createMockRequest() as Request;
            const res = createMockResponse();
            const next = createMockNext();
            
            const error = new Error(message);
            
            errorHandler(error, req, res as unknown as Response, next);
            
            const responseBody = res.json.mock.calls[0][0] as ApiErrorResponse;
            
            // Property: stack must NOT be present in production
            expect(responseBody.stack).toBeUndefined();
            
            // Property: message should be generic in production
            expect(responseBody.message).toBe('Internal server error');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should include stack trace in development for unexpected errors', () => {
      fc.assert(
        fc.property(
          errorMessageArb,
          (message) => {
            process.env.NODE_ENV = 'development';
            
            const req = createMockRequest() as Request;
            const res = createMockResponse();
            const next = createMockNext();
            
            const error = new Error(message);
            
            errorHandler(error, req, res as unknown as Response, next);
            
            const responseBody = res.json.mock.calls[0][0] as ApiErrorResponse;
            
            // Property: stack SHOULD be present in development
            expect(typeof responseBody.stack).toBe('string');
            expect(responseBody.stack!.length).toBeGreaterThan(0);
            
            // Property: message should be the actual error message in development
            expect(responseBody.message).toBe(message);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
