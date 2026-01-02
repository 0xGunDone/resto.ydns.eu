/**
 * Property-Based Tests for Boolean Field Conversion
 * **Feature: project-refactoring, Property 5: Boolean Field Conversion**
 * **Validates: Requirements 2.5**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  convertBooleanFields,
  isBooleanFieldName,
  isSqliteBoolean,
  convertSqliteBoolean,
  toSqliteBoolean,
  isConverted,
} from '../../src/database/typeConverters';

describe('Boolean Field Conversion Properties', () => {
  /**
   * **Feature: project-refactoring, Property 5: Boolean Field Conversion**
   * 
   * For any database row containing boolean fields (fields starting with "is" or "has"),
   * after type conversion, the field values SHALL be true or false (not 0 or 1).
   */
  it('should convert all boolean fields from 0/1 to true/false', () => {
    // Arbitrary for boolean field names (starting with 'is' or 'has')
    const booleanFieldNameArb = fc.oneof(
      fc.string({ minLength: 1, maxLength: 20 }).map(s => `is${s.charAt(0).toUpperCase()}${s.slice(1)}`),
      fc.string({ minLength: 1, maxLength: 20 }).map(s => `has${s.charAt(0).toUpperCase()}${s.slice(1)}`)
    );

    // Arbitrary for SQLite boolean values (0 or 1)
    const sqliteBooleanArb = fc.constantFrom(0, 1) as fc.Arbitrary<0 | 1>;

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
      fc.array(fc.tuple(booleanFieldNameArb, sqliteBooleanArb), { minLength: 1, maxLength: 5 }),
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
        
        // Verify all boolean fields are now true/false
        for (const [key, originalValue] of Object.entries(row)) {
          if (isBooleanFieldName(key) && isSqliteBoolean(originalValue)) {
            const convertedValue = converted![key];
            // Must be a boolean, not 0 or 1
            expect(typeof convertedValue).toBe('boolean');
            expect(convertedValue === true || convertedValue === false).toBe(true);
            expect(convertedValue).not.toBe(0);
            expect(convertedValue).not.toBe(1);
          }
        }
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Boolean conversion preserves semantic meaning
   * 0 should become false, 1 should become true
   */
  it('should preserve semantic meaning: 0 -> false, 1 -> true', () => {
    const booleanFieldNameArb = fc.oneof(
      fc.string({ minLength: 1, maxLength: 10 }).map(s => `is${s}`),
      fc.string({ minLength: 1, maxLength: 10 }).map(s => `has${s}`)
    );

    fc.assert(
      fc.property(booleanFieldNameArb, fc.boolean(), (fieldName, boolValue) => {
        const sqliteValue = boolValue ? 1 : 0;
        const row = { [fieldName]: sqliteValue };
        
        const converted = convertBooleanFields(row);
        
        // The converted value should match the original boolean intent
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
      fc.constant(0),
      fc.constant(1)
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
    const sqliteBooleanArb = fc.constantFrom(0, 1) as fc.Arbitrary<0 | 1>;

    fc.assert(
      fc.property(booleanFieldNameArb, sqliteBooleanArb, (fieldName, value) => {
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
   * Property: Round-trip conversion preserves value
   */
  it('should support round-trip conversion', () => {
    fc.assert(
      fc.property(fc.boolean(), (boolValue) => {
        // Convert to SQLite and back
        const sqliteValue = toSqliteBoolean(boolValue);
        const backToBoolean = convertSqliteBoolean(sqliteValue);
        
        expect(backToBoolean).toBe(boolValue);
        
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
});
