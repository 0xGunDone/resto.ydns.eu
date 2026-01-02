/**
 * Type Converters Module (PostgreSQL)
 * Handles conversion between PostgreSQL storage types and TypeScript types
 * Requirements: 2.5, 6.4
 * 
 * Note: PostgreSQL has native boolean type, so boolean conversion is not needed.
 * This module is kept for backward compatibility and date handling.
 */

import { BOOLEAN_FIELD_PREFIXES, RawDatabaseRow } from './types';

/**
 * Symbol to mark rows as already converted
 * Prevents multiple conversions of the same row
 */
const CONVERTED_SYMBOL = Symbol('converted');

/**
 * Check if a field name represents a boolean field
 * Boolean fields start with 'is' or 'has'
 */
export function isBooleanFieldName(fieldName: string): boolean {
  return BOOLEAN_FIELD_PREFIXES.some(prefix => fieldName.startsWith(prefix));
}

/**
 * Check if a row has already been converted
 */
export function isConverted(row: unknown): boolean {
  if (row === null || row === undefined || typeof row !== 'object') {
    return false;
  }
  return (row as Record<symbol, boolean>)[CONVERTED_SYMBOL] === true;
}

/**
 * Mark a row as converted
 */
function markAsConverted<T extends object>(row: T): T {
  Object.defineProperty(row, CONVERTED_SYMBOL, {
    value: true,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return row;
}

/**
 * Convert boolean fields in a database row
 * For PostgreSQL, this is mostly a no-op since PostgreSQL has native boolean type.
 * Kept for backward compatibility.
 * 
 * @param row - Raw database row
 * @returns Row (unchanged for PostgreSQL)
 */
export function convertBooleanFields<T extends RawDatabaseRow>(row: T | null | undefined): T | null {
  if (row === null || row === undefined) {
    return null;
  }

  if (typeof row !== 'object') {
    return row;
  }

  if (isConverted(row)) {
    return row;
  }

  // PostgreSQL returns native booleans, no conversion needed
  // Just mark as converted to prevent multiple processing
  return markAsConverted({ ...row } as T);
}

/**
 * Convert an array of database rows
 * 
 * @param rows - Array of raw database rows
 * @returns Array (unchanged for PostgreSQL)
 */
export function convertBooleanFieldsArray<T extends RawDatabaseRow>(rows: T[]): T[] {
  return rows.map(row => convertBooleanFields(row) as T);
}

/**
 * Check if a string is a valid ISO 8601 date
 */
export function isIsoDateString(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  return /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/.test(value);
}

/**
 * Convert a Date object to ISO string for PostgreSQL storage
 */
export function toPostgresDate(date: Date | string | null | undefined): string | null {
  if (date === null || date === undefined) {
    return null;
  }
  
  if (date instanceof Date) {
    return date.toISOString();
  }
  
  if (typeof date === 'string') {
    if (isIsoDateString(date)) {
      return date;
    }
    const parsed = new Date(date);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  
  return null;
}

/**
 * Convert a value for PostgreSQL storage
 * Handles dates and other types
 */
export function toPostgresValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  
  if (value instanceof Date) {
    return value.toISOString();
  }
  
  return value;
}

/**
 * Convert an object's values for PostgreSQL storage
 * 
 * @param data - Object with values to convert
 * @returns Object with values converted for PostgreSQL
 */
export function convertToPostgresValues<T extends Record<string, unknown>>(data: T): T {
  const converted = { ...data } as T;
  
  for (const key of Object.keys(converted)) {
    (converted as Record<string, unknown>)[key] = toPostgresValue(converted[key]);
  }
  
  return converted;
}

/**
 * Prepare data for INSERT/UPDATE operations
 * Converts dates to PostgreSQL-compatible values
 * 
 * @param data - Data object to prepare
 * @param excludeFields - Fields to exclude from conversion
 * @returns Prepared data object
 */
export function prepareDataForPostgres<T extends Record<string, unknown>>(
  data: T,
  excludeFields: string[] = ['id']
): { fields: string[]; values: unknown[] } {
  const fields: string[] = [];
  const values: unknown[] = [];
  
  for (const [key, value] of Object.entries(data)) {
    if (excludeFields.includes(key) || value === undefined) {
      continue;
    }
    
    fields.push(key);
    values.push(toPostgresValue(value));
  }
  
  return { fields, values };
}

// Backward compatibility aliases
export const toSqliteDate = toPostgresDate;
export const toSqliteValue = toPostgresValue;
export const toSqliteBoolean = (value: boolean): boolean => value;
export const convertSqliteBoolean = (value: boolean): boolean => value;
export const isSqliteBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
export const convertToSqliteValues = convertToPostgresValues;
export const prepareDataForSqlite = prepareDataForPostgres;
