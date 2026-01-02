/**
 * Property-Based Tests for Validation Service
 * 
 * Tests correctness properties for entity validation, required fields, and date format
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fc from 'fast-check';
import Database from 'better-sqlite3';
import { createValidationService, ValidationResult } from '../../src/services/validationService';
import { ErrorCodes } from '../../src/middleware/errorHandler';

// In-memory database for testing
let db: Database.Database;
let validationService: ReturnType<typeof createValidationService>;

// Test data IDs
const EXISTING_USER_ID = 'test-user-exists-001';
const EXISTING_RESTAURANT_ID = 'test-restaurant-exists-001';
const INACTIVE_USER_ID = 'test-user-inactive-001';

beforeAll(() => {
  // Create in-memory database
  db = new Database(':memory:');
  
  // Create minimal schema for testing
  db.exec(`
    CREATE TABLE User (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      password TEXT NOT NULL,
      firstName TEXT,
      lastName TEXT,
      phone TEXT,
      role TEXT NOT NULL DEFAULT 'EMPLOYEE',
      isActive INTEGER NOT NULL DEFAULT 1,
      telegramId TEXT,
      twoFactorSecret TEXT,
      twoFactorEnabled INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    
    CREATE TABLE Restaurant (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT,
      phone TEXT,
      managerId TEXT,
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    
    CREATE TABLE RestaurantUser (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      restaurantId TEXT NOT NULL,
      positionId TEXT NOT NULL,
      departmentId TEXT,
      hourlyRate REAL,
      hireDate TEXT,
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `);
  
  // Insert test data
  const now = new Date().toISOString();
  
  // Active user
  db.prepare(`
    INSERT INTO User (id, email, password, firstName, lastName, role, isActive, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(EXISTING_USER_ID, 'test@example.com', 'hash', 'Test', 'User', 'EMPLOYEE', 1, now, now);
  
  // Inactive user
  db.prepare(`
    INSERT INTO User (id, email, password, firstName, lastName, role, isActive, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(INACTIVE_USER_ID, 'inactive@example.com', 'hash', 'Inactive', 'User', 'EMPLOYEE', 0, now, now);
  
  // Restaurant
  db.prepare(`
    INSERT INTO Restaurant (id, name, isActive, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?)
  `).run(EXISTING_RESTAURANT_ID, 'Test Restaurant', 1, now, now);
  
  // Restaurant membership
  db.prepare(`
    INSERT INTO RestaurantUser (id, userId, restaurantId, positionId, isActive, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('ru-001', EXISTING_USER_ID, EXISTING_RESTAURANT_ID, 'pos-001', 1, now, now);
  
  validationService = createValidationService(db);
});

afterAll(() => {
  db.close();
});

describe('Validation Service Properties', () => {
  /**
   * **Feature: project-refactoring, Property 10: Entity Existence Validation**
   * **Validates: Requirements 5.1, 5.2**
   * 
   * For any API request containing a restaurantId that does not exist in the database,
   * the validation SHALL return valid: false with error code RESTAURANT_NOT_FOUND.
   * Similarly for userId with USER_NOT_FOUND.
   */
  describe('Property 10: Entity Existence Validation', () => {
    // Arbitrary for non-existent IDs (UUIDs that won't match our test data)
    const nonExistentIdArb = fc.uuid().filter(id => 
      id !== EXISTING_USER_ID && 
      id !== EXISTING_RESTAURANT_ID &&
      id !== INACTIVE_USER_ID
    );

    it('should return RESTAURANT_NOT_FOUND for any non-existent restaurant ID', () => {
      fc.assert(
        fc.property(
          nonExistentIdArb,
          (restaurantId) => {
            const result = validationService.validateRestaurantExists(restaurantId);
            
            // Property: validation must fail
            expect(result.valid).toBe(false);
            
            // Property: must have errors
            expect(result.errors).toBeDefined();
            expect(result.errors!.length).toBeGreaterThan(0);
            
            // Property: error code must be RESTAURANT_NOT_FOUND
            const error = result.errors![0];
            expect(error.code).toBe(ErrorCodes.RESTAURANT_NOT_FOUND);
            expect(error.field).toBe('restaurantId');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return USER_NOT_FOUND for any non-existent user ID', () => {
      fc.assert(
        fc.property(
          nonExistentIdArb,
          (userId) => {
            const result = validationService.validateUserExists(userId);
            
            // Property: validation must fail
            expect(result.valid).toBe(false);
            
            // Property: must have errors
            expect(result.errors).toBeDefined();
            expect(result.errors!.length).toBeGreaterThan(0);
            
            // Property: error code must be USER_NOT_FOUND
            const error = result.errors![0];
            expect(error.code).toBe(ErrorCodes.USER_NOT_FOUND);
            expect(error.field).toBe('userId');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return valid: true for existing restaurant ID', () => {
      const result = validationService.validateRestaurantExists(EXISTING_RESTAURANT_ID);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should return valid: true for existing active user ID', () => {
      const result = validationService.validateUserExists(EXISTING_USER_ID);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should return error for inactive user', () => {
      const result = validationService.validateUserExists(INACTIVE_USER_ID);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0].code).toBe('USER_INACTIVE');
    });
  });


  /**
   * **Feature: project-refactoring, Property 11: Required Fields Validation**
   * **Validates: Requirements 5.3, 5.4, 8.4**
   * 
   * For any create or update request missing a required field,
   * the validation SHALL return valid: false with error details specifying which field is missing.
   */
  describe('Property 11: Required Fields Validation', () => {
    // Reserved JavaScript property names to avoid
    const reservedNames = new Set([
      'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf',
      'propertyIsEnumerable', 'toLocaleString', 'constructor',
      '__proto__', '__defineGetter__', '__defineSetter__',
      '__lookupGetter__', '__lookupSetter__'
    ]);
    
    // Arbitrary for field names - avoid reserved names
    const fieldNameArb = fc.string({ minLength: 2, maxLength: 20 })
      .filter(s => /^[a-zA-Z][a-zA-Z0-9]*$/.test(s) && !reservedNames.has(s));

    it('should return error for each missing required field', () => {
      fc.assert(
        fc.property(
          fc.array(fieldNameArb, { minLength: 1, maxLength: 5 }),
          (fieldNames) => {
            // Create unique field names
            const uniqueFields = [...new Set(fieldNames)];
            if (uniqueFields.length === 0) return true;
            
            // Create schema with all fields required
            const schema: Record<string, { required: boolean }> = {};
            for (const field of uniqueFields) {
              schema[field] = { required: true };
            }
            
            // Empty data object - all fields missing
            const data: Record<string, unknown> = {};
            
            const result = validationService.validateRequiredFields(data, schema);
            
            // Property: validation must fail
            expect(result.valid).toBe(false);
            
            // Property: must have errors for each missing field
            expect(result.errors).toBeDefined();
            expect(result.errors!.length).toBe(uniqueFields.length);
            
            // Property: each error must specify the field name
            const errorFields = result.errors!.map(e => e.field);
            for (const field of uniqueFields) {
              expect(errorFields).toContain(field);
            }
            
            // Property: each error must have REQUIRED_FIELD code
            for (const error of result.errors!) {
              expect(error.code).toBe('REQUIRED_FIELD');
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return valid: true when all required fields are present', () => {
      fc.assert(
        fc.property(
          fc.array(fieldNameArb, { minLength: 1, maxLength: 5 }),
          fc.array(fc.string({ minLength: 1 }), { minLength: 5, maxLength: 10 }),
          (fieldNames, values) => {
            // Create unique field names
            const uniqueFields = [...new Set(fieldNames)];
            if (uniqueFields.length === 0) return true;
            
            // Create schema with all fields required
            const schema: Record<string, { required: boolean }> = {};
            const data: Record<string, unknown> = {};
            
            for (let i = 0; i < uniqueFields.length; i++) {
              schema[uniqueFields[i]] = { required: true };
              data[uniqueFields[i]] = values[i % values.length] || 'value';
            }
            
            const result = validationService.validateRequiredFields(data, schema);
            
            // Property: validation must pass
            expect(result.valid).toBe(true);
            expect(result.errors).toBeUndefined();
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should detect null and undefined as missing values', () => {
      fc.assert(
        fc.property(
          fieldNameArb,
          fc.constantFrom(null, undefined, ''),
          (fieldName, emptyValue) => {
            const schema = { [fieldName]: { required: true } };
            const data: Record<string, unknown> = { [fieldName]: emptyValue };
            
            const result = validationService.validateRequiredFields(data, schema);
            
            // Property: validation must fail for null/undefined/empty string
            expect(result.valid).toBe(false);
            expect(result.errors).toBeDefined();
            expect(result.errors![0].field).toBe(fieldName);
            expect(result.errors![0].code).toBe('REQUIRED_FIELD');
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: project-refactoring, Property 12: Date Format Validation**
   * **Validates: Requirements 5.5**
   * 
   * For any request containing date parameters that are not valid ISO 8601 date strings,
   * the validation SHALL return valid: false with error details about the invalid date.
   */
  describe('Property 12: Date Format Validation', () => {
    // Generate valid dates using integer components to avoid invalid date issues
    const validDateArb = fc.record({
      year: fc.integer({ min: 2000, max: 2099 }),
      month: fc.integer({ min: 1, max: 12 }),
      day: fc.integer({ min: 1, max: 28 }), // Use 28 to avoid month-end issues
    }).map(({ year, month, day }) => {
      const m = month.toString().padStart(2, '0');
      const d = day.toString().padStart(2, '0');
      return `${year}-${m}-${d}`;
    });
    
    // Arbitrary for valid ISO 8601 datetime
    const validDateTimeArb = fc.record({
      year: fc.integer({ min: 2000, max: 2099 }),
      month: fc.integer({ min: 1, max: 12 }),
      day: fc.integer({ min: 1, max: 28 }),
      hour: fc.integer({ min: 0, max: 23 }),
      minute: fc.integer({ min: 0, max: 59 }),
      second: fc.integer({ min: 0, max: 59 }),
    }).map(({ year, month, day, hour, minute, second }) => {
      const m = month.toString().padStart(2, '0');
      const d = day.toString().padStart(2, '0');
      const h = hour.toString().padStart(2, '0');
      const min = minute.toString().padStart(2, '0');
      const s = second.toString().padStart(2, '0');
      return `${year}-${m}-${d}T${h}:${min}:${s}.000Z`;
    });
    
    // Arbitrary for invalid date strings
    const invalidDateArb = fc.oneof(
      // Random strings that aren't dates
      fc.string({ minLength: 1, maxLength: 20 }).filter(s => 
        !/^\d{4}-\d{2}-\d{2}/.test(s) && s.trim().length > 0
      ),
      // Invalid date formats
      fc.constantFrom(
        '2024/01/15',      // Wrong separator
        '15-01-2024',      // Wrong order
        '2024-13-01',      // Invalid month
        '2024-01-32',      // Invalid day
        'not-a-date',
        '2024-1-1',        // Missing leading zeros
        '24-01-15',        // Two-digit year
      )
    );

    it('should accept valid ISO 8601 date strings (YYYY-MM-DD)', () => {
      fc.assert(
        fc.property(
          validDateArb,
          (dateString) => {
            const result = validationService.validateDate(dateString);
            
            // Property: validation must pass for valid dates
            expect(result.valid).toBe(true);
            expect(result.errors).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should accept valid ISO 8601 datetime strings', () => {
      fc.assert(
        fc.property(
          validDateTimeArb,
          (dateString) => {
            const result = validationService.validateDate(dateString);
            
            // Property: validation must pass for valid datetimes
            expect(result.valid).toBe(true);
            expect(result.errors).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject invalid date format strings', () => {
      fc.assert(
        fc.property(
          invalidDateArb,
          (dateString) => {
            const result = validationService.validateDate(dateString);
            
            // Property: validation must fail for invalid dates
            expect(result.valid).toBe(false);
            expect(result.errors).toBeDefined();
            expect(result.errors!.length).toBeGreaterThan(0);
            
            // Property: error must indicate invalid date
            const error = result.errors![0];
            expect(['INVALID_DATE_FORMAT', 'INVALID_DATE']).toContain(error.code);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should validate date ranges correctly', () => {
      fc.assert(
        fc.property(
          validDateArb,
          validDateArb,
          (date1, date2) => {
            const [startDate, endDate] = date1 <= date2 ? [date1, date2] : [date2, date1];
            
            const result = validationService.validateDateRange(startDate, endDate);
            
            // Property: validation must pass when start <= end
            expect(result.valid).toBe(true);
            expect(result.errors).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject date ranges where start > end', () => {
      fc.assert(
        fc.property(
          validDateArb,
          validDateArb,
          (date1, date2) => {
            // Only test when dates are different
            if (date1 === date2) return true;
            
            const [startDate, endDate] = date1 > date2 ? [date1, date2] : [date2, date1];
            
            // Ensure start is actually after end
            if (startDate <= endDate) return true;
            
            const result = validationService.validateDateRange(startDate, endDate);
            
            // Property: validation must fail when start > end
            expect(result.valid).toBe(false);
            expect(result.errors).toBeDefined();
            expect(result.errors![0].code).toBe('INVALID_DATE_RANGE');
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
