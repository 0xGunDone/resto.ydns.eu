/**
 * Telegram Session Service
 * Business logic for managing Telegram bot sessions with persistent storage
 * Requirements: 3.1, 3.4
 */

import Database from 'better-sqlite3';
import path from 'path';
import { TelegramSession, TelegramStep } from '../database/types';
import { 
  createTelegramSessionRepository, 
  TelegramSessionRepository,
  RegistrationData 
} from '../database/repositories/telegramSessionRepository';
import { logger } from './loggerService';

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
 * Parse session to convert registrationData from JSON string to object
 */
function parseSession(session: TelegramSession): ParsedTelegramSession {
  let registrationData: RegistrationData | null = null;
  
  if (session.registrationData) {
    try {
      registrationData = JSON.parse(session.registrationData);
    } catch (e) {
      logger.warn('Failed to parse registration data', { 
        telegramUserId: session.telegramUserId,
        error: e instanceof Error ? e.message : 'Unknown error'
      });
    }
  }

  return {
    ...session,
    registrationData,
  };
}

/**
 * Create Telegram Session Service
 */
export function createTelegramSessionService(db: Database.Database): ITelegramSessionService {
  const repository = createTelegramSessionRepository(db);
  let cleanupInterval: NodeJS.Timeout | null = null;

  return {
    /**
     * Get session by Telegram user ID
     */
    async getSession(telegramUserId: string): Promise<ParsedTelegramSession | null> {
      logger.debug('Getting session', { telegramUserId });
      
      const session = repository.findByTelegramUserId(telegramUserId);
      
      if (!session) {
        logger.debug('Session not found', { telegramUserId });
        return null;
      }

      // Check if expired
      if (new Date(session.expiresAt) < new Date()) {
        logger.debug('Session expired, deleting', { telegramUserId });
        repository.deleteByTelegramUserId(telegramUserId);
        return null;
      }

      return parseSession(session);
    },

    /**
     * Create a new session
     */
    async createSession(telegramUserId: string, data?: SessionData): Promise<ParsedTelegramSession> {
      logger.info('Creating session', { telegramUserId });

      // Delete existing session if any
      repository.deleteByTelegramUserId(telegramUserId);

      const session = repository.create({
        telegramUserId,
        step: data?.step || 'idle',
        inviteToken: data?.inviteToken || null,
        registrationData: data?.registrationData || null,
      });

      logger.debug('Session created', { telegramUserId, sessionId: session.id });
      return parseSession(session);
    },

    /**
     * Update session by Telegram user ID
     */
    async updateSession(telegramUserId: string, data: SessionData): Promise<ParsedTelegramSession | null> {
      logger.debug('Updating session', { telegramUserId, data });

      const updated = repository.updateByTelegramUserId(telegramUserId, {
        step: data.step,
        inviteToken: data.inviteToken,
        registrationData: data.registrationData,
      });

      if (!updated) {
        logger.warn('Session not found for update', { telegramUserId });
        return null;
      }

      return parseSession(updated);
    },

    /**
     * Delete session by Telegram user ID
     */
    async deleteSession(telegramUserId: string): Promise<void> {
      logger.info('Deleting session', { telegramUserId });
      repository.deleteByTelegramUserId(telegramUserId);
    },

    /**
     * Clean expired sessions
     * Returns the number of deleted sessions
     */
    async cleanExpiredSessions(): Promise<number> {
      logger.debug('Cleaning expired sessions');
      const count = repository.cleanExpiredSessions();
      
      if (count > 0) {
        logger.info('Cleaned expired sessions', { count });
      }
      
      return count;
    },

    /**
     * Get or create session for a Telegram user
     */
    async getOrCreateSession(telegramUserId: string): Promise<ParsedTelegramSession> {
      const existing = await this.getSession(telegramUserId);
      
      if (existing) {
        // Extend expiration
        const extended = repository.extendExpiration(telegramUserId);
        if (extended) {
          return parseSession(extended);
        }
      }

      return this.createSession(telegramUserId);
    },

    /**
     * Start automatic cleanup scheduler
     */
    startCleanupScheduler(): void {
      if (cleanupInterval) {
        logger.warn('Cleanup scheduler already running');
        return;
      }

      logger.info('Starting session cleanup scheduler', { 
        intervalMs: CLEANUP_INTERVAL_MS 
      });

      // Run cleanup immediately
      this.cleanExpiredSessions();

      // Schedule periodic cleanup
      cleanupInterval = setInterval(() => {
        this.cleanExpiredSessions();
      }, CLEANUP_INTERVAL_MS);
    },

    /**
     * Stop automatic cleanup scheduler
     */
    stopCleanupScheduler(): void {
      if (cleanupInterval) {
        clearInterval(cleanupInterval);
        cleanupInterval = null;
        logger.info('Stopped session cleanup scheduler');
      }
    },
  };
}

// Singleton instance (lazy initialization)
let serviceInstance: ITelegramSessionService | null = null;

/**
 * Get the singleton Telegram Session Service instance
 */
export function getTelegramSessionService(): ITelegramSessionService {
  if (!serviceInstance) {
    // Initialize database connection
    const dbPath = process.env.DATABASE_URL
      ? process.env.DATABASE_URL.replace(/^file:/, '')
      : path.join(__dirname, '../../dev.db');
    
    const db = new Database(dbPath);
    db.pragma('foreign_keys = ON');
    
    serviceInstance = createTelegramSessionService(db);
  }
  
  return serviceInstance;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetTelegramSessionService(): void {
  if (serviceInstance) {
    serviceInstance.stopCleanupScheduler();
    serviceInstance = null;
  }
}

// Re-export types
export { RegistrationData, TelegramSession, TelegramStep };
