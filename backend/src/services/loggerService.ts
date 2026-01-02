/**
 * Logger Service
 * Centralized logging with environment-based filtering
 * 
 * Requirements: 7.2, 7.3, 7.4
 */

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface LogContext {
  userId?: string;
  restaurantId?: string;
  action?: string;
  [key: string]: unknown;
}

export interface ILogger {
  error(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  debug(message: string, context?: LogContext): void;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

/**
 * Determines the minimum log level based on NODE_ENV
 * Production: only error and warn
 * Development/Test: all levels
 */
function getMinLogLevel(): number {
  const env = process.env.NODE_ENV;
  if (env === 'production') {
    return LOG_LEVELS.warn; // error (0) and warn (1) only
  }
  return LOG_LEVELS.debug; // all levels
}

/**
 * Formats log context into a string
 */
function formatContext(context?: LogContext): string {
  if (!context || Object.keys(context).length === 0) {
    return '';
  }
  
  const parts: string[] = [];
  for (const [key, value] of Object.entries(context)) {
    if (value !== undefined && value !== null) {
      parts.push(`${key}=${JSON.stringify(value)}`);
    }
  }
  
  return parts.length > 0 ? ` [${parts.join(', ')}]` : '';
}

/**
 * Formats timestamp for log output
 */
function getTimestamp(): string {
  return new Date().toISOString();
}

class Logger implements ILogger {
  private minLevel: number;

  constructor() {
    this.minLevel = getMinLogLevel();
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] <= this.minLevel;
  }

  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const timestamp = getTimestamp();
    const contextStr = formatContext(context);
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`;

    switch (level) {
      case 'error':
        console.error(logMessage);
        break;
      case 'warn':
        console.warn(logMessage);
        break;
      case 'info':
        console.info(logMessage);
        break;
      case 'debug':
        console.debug(logMessage);
        break;
    }
  }

  error(message: string, context?: LogContext): void {
    this.log('error', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  /**
   * Updates the minimum log level (useful for testing)
   */
  setMinLevel(level: LogLevel): void {
    this.minLevel = LOG_LEVELS[level];
  }

  /**
   * Resets the minimum log level based on NODE_ENV
   */
  resetMinLevel(): void {
    this.minLevel = getMinLogLevel();
  }
}

// Export singleton instance
export const logger = new Logger();

// Export class for testing purposes
export { Logger };
