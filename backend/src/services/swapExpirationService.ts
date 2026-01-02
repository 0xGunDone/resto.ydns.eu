/**
 * Swap Expiration Service
 * 
 * Handles automatic expiration of swap requests that have exceeded their time limit.
 * Runs as a scheduled job every hour to check for and expire pending swap requests.
 * 
 * Requirements: 2.5 - THE Shift_Swap_System SHALL автоматически отклонять запросы без ответа через 48 часов
 */

import dbClient from '../utils/db';
import { logger } from './loggerService';

/**
 * Expiration check interval (1 hour in milliseconds)
 */
const EXPIRATION_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Swap Expiration Service Interface
 */
export interface ISwapExpirationService {
  /**
   * Check and expire all pending swap requests that have passed their expiresAt time
   * @returns Number of expired requests
   */
  expireSwapRequests(): Promise<number>;
  
  /**
   * Start the automatic expiration scheduler
   */
  startExpirationScheduler(): void;
  
  /**
   * Stop the automatic expiration scheduler
   */
  stopExpirationScheduler(): void;
}

// Singleton interval reference
let expirationInterval: NodeJS.Timeout | null = null;

/**
 * Expire all pending swap requests that have passed their expiresAt time
 * 
 * @returns Number of expired requests
 */
export async function expireSwapRequests(): Promise<number> {
  const now = new Date();
  
  logger.debug('Checking for expired swap requests', { currentTime: now.toISOString() });
  
  try {
    // Update all PENDING requests where expiresAt < now
    const result = await dbClient.swapRequest.updateMany({
      where: {
        status: 'PENDING',
        expiresAt: { lt: now },
      },
      data: {
        status: 'EXPIRED',
      },
    });
    
    if (result.count > 0) {
      logger.info('Expired swap requests', { count: result.count });
    } else {
      logger.debug('No swap requests to expire');
    }
    
    return result.count;
  } catch (error) {
    logger.error('Error expiring swap requests', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    return 0;
  }
}

/**
 * Start the automatic expiration scheduler
 * Runs every hour to check for and expire pending swap requests
 */
export function startExpirationScheduler(): void {
  if (expirationInterval) {
    logger.warn('Swap expiration scheduler already running');
    return;
  }
  
  logger.info('Starting swap expiration scheduler', { 
    intervalMs: EXPIRATION_CHECK_INTERVAL_MS 
  });
  
  // Run expiration check immediately on startup
  expireSwapRequests();
  
  // Schedule periodic expiration checks
  expirationInterval = setInterval(() => {
    expireSwapRequests();
  }, EXPIRATION_CHECK_INTERVAL_MS);
}

/**
 * Stop the automatic expiration scheduler
 */
export function stopExpirationScheduler(): void {
  if (expirationInterval) {
    clearInterval(expirationInterval);
    expirationInterval = null;
    logger.info('Stopped swap expiration scheduler');
  }
}

/**
 * Create Swap Expiration Service instance
 */
export function createSwapExpirationService(): ISwapExpirationService {
  return {
    expireSwapRequests,
    startExpirationScheduler,
    stopExpirationScheduler,
  };
}

// Singleton instance
let serviceInstance: ISwapExpirationService | null = null;

/**
 * Get the singleton Swap Expiration Service instance
 */
export function getSwapExpirationService(): ISwapExpirationService {
  if (!serviceInstance) {
    serviceInstance = createSwapExpirationService();
  }
  return serviceInstance;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetSwapExpirationService(): void {
  if (serviceInstance) {
    serviceInstance.stopExpirationScheduler();
    serviceInstance = null;
  }
}
