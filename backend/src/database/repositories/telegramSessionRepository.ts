/**
 * Telegram Session Repository (PostgreSQL)
 * CRUD operations for Telegram bot sessions with persistent storage
 * Requirements: 3.1, 3.4
 */

import { pgPool, generateId } from '../../utils/db';
import { TelegramSession, TelegramStep } from '../types';

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
 * Create Telegram Session Repository
 */
export function createTelegramSessionRepository() {
  const tableName = 'TelegramSession';

  return {
    /**
     * Find session by Telegram user ID
     */
    async findByTelegramUserId(telegramUserId: string): Promise<TelegramSession | null> {
      const result = await pgPool.query(
        `SELECT * FROM "${tableName}" WHERE "telegramUserId" = $1`,
        [telegramUserId]
      );
      return result.rows[0] || null;
    },

    /**
     * Find session by ID
     */
    async findById(id: string): Promise<TelegramSession | null> {
      const result = await pgPool.query(
        `SELECT * FROM "${tableName}" WHERE "id" = $1`,
        [id]
      );
      return result.rows[0] || null;
    },

    /**
     * Create a new session
     */
    async create(data: TelegramSessionData): Promise<TelegramSession> {
      const id = generateId();
      const now = new Date().toISOString();
      const expiresAt = data.expiresAt || new Date(Date.now() + DEFAULT_SESSION_EXPIRY_MS).toISOString();
      
      const registrationDataJson = data.registrationData 
        ? JSON.stringify(data.registrationData) 
        : null;

      const result = await pgPool.query(`
        INSERT INTO "${tableName}" ("id", "telegramUserId", "step", "inviteToken", "registrationData", "createdAt", "updatedAt", "expiresAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [
        id,
        data.telegramUserId,
        data.step || 'idle',
        data.inviteToken || null,
        registrationDataJson,
        now,
        now,
        expiresAt
      ]);

      return result.rows[0];
    },

    /**
     * Update session by Telegram user ID
     */
    async updateByTelegramUserId(
      telegramUserId: string, 
      data: Partial<Omit<TelegramSessionData, 'telegramUserId'>>
    ): Promise<TelegramSession | null> {
      const existing = await this.findByTelegramUserId(telegramUserId);
      if (!existing) return null;

      const now = new Date().toISOString();
      const setParts: string[] = ['"updatedAt" = $1'];
      const params: unknown[] = [now];
      let paramIndex = 2;

      if (data.step !== undefined) {
        setParts.push(`"step" = $${paramIndex}`);
        params.push(data.step);
        paramIndex++;
      }

      if (data.inviteToken !== undefined) {
        setParts.push(`"inviteToken" = $${paramIndex}`);
        params.push(data.inviteToken);
        paramIndex++;
      }

      if (data.registrationData !== undefined) {
        setParts.push(`"registrationData" = $${paramIndex}`);
        params.push(data.registrationData ? JSON.stringify(data.registrationData) : null);
        paramIndex++;
      }

      if (data.expiresAt !== undefined) {
        setParts.push(`"expiresAt" = $${paramIndex}`);
        params.push(data.expiresAt);
        paramIndex++;
      }

      params.push(telegramUserId);

      const result = await pgPool.query(`
        UPDATE "${tableName}" 
        SET ${setParts.join(', ')} 
        WHERE "telegramUserId" = $${paramIndex}
        RETURNING *
      `, params);

      return result.rows[0] || null;
    },

    /**
     * Delete session by Telegram user ID
     */
    async deleteByTelegramUserId(telegramUserId: string): Promise<boolean> {
      const result = await pgPool.query(
        `DELETE FROM "${tableName}" WHERE "telegramUserId" = $1`,
        [telegramUserId]
      );
      return (result.rowCount || 0) > 0;
    },

    /**
     * Delete session by ID
     */
    async deleteById(id: string): Promise<boolean> {
      const result = await pgPool.query(
        `DELETE FROM "${tableName}" WHERE "id" = $1`,
        [id]
      );
      return (result.rowCount || 0) > 0;
    },

    /**
     * Clean expired sessions
     * Returns the number of deleted sessions
     */
    async cleanExpiredSessions(): Promise<number> {
      const now = new Date().toISOString();
      const result = await pgPool.query(
        `DELETE FROM "${tableName}" WHERE "expiresAt" < $1`,
        [now]
      );
      return result.rowCount || 0;
    },

    /**
     * Get all active (non-expired) sessions
     */
    async findAllActive(): Promise<TelegramSession[]> {
      const now = new Date().toISOString();
      const result = await pgPool.query(
        `SELECT * FROM "${tableName}" WHERE "expiresAt" >= $1`,
        [now]
      );
      return result.rows;
    },

    /**
     * Get or create session for a Telegram user
     */
    async getOrCreate(telegramUserId: string): Promise<TelegramSession> {
      const existing = await this.findByTelegramUserId(telegramUserId);
      if (existing) {
        // Check if expired
        if (new Date(existing.expiresAt) < new Date()) {
          // Delete expired and create new
          await this.deleteByTelegramUserId(telegramUserId);
          return this.create({ telegramUserId });
        }
        return existing;
      }
      return this.create({ telegramUserId });
    },

    /**
     * Extend session expiration
     */
    async extendExpiration(telegramUserId: string, additionalMs: number = DEFAULT_SESSION_EXPIRY_MS): Promise<TelegramSession | null> {
      const existing = await this.findByTelegramUserId(telegramUserId);
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
  };
}

export type TelegramSessionRepository = ReturnType<typeof createTelegramSessionRepository>;
