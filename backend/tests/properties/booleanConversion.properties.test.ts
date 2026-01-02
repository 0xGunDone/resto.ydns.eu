/**
 * Property-Based Tests for Boolean Field Conversion
 * **Feature: project-refactoring, Property 5: Boolean Field Conversion**
 * **Validates: Requirements 2.5**
 * 
 * Note: PostgreSQL has native boolean type, so these tests verify that
 * boolean values are preserved correctly (no 0/1 conversion needed).
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  convertBooleanFields,
  isBooleanFieldName,
  toSqliteBoolean,
  convertSqliteBoolean,
  isSqliteBoolean,
  isConverted,
} from '../../src/database/typeConverters';

describe('Boolean Field Conversion Properties', () => {
  /**
   * **Feature: project-refactoring, Property 5: Boolean Field Conversion**
   * 
   * For PostgreSQL, boolean fields should remain as native booleans.
   * The conversion function should preserve boolean values.
   */
  it('should preserve boolean fields as native booleans', () => {
    // Arbitrary for boolean field names (starting with 'is' or 'has')
    const booleanFieldNameArb = fc.oneof(
      fc.string({ minLength: 1, maxLength: 20 }).map(s => `is${s.charAt(0).toUpperCase()}${s.slice(1)}`),
      fc.string({ minLength: 1, maxLength: 20 }).map(s => `has${s.charAt(0).toUpperCase()}${s.slice(1)}`)
    );

    // Arbitrary for native boolean values (PostgreSQL returns native booleans)
    const booleanArb = fc.boolean();

    // Arbitrary for non-boolean field names
    const nonBooleanFieldNameArb = fc.string({ minLength: 1, maxLength: 20 })
      .filter(s => !s.startsWith('is') && !s.startsWith('has'));

    // Arbitrary for any non-boolean value
    const nonBooleanValueArb = fc.oneof(
      fc.string(),
      fc.integer(),
      fc.constant(null)
    );

    // Generate a row with mixed boolean and non-boolean fields
    const rowArb = fc.tuple(
      fc.array(fc.tuple(booleanFieldNameArb, booleanArb), { minLength: 1, maxLength: 5 }),
      fc.array(fc.tuple(nonBooleanFieldNameArb, nonBooleanValueArb), { minLength: 0, maxLength: 5 })
    ).map(([booleanFields, nonBooleanFields]) => {
      const row: Record<string, unknown> = {};
      for (const [name, value] of booleanFields) {
        row[name] = value;
      }
      for (const [name, value] of nonBooleanFields) {
        row[name] = value;
      }
      return row;
    });

    fc.assert(
      fc.property(rowArb, (row) => {
        const converted = convertBooleanFields(row);
        
        // Verify all boolean fields remain as native booleans
        for (const [key, originalValue] of Object.entries(row)) {
          if (isBooleanFieldName(key) && typeof originalValue === 'boolean') {
            const convertedValue = converted![key];
            // Must be a boolean
            expect(typeof convertedValue).toBe('boolean');
            expect(convertedValue).toBe(originalValue);
          }
        }
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Boolean values should be preserved (PostgreSQL native booleans)
   */
  it('should preserve boolean values', () => {
    const booleanFieldNameArb = fc.oneof(
      fc.string({ minLength: 1, maxLength: 10 }).map(s => `is${s}`),
      fc.string({ minLength: 1, maxLength: 10 }).map(s => `has${s}`)
    );

    fc.assert(
      fc.property(booleanFieldNameArb, fc.boolean(), (fieldName, boolValue) => {
        const row = { [fieldName]: boolValue };
        
        const converted = convertBooleanFields(row);
        
        // The converted value should match the original boolean
        expect(converted![fieldName]).toBe(boolValue);
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Non-boolean fields should not be modified
   */
  it('should not modify non-boolean fields', () => {
    const nonBooleanFieldNameArb = fc.string({ minLength: 1, maxLength: 20 })
      .filter(s => !s.startsWith('is') && !s.startsWith('has'));

    const valueArb = fc.oneof(
      fc.string(),
      fc.integer(),
      fc.constant(null),
      fc.boolean()
    );

    fc.assert(
      fc.property(nonBooleanFieldNameArb, valueArb, (fieldName, value) => {
        const row = { [fieldName]: value };
        const converted = convertBooleanFields(row);
        
        // Non-boolean fields should remain unchanged
        expect(converted![fieldName]).toBe(value);
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Idempotence - converting twice should give same result
   */
  it('should be idempotent - converting twice gives same result', () => {
    const booleanFieldNameArb = fc.string({ minLength: 1, maxLength: 10 }).map(s => `is${s}`);

    fc.assert(
      fc.property(booleanFieldNameArb, fc.boolean(), (fieldName, value) => {
        const row = { [fieldName]: value };
        
        const converted1 = convertBooleanFields(row);
        const converted2 = convertBooleanFields(converted1);
        
        // Both conversions should produce the same result
        expect(converted1![fieldName]).toBe(converted2![fieldName]);
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Round-trip conversion preserves value (PostgreSQL native booleans)
   */
  it('should support round-trip conversion', () => {
    fc.assert(
      fc.property(fc.boolean(), (boolValue) => {
        // For PostgreSQL, toSqliteBoolean and convertSqliteBoolean are identity functions
        const stored = toSqliteBoolean(boolValue);
        const retrieved = convertSqliteBoolean(stored);
        
        expect(retrieved).toBe(boolValue);
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Null and undefined handling
   */
  it('should handle null and undefined gracefully', () => {
    expect(convertBooleanFields(null)).toBe(null);
    expect(convertBooleanFields(undefined)).toBe(null);
  });

  /**
   * Property: isBooleanFieldName correctly identifies boolean fields
   */
  it('should correctly identify boolean field names', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 20 }), (suffix) => {
        // Fields starting with 'is' or 'has' should be identified as boolean
        expect(isBooleanFieldName(`is${suffix}`)).toBe(true);
        expect(isBooleanFieldName(`has${suffix}`)).toBe(true);
        
        // Fields not starting with 'is' or 'has' should not be identified as boolean
        if (!suffix.startsWith('is') && !suffix.startsWith('has')) {
          expect(isBooleanFieldName(suffix)).toBe(false);
        }
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: isSqliteBoolean correctly identifies boolean values (PostgreSQL)
   */
  it('should correctly identify boolean values', () => {
    fc.assert(
      fc.property(fc.boolean(), (value) => {
        expect(isSqliteBoolean(value)).toBe(true);
        return true;
      }),
      { numRuns: 100 }
    );

    // Non-boolean values should return false
    expect(isSqliteBoolean(0)).toBe(false);
    expect(isSqliteBoolean(1)).toBe(false);
    expect(isSqliteBoolean('true')).toBe(false);
    expect(isSqliteBoolean(null)).toBe(false);
  });
});
