/**
 * Property-Based Tests for Validation Service
 * 
 * Tests correctness properties for entity validation, required fields, and date format
 * 
 * Note: These tests focus on validation logic that doesn't require database access.
 * Database-dependent validation is tested separately with integration tests.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fc from 'fast-check';
import { createValidationService, ValidationResult } from '../../src/services/validationService';
import { ErrorCodes } from '../../src/middleware/errorHandler';

// Create validation service (sync version for unit tests)
let validationService: ReturnType<typeof createValidationService>;

beforeAll(() => {
  validationService = createValidationService();
});

describe('Validation Service Properties', () => {
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

  /**
   * Property: ID validation should check format
   */
  describe('ID Format Validation', () => {
    it('should reject empty or invalid restaurant IDs', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('', null, undefined),
          (invalidId) => {
            const result = validationService.validateRestaurantExists(invalidId as any);
            
            expect(result.valid).toBe(false);
            expect(result.errors).toBeDefined();
            expect(result.errors![0].code).toBe('REQUIRED_FIELD');
            
            return true;
          }
        ),
        { numRuns: 3 }
      );
    });

    it('should reject empty or invalid user IDs', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('', null, undefined),
          (invalidId) => {
            const result = validationService.validateUserExists(invalidId as any);
            
            expect(result.valid).toBe(false);
            expect(result.errors).toBeDefined();
            expect(result.errors![0].code).toBe('REQUIRED_FIELD');
            
            return true;
          }
        ),
        { numRuns: 3 }
      );
    });

    it('should accept valid string IDs (format check only)', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          (validId) => {
            // Sync validation only checks format, not DB existence
            const restaurantResult = validationService.validateRestaurantExists(validId);
            const userResult = validationService.validateUserExists(validId);
            
            // Format is valid, so sync validation passes
            expect(restaurantResult.valid).toBe(true);
            expect(userResult.valid).toBe(true);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property: Field validation with type checking
   */
  describe('Field Type Validation', () => {
    it('should validate string type correctly', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          (value) => {
            const schema = { testField: { type: 'string' as const } };
            const result = validationService.validateFields({ testField: value }, schema);
            
            expect(result.valid).toBe(true);
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should validate number type correctly', () => {
      fc.assert(
        fc.property(
          fc.integer(),
          (value) => {
            const schema = { testField: { type: 'number' as const } };
            const result = validationService.validateFields({ testField: value }, schema);
            
            expect(result.valid).toBe(true);
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject wrong types', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          (value) => {
            const schema = { testField: { type: 'number' as const } };
            const result = validationService.validateFields({ testField: value }, schema);
            
            expect(result.valid).toBe(false);
            expect(result.errors![0].code).toBe('INVALID_TYPE');
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should validate min/max length for strings', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10 }),
          fc.integer({ min: 11, max: 50 }),
          (minLen, maxLen) => {
            const schema = { testField: { minLength: minLen, maxLength: maxLen } };
            
            // String within range
            const validString = 'a'.repeat(Math.floor((minLen + maxLen) / 2));
            const validResult = validationService.validateFields({ testField: validString }, schema);
            expect(validResult.valid).toBe(true);
            
            // String too short
            const shortString = 'a'.repeat(minLen - 1);
            const shortResult = validationService.validateFields({ testField: shortString }, schema);
            expect(shortResult.valid).toBe(false);
            
            // String too long
            const longString = 'a'.repeat(maxLen + 1);
            const longResult = validationService.validateFields({ testField: longString }, schema);
            expect(longResult.valid).toBe(false);
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should validate min/max for numbers', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 50 }),
          fc.integer({ min: 51, max: 100 }),
          (minVal, maxVal) => {
            const schema = { testField: { min: minVal, max: maxVal } };
            
            // Number within range
            const validNum = Math.floor((minVal + maxVal) / 2);
            const validResult = validationService.validateFields({ testField: validNum }, schema);
            expect(validResult.valid).toBe(true);
            
            // Number too small
            const smallResult = validationService.validateFields({ testField: minVal - 1 }, schema);
            expect(smallResult.valid).toBe(false);
            
            // Number too large
            const largeResult = validationService.validateFields({ testField: maxVal + 1 }, schema);
            expect(largeResult.valid).toBe(false);
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
