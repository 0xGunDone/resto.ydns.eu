/**
 * Telegram Session Repository
 * CRUD operations for Telegram bot sessions with persistent storage
 * Requirements: 3.1, 3.4
 */

import Database from 'better-sqlite3';
import { TelegramSession, TelegramStep } from '../types';
import { createBaseRepository, generateId } from './baseRepository';

/**
 * Registration data stored in session
 */
export interface RegistrationData {
  firstName?: string;
  lastName?: string;
  phone?: string;
}

/**
 * Session data for create/update operations
 */
export interface TelegramSessionData {
  telegramUserId: string;
  step?: TelegramStep;
  inviteToken?: string | null;
  registrationData?: RegistrationData | null;
  expiresAt?: string;
}

/**
 * Default session expiration time (24 hours)
 */
const DEFAULT_SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000;

/**
 * Convert database row (snake_case) to TelegramSession (camelCase)
 */
function rowToSession(row: Record<string, unknown>): TelegramSession {
  return {
    id: row.id as string,
    telegramUserId: row.telegram_user_id as string,
    step: row.step as TelegramStep,
    inviteToken: row.invite_token as string | null,
    registrationData: row.registration_data as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    expiresAt: row.expires_at as string,
  };
}

/**
 * Create Telegram Session Repository
 */
export function createTelegramSessionRepository(db: Database.Database) {
  const tableName = 'TelegramSession';

  return {
    /**
     * Find session by Telegram user ID
     */
    findByTelegramUserId(telegramUserId: string): TelegramSession | null {
      const row = db.prepare(
        `SELECT * FROM ${tableName} WHERE telegram_user_id = ?`
      ).get(telegramUserId) as Record<string, unknown> | undefined;
      
      return row ? rowToSession(row) : null;
    },

    /**
     * Find session by ID
     */
    findById(id: string): TelegramSession | null {
      const row = db.prepare(
        `SELECT * FROM ${tableName} WHERE id = ?`
      ).get(id) as Record<string, unknown> | undefined;
      
      return row ? rowToSession(row) : null;
    },

    /**
     * Create a new session
     */
    create(data: TelegramSessionData): TelegramSession {
      const id = generateId();
      const now = new Date().toISOString();
      const expiresAt = data.expiresAt || new Date(Date.now() + DEFAULT_SESSION_EXPIRY_MS).toISOString();
      
      const registrationDataJson = data.registrationData 
        ? JSON.stringify(data.registrationData) 
        : null;

      db.prepare(`
        INSERT INTO ${tableName} (id, telegram_user_id, step, invite_token, registration_data, created_at, updated_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        data.telegramUserId,
        data.step || 'idle',
        data.inviteToken || null,
        registrationDataJson,
        now,
        now,
        expiresAt
      );

      return this.findById(id)!;
    },

    /**
     * Update session by Telegram user ID
     */
    updateByTelegramUserId(
      telegramUserId: string, 
      data: Partial<Omit<TelegramSessionData, 'telegramUserId'>>
    ): TelegramSession | null {
      const existing = this.findByTelegramUserId(telegramUserId);
      if (!existing) return null;

      const now = new Date().toISOString();
      const setParts: string[] = ['updated_at = ?'];
      const params: unknown[] = [now];

      if (data.step !== undefined) {
        setParts.push('step = ?');
        params.push(data.step);
      }

      if (data.inviteToken !== undefined) {
        setParts.push('invite_token = ?');
        params.push(data.inviteToken);
      }

      if (data.registrationData !== undefined) {
        setParts.push('registration_data = ?');
        params.push(data.registrationData ? JSON.stringify(data.registrationData) : null);
      }

      if (data.expiresAt !== undefined) {
        setParts.push('expires_at = ?');
        params.push(data.expiresAt);
      }

      params.push(telegramUserId);

      db.prepare(`
        UPDATE ${tableName} 
        SET ${setParts.join(', ')} 
        WHERE telegram_user_id = ?
      `).run(...params);

      return this.findByTelegramUserId(telegramUserId);
    },

    /**
     * Delete session by Telegram user ID
     */
    deleteByTelegramUserId(telegramUserId: string): boolean {
      const result = db.prepare(
        `DELETE FROM ${tableName} WHERE telegram_user_id = ?`
      ).run(telegramUserId);
      
      return result.changes > 0;
    },

    /**
     * Delete session by ID
     */
    deleteById(id: string): boolean {
      const result = db.prepare(
        `DELETE FROM ${tableName} WHERE id = ?`
      ).run(id);
      
      return result.changes > 0;
    },

    /**
     * Clean expired sessions
     * Returns the number of deleted sessions
     */
    cleanExpiredSessions(): number {
      const now = new Date().toISOString();
      const result = db.prepare(
        `DELETE FROM ${tableName} WHERE expires_at < ?`
      ).run(now);
      
      return result.changes;
    },

    /**
     * Get all active (non-expired) sessions
     */
    findAllActive(): TelegramSession[] {
      const now = new Date().toISOString();
      const rows = db.prepare(
        `SELECT * FROM ${tableName} WHERE expires_at >= ?`
      ).all(now) as Record<string, unknown>[];
      
      return rows.map(rowToSession);
    },

    /**
     * Get or create session for a Telegram user
     */
    getOrCreate(telegramUserId: string): TelegramSession {
      const existing = this.findByTelegramUserId(telegramUserId);
      if (existing) {
        // Check if expired
        if (new Date(existing.expiresAt) < new Date()) {
          // Delete expired and create new
          this.deleteByTelegramUserId(telegramUserId);
          return this.create({ telegramUserId });
        }
        return existing;
      }
      return this.create({ telegramUserId });
    },

    /**
     * Extend session expiration
     */
    extendExpiration(telegramUserId: string, additionalMs: number = DEFAULT_SESSION_EXPIRY_MS): TelegramSession | null {
      const existing = this.findByTelegramUserId(telegramUserId);
      if (!existing) return null;

      const newExpiresAt = new Date(Date.now() + additionalMs).toISOString();
      return this.updateByTelegramUserId(telegramUserId, { expiresAt: newExpiresAt });
    },

    /**
     * Parse registration data from JSON string
     */
    parseRegistrationData(session: TelegramSession): RegistrationData | null {
      if (!session.registrationData) return null;
      try {
        return JSON.parse(session.registrationData) as RegistrationData;
      } catch {
        return null;
      }
    },

    /**
     * Get the database connection
     */
    getDb(): Database.Database {
      return db;
    },
  };
}

export type TelegramSessionRepository = ReturnType<typeof createTelegramSessionRepository>;
