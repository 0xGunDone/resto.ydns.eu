/**
 * Type Converters Module
 * Handles conversion between SQLite storage types and TypeScript types
 * Requirements: 2.5, 6.4
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
 * Check if a value is a SQLite boolean (0 or 1)
 */
export function isSqliteBoolean(value: unknown): value is 0 | 1 {
  return value === 0 || value === 1;
}

/**
 * Convert a SQLite boolean (0/1) to JavaScript boolean
 */
export function convertSqliteBoolean(value: 0 | 1): boolean {
  return value === 1;
}

/**
 * Convert a JavaScript boolean to SQLite boolean (0/1)
 */
export function toSqliteBoolean(value: boolean): 0 | 1 {
  return value ? 1 : 0;
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
 * Convert boolean fields in a database row from 0/1 to true/false
 * Optimized to not convert already-converted rows
 * 
 * @param row - Raw database row
 * @returns Row with boolean fields converted
 */
export function convertBooleanFields<T extends RawDatabaseRow>(row: T | null | undefined): T | null {
  // Handle null/undefined
  if (row === null || row === undefined) {
    return null;
  }

  // Skip if not an object
  if (typeof row !== 'object') {
    return row;
  }

  // Skip if already converted
  if (isConverted(row)) {
    return row;
  }

  // Create a shallow copy to avoid mutating the original
  const converted = { ...row } as T;

  // Convert boolean fields
  for (const key of Object.keys(converted)) {
    const value = converted[key];
    
    // Only convert fields that look like booleans and have 0/1 values
    if (isBooleanFieldName(key) && isSqliteBoolean(value)) {
      (converted as Record<string, unknown>)[key] = convertSqliteBoolean(value);
    }
  }

  // Mark as converted and return
  return markAsConverted(converted);
}

/**
 * Convert an array of database rows
 * 
 * @param rows - Array of raw database rows
 * @returns Array with boolean fields converted
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
  // Match ISO 8601 format: YYYY-MM-DDTHH:mm:ss.sssZ or YYYY-MM-DD
  return /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/.test(value);
}

/**
 * Convert a Date object to ISO string for SQLite storage
 */
export function toSqliteDate(date: Date | string | null | undefined): string | null {
  if (date === null || date === undefined) {
    return null;
  }
  
  if (date instanceof Date) {
    return date.toISOString();
  }
  
  if (typeof date === 'string') {
    // Already a string, validate and return
    if (isIsoDateString(date)) {
      return date;
    }
    // Try to parse and convert
    const parsed = new Date(date);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  
  return null;
}

/**
 * Convert a value for SQLite storage
 * Handles booleans, dates, and other types
 */
export function toSqliteValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  
  if (typeof value === 'boolean') {
    return toSqliteBoolean(value);
  }
  
  if (value instanceof Date) {
    return value.toISOString();
  }
  
  return value;
}

/**
 * Convert an object's values for SQLite storage
 * 
 * @param data - Object with values to convert
 * @returns Object with values converted for SQLite
 */
export function convertToSqliteValues<T extends Record<string, unknown>>(data: T): T {
  const converted = { ...data } as T;
  
  for (const key of Object.keys(converted)) {
    (converted as Record<string, unknown>)[key] = toSqliteValue(converted[key]);
  }
  
  return converted;
}

/**
 * Prepare data for INSERT/UPDATE operations
 * Converts booleans and dates to SQLite-compatible values
 * 
 * @param data - Data object to prepare
 * @param excludeFields - Fields to exclude from conversion
 * @returns Prepared data object
 */
export function prepareDataForSqlite<T extends Record<string, unknown>>(
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
    values.push(toSqliteValue(value));
  }
  
  return { fields, values };
}
