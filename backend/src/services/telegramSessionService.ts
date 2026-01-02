/**
 * Telegram Session Service
 * Business logic for managing Telegram bot sessions with persistent storage
 * Requirements: 3.1, 3.4
 */

import { TelegramSession, TelegramStep } from '../database/types';
import { logger } from './loggerService';
import { pgPool, generateId } from '../utils/db';

/**
 * Registration data stored in session
 */
export interface RegistrationData {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  password?: string;
  restaurantId?: string;
  positionId?: string;
  departmentId?: string;
}

/**
 * Session data for service operations
 */
export interface SessionData {
  step?: TelegramStep;
  inviteToken?: string | null;
  registrationData?: RegistrationData | null;
}

/**
 * Parsed session with registration data as object
 */
export interface ParsedTelegramSession extends Omit<TelegramSession, 'registrationData'> {
  registrationData: RegistrationData | null;
}

/**
 * Default session expiration time (24 hours)
 */
const DEFAULT_SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000;

/**
 * Cleanup interval (1 hour)
 */
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Telegram Session Service Interface
 */
export interface ITelegramSessionService {
  getSession(telegramUserId: string): Promise<ParsedTelegramSession | null>;
  createSession(telegramUserId: string, data?: SessionData): Promise<ParsedTelegramSession>;
  updateSession(telegramUserId: string, data: SessionData): Promise<ParsedTelegramSession | null>;
  deleteSession(telegramUserId: string): Promise<void>;
  cleanExpiredSessions(): Promise<number>;
  getOrCreateSession(telegramUserId: string): Promise<ParsedTelegramSession>;
  startCleanupScheduler(): void;
  stopCleanupScheduler(): void;
}

/**
 * Parse session to convert registrationData from JSON to object
 */
function parseSession(session: any): ParsedTelegramSession {
  let registrationData: RegistrationData | null = null;
  
  if (session.registration_data) {
    if (typeof session.registration_data === 'string') {
      try {
        registrationData = JSON.parse(session.registration_data);
      } catch (e) {
        logger.warn('Failed to parse registration data', { 
          telegramUserId: session.telegram_user_id,
          error: e instanceof Error ? e.message : 'Unknown error'
        });
      }
    } else {
      registrationData = session.registration_data;
    }
  }

  return {
    id: session.id,
    telegramUserId: session.telegram_user_id,
    step: session.step as TelegramStep,
    inviteToken: session.invite_token,
    registrationData,
    createdAt: session.created_at,
    updatedAt: session.updated_at,
    expiresAt: session.expires_at,
  };
}

let cleanupInterval: NodeJS.Timeout | null = null;

/**
 * Telegram Session Service implementation
 */
export const telegramSessionService: ITelegramSessionService = {
  async getSession(telegramUserId: string): Promise<ParsedTelegramSession | null> {
    logger.debug('Getting session', { telegramUserId });
    
    const result = await pgPool.query(
      'SELECT * FROM "TelegramSession" WHERE "telegram_user_id" = $1',
      [telegramUserId]
    );
    
    if (result.rows.length === 0) {
      logger.debug('Session not found', { telegramUserId });
      return null;
    }

    const session = result.rows[0];

    // Check if expired
    if (new Date(session.expires_at) < new Date()) {
      logger.debug('Session expired, deleting', { telegramUserId });
      await pgPool.query('DELETE FROM "TelegramSession" WHERE "telegram_user_id" = $1', [telegramUserId]);
      return null;
    }

    return parseSession(session);
  },

  async createSession(telegramUserId: string, data?: SessionData): Promise<ParsedTelegramSession> {
    logger.info('Creating session', { telegramUserId });

    // Delete existing session if any
    await pgPool.query('DELETE FROM "TelegramSession" WHERE "telegram_user_id" = $1', [telegramUserId]);

    const id = generateId();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + DEFAULT_SESSION_EXPIRY_MS);

    const result = await pgPool.query(`
      INSERT INTO "TelegramSession" ("id", "telegram_user_id", "step", "invite_token", "registration_data", "created_at", "updated_at", "expires_at")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      id,
      telegramUserId,
      data?.step || 'idle',
      data?.inviteToken || null,
      data?.registrationData ? JSON.stringify(data.registrationData) : null,
      now.toISOString(),
      now.toISOString(),
      expiresAt.toISOString(),
    ]);

    logger.debug('Session created', { telegramUserId, sessionId: id });
    return parseSession(result.rows[0]);
  },

  async updateSession(telegramUserId: string, data: SessionData): Promise<ParsedTelegramSession | null> {
    logger.debug('Updating session', { telegramUserId, data });

    const setClauses: string[] = ['"updated_at" = NOW()'];
    const params: any[] = [];
    let paramIndex = 1;

    if (data.step !== undefined) {
      setClauses.push(`"step" = $${paramIndex}`);
      params.push(data.step);
      paramIndex++;
    }

    if (data.inviteToken !== undefined) {
      setClauses.push(`"invite_token" = $${paramIndex}`);
      params.push(data.inviteToken);
      paramIndex++;
    }

    if (data.registrationData !== undefined) {
      setClauses.push(`"registration_data" = $${paramIndex}`);
      params.push(data.registrationData ? JSON.stringify(data.registrationData) : null);
      paramIndex++;
    }

    params.push(telegramUserId);

    const result = await pgPool.query(`
      UPDATE "TelegramSession" 
      SET ${setClauses.join(', ')}
      WHERE "telegram_user_id" = $${paramIndex}
      RETURNING *
    `, params);

    if (result.rows.length === 0) {
      logger.warn('Session not found for update', { telegramUserId });
      return null;
    }

    return parseSession(result.rows[0]);
  },

  async deleteSession(telegramUserId: string): Promise<void> {
    logger.info('Deleting session', { telegramUserId });
    await pgPool.query('DELETE FROM "TelegramSession" WHERE "telegram_user_id" = $1', [telegramUserId]);
  },

  async cleanExpiredSessions(): Promise<number> {
    logger.debug('Cleaning expired sessions');
    const result = await pgPool.query('DELETE FROM "TelegramSession" WHERE "expires_at" < NOW()');
    const count = result.rowCount || 0;
    
    if (count > 0) {
      logger.info('Cleaned expired sessions', { count });
    }
    
    return count;
  },

  async getOrCreateSession(telegramUserId: string): Promise<ParsedTelegramSession> {
    const existing = await this.getSession(telegramUserId);
    
    if (existing) {
      // Extend expiration
      const expiresAt = new Date(Date.now() + DEFAULT_SESSION_EXPIRY_MS);
      await pgPool.query(
        'UPDATE "TelegramSession" SET "expires_at" = $1, "updated_at" = NOW() WHERE "telegram_user_id" = $2',
        [expiresAt.toISOString(), telegramUserId]
      );
      return { ...existing, expiresAt: expiresAt.toISOString() };
    }

    return this.createSession(telegramUserId);
  },

  startCleanupScheduler(): void {
    if (cleanupInterval) {
      logger.warn('Cleanup scheduler already running');
      return;
    }

    logger.info('Starting session cleanup scheduler', { intervalMs: CLEANUP_INTERVAL_MS });

    // Run cleanup immediately
    this.cleanExpiredSessions();

    // Schedule periodic cleanup
    cleanupInterval = setInterval(() => {
      this.cleanExpiredSessions();
    }, CLEANUP_INTERVAL_MS);
  },

  stopCleanupScheduler(): void {
    if (cleanupInterval) {
      clearInterval(cleanupInterval);
      cleanupInterval = null;
      logger.info('Stopped session cleanup scheduler');
    }
  },
};

/**
 * Get the Telegram Session Service instance
 */
export function getTelegramSessionService(): ITelegramSessionService {
  return telegramSessionService;
}

/**
 * Create Telegram Session Service (for backward compatibility)
 */
export function createTelegramSessionService(_db?: any): ITelegramSessionService {
  return telegramSessionService;
}

/**
 * Reset the service (for testing)
 */
export function resetTelegramSessionService(): void {
  telegramSessionService.stopCleanupScheduler();
}

// Re-export types
export { TelegramSession, TelegramStep };
