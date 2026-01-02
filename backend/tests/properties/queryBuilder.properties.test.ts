/**
 * Property-Based Tests for Query Builder
 * **Feature: project-refactoring, Property 13: OR Condition Query Correctness**
 * **Validates: Requirements 6.1**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  buildWhereClause,
  buildSelectQuery,
  buildSetClause,
  WhereClause,
} from '../../src/database/queryBuilder';

describe('Query Builder Properties', () => {
  /**
   * **Feature: project-refactoring, Property 13: OR Condition Query Correctness**
   * 
   * For any query with OR conditions [A, B], the result set SHALL equal
   * the union of results from query with condition A and query with condition B.
   * 
   * We test this by verifying that OR conditions are properly wrapped in parentheses
   * and combined with OR operator.
   */
  it('should correctly build OR conditions with proper parentheses', () => {
    // Arbitrary for simple field names
    const fieldNameArb = fc.stringMatching(/^[a-z][a-zA-Z0-9]{0,10}$/);
    
    // Arbitrary for simple values
    const simpleValueArb = fc.oneof(
      fc.string({ minLength: 1, maxLength: 10 }),
      fc.integer({ min: 0, max: 1000 })
    );

    fc.assert(
      fc.property(
        fieldNameArb,
        simpleValueArb,
        fieldNameArb,
        simpleValueArb,
        (field1, value1, field2, value2) => {
          // Build a query with OR conditions
          const where: WhereClause = {
            OR: [
              { [field1]: value1 },
              { [field2]: value2 },
            ],
          };

          const { sql, params } = buildWhereClause(where);

          // The SQL should contain OR
          expect(sql).toContain('OR');
          
          // The SQL should have proper parentheses around OR conditions
          expect(sql).toMatch(/\(\s*\([^)]+\)\s+OR\s+\([^)]+\)\s*\)/);
          
          // Parameters should contain both values
          expect(params).toHaveLength(2);
          expect(params).toContain(value1);
          expect(params).toContain(value2);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: OR conditions combined with AND should have correct precedence
   */
  it('should maintain correct precedence when OR is combined with AND', () => {
    const fieldNameArb = fc.stringMatching(/^[a-z][a-zA-Z0-9]{0,10}$/);
    const simpleValueArb = fc.integer({ min: 0, max: 1000 });

    fc.assert(
      fc.property(
        fieldNameArb,
        simpleValueArb,
        fieldNameArb,
        simpleValueArb,
        fieldNameArb,
        simpleValueArb,
        (field1, value1, field2, value2, field3, value3) => {
          // Build: field3 = value3 AND (field1 = value1 OR field2 = value2)
          const where: WhereClause = {
            [field3]: value3,
            OR: [
              { [field1]: value1 },
              { [field2]: value2 },
            ],
          };

          const { sql, params } = buildWhereClause(where);

          // Should have WHERE clause
          expect(sql).toMatch(/^WHERE\s+/);
          
          // Should contain AND connecting the regular condition with OR group
          expect(sql).toContain('AND');
          expect(sql).toContain('OR');
          
          // OR conditions should be wrapped in parentheses
          expect(sql).toMatch(/\(\s*\([^)]+\)\s+OR\s+\([^)]+\)\s*\)/);
          
          // All three values should be in params
          expect(params).toHaveLength(3);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Empty OR array should not affect query
   */
  it('should handle empty OR array gracefully', () => {
    // Use field names that don't contain "OR" to avoid false positives in the check
    const fieldNameArb = fc.stringMatching(/^[a-z][a-ce-np-z0-9]{0,10}$/).filter(
      s => !s.toUpperCase().includes('OR')
    );
    const simpleValueArb = fc.integer({ min: 0, max: 1000 });

    fc.assert(
      fc.property(fieldNameArb, simpleValueArb, (field, value) => {
        const where: WhereClause = {
          [field]: value,
          OR: [],
        };

        const { sql, params } = buildWhereClause(where);

        // Should still have the regular condition
        expect(sql).toContain(`${field} = ?`);
        expect(params).toHaveLength(1);
        expect(params[0]).toBe(value);
        
        // Should NOT contain OR keyword since array is empty
        // Check for ' OR ' with spaces to avoid matching field names containing 'or'
        expect(sql).not.toMatch(/\sOR\s/);

        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Single OR condition should work correctly
   */
  it('should handle single OR condition', () => {
    const fieldNameArb = fc.stringMatching(/^[a-z][a-zA-Z0-9]{0,10}$/);
    const simpleValueArb = fc.integer({ min: 0, max: 1000 });

    fc.assert(
      fc.property(fieldNameArb, simpleValueArb, (field, value) => {
        const where: WhereClause = {
          OR: [{ [field]: value }],
        };

        const { sql, params } = buildWhereClause(where);

        // Should have the condition
        expect(sql).toContain(`${field} = ?`);
        expect(params).toHaveLength(1);
        expect(params[0]).toBe(value);

        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Multiple OR conditions should all be included
   */
  it('should include all OR conditions', () => {
    const fieldNameArb = fc.stringMatching(/^[a-z][a-zA-Z0-9]{0,10}$/);
    const simpleValueArb = fc.integer({ min: 0, max: 1000 });

    fc.assert(
      fc.property(
        fc.array(fc.tuple(fieldNameArb, simpleValueArb), { minLength: 2, maxLength: 5 }),
        (conditions) => {
          const where: WhereClause = {
            OR: conditions.map(([field, value]) => ({ [field]: value })),
          };

          const { sql, params } = buildWhereClause(where);

          // Should have correct number of parameters
          expect(params).toHaveLength(conditions.length);
          
          // All values should be in params
          for (const [, value] of conditions) {
            expect(params).toContain(value);
          }
          
          // Should have OR between conditions (n-1 ORs for n conditions)
          const orCount = (sql.match(/\sOR\s/g) || []).length;
          expect(orCount).toBe(conditions.length - 1);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Null values should use IS NULL
   */
  it('should use IS NULL for null values', () => {
    const fieldNameArb = fc.stringMatching(/^[a-z][a-zA-Z0-9]{0,10}$/);

    fc.assert(
      fc.property(fieldNameArb, (field) => {
        const where: WhereClause = { [field]: null };
        const { sql, params } = buildWhereClause(where);

        expect(sql).toContain(`${field} IS NULL`);
        expect(params).toHaveLength(0);

        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: IN operator should create correct placeholders
   */
  it('should create correct placeholders for IN operator', () => {
    const fieldNameArb = fc.stringMatching(/^[a-z][a-zA-Z0-9]{0,10}$/);
    const valuesArb = fc.array(fc.integer({ min: 0, max: 1000 }), { minLength: 1, maxLength: 5 });

    fc.assert(
      fc.property(fieldNameArb, valuesArb, (field, values) => {
        const where: WhereClause = { [field]: { in: values } };
        const { sql, params } = buildWhereClause(where);

        // Should have IN clause
        expect(sql).toContain(`${field} IN (`);
        
        // Should have correct number of placeholders
        const placeholders = sql.match(/\?/g) || [];
        expect(placeholders).toHaveLength(values.length);
        
        // Params should match values
        expect(params).toEqual(values);

        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Empty IN array should return always-false condition
   */
  it('should return always-false condition for empty IN array', () => {
    const fieldNameArb = fc.stringMatching(/^[a-z][a-zA-Z0-9]{0,10}$/);

    fc.assert(
      fc.property(fieldNameArb, (field) => {
        const where: WhereClause = { [field]: { in: [] } };
        const { sql, params } = buildWhereClause(where);

        // Should have always-false condition
        expect(sql).toContain('1 = 0');
        expect(params).toHaveLength(0);

        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Comparison operators should generate correct SQL
   */
  it('should generate correct SQL for comparison operators', () => {
    const fieldNameArb = fc.stringMatching(/^[a-z][a-zA-Z0-9]{0,10}$/);
    const valueArb = fc.integer({ min: 0, max: 1000 });
    const operatorArb = fc.constantFrom('gt', 'gte', 'lt', 'lte') as fc.Arbitrary<'gt' | 'gte' | 'lt' | 'lte'>;

    const operatorMap = {
      gt: '>',
      gte: '>=',
      lt: '<',
      lte: '<=',
    };

    fc.assert(
      fc.property(fieldNameArb, operatorArb, valueArb, (field, op, value) => {
        const where: WhereClause = { [field]: { [op]: value } };
        const { sql, params } = buildWhereClause(where);

        expect(sql).toContain(`${field} ${operatorMap[op]} ?`);
        expect(params).toHaveLength(1);
        expect(params[0]).toBe(value);

        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: LIKE operators should generate correct patterns
   */
  it('should generate correct LIKE patterns', () => {
    const fieldNameArb = fc.stringMatching(/^[a-z][a-zA-Z0-9]{0,10}$/);
    const searchArb = fc.string({ minLength: 1, maxLength: 10 });

    fc.assert(
      fc.property(fieldNameArb, searchArb, (field, search) => {
        // Test contains
        const containsWhere: WhereClause = { [field]: { contains: search } };
        const containsResult = buildWhereClause(containsWhere);
        expect(containsResult.sql).toContain(`${field} LIKE ?`);
        expect(containsResult.params[0]).toBe(`%${search}%`);

        // Test startsWith
        const startsWithWhere: WhereClause = { [field]: { startsWith: search } };
        const startsWithResult = buildWhereClause(startsWithWhere);
        expect(startsWithResult.sql).toContain(`${field} LIKE ?`);
        expect(startsWithResult.params[0]).toBe(`${search}%`);

        // Test endsWith
        const endsWithWhere: WhereClause = { [field]: { endsWith: search } };
        const endsWithResult = buildWhereClause(endsWithWhere);
        expect(endsWithResult.sql).toContain(`${field} LIKE ?`);
        expect(endsWithResult.params[0]).toBe(`%${search}`);

        return true;
      }),
      { numRuns: 100 }
    );
  });
});
