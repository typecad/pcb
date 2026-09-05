import chalk from 'chalk';

/**
 * Log levels for the Logger
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

/**
 * Configuration options for the Logger
 */
export interface LoggerOptions {
  /**
   * Minimum log level to display in the console (default: INFO)
   */
  consoleLevel?: LogLevel;

  /**
   * Whether to include timestamps in log messages (default: true)
   */
  includeTimestamps?: boolean;
}

/**
 * Logger class for debugging and monitoring
 */
export class Logger {
  private static instance: Logger | null = null;
  private options: Required<LoggerOptions>;

  /**
   * Creates a new Logger instance with sensible defaults
   * @param options - Configuration options for the Logger
   */
  private constructor(options: LoggerOptions = {}) {
    this.options = {
      consoleLevel: options.consoleLevel ?? LogLevel.INFO,
      includeTimestamps: options.includeTimestamps ?? true,
    };
  }

  /**
   * Gets the Logger instance (singleton)
   * @param options - Configuration options for the Logger (only used on first call)
   * @returns The Logger instance
   */
  public static getInstance(options: LoggerOptions = {}): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(options);
    }
    return Logger.instance;
  }

  /**
   * Resets the Logger singleton instance
   */
  public static resetInstance(): void {
    Logger.instance = null;
  }

  /**
   * Sets the console log level at runtime
   * @param level - The minimum log level to display
   */
  public setConsoleLevel(level: LogLevel): void {
    this.options.consoleLevel = level;
  }

  /**
   * Logs a debug message
   * @param message - Message to log
   * @param data - Additional data to log
   */
  public debug(message: string, data?: unknown): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  /**
   * Logs an info message
   * @param message - Message to log
   * @param data - Additional data to log
   */
  public info(message: string, data?: unknown): void {
    this.log(LogLevel.INFO, message, data);
  }

  /**
   * Logs a warning message
   * @param message - Message to log
   * @param data - Additional data to log
   */
  public warn(message: string, data?: unknown): void {
    this.log(LogLevel.WARN, message, data);
  }

  /**
   * Logs an error message
   * @param message - Message to log
   * @param error - Error to log
   */
  public error(message: string, error?: unknown): void {
    let errorData: unknown;

    if (error instanceof Error) {
      errorData = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    } else if (error !== undefined) {
      errorData = error;
    }

    this.log(LogLevel.ERROR, message, errorData);
  }

  /**
   * Logs a message with the specified level
   * @param level - Log level
   * @param message - Message to log
   * @param data - Additional data to log
   */
  private log(level: LogLevel, message: string, data?: unknown): void {
    // Skip if log level is too low
    if (level < this.options.consoleLevel) {
      return;
    }

    // Format the log message
    const timestamp = this.options.includeTimestamps ? new Date().toISOString() : '';
    const levelString = LogLevel[level];

    // Format the log message for console
    let consoleMessage = '';
    if (this.options.includeTimestamps) {
      consoleMessage += `[${timestamp}] `;
    }

    // Add level with color
    switch (level) {
      case LogLevel.DEBUG:
        consoleMessage += chalk.gray(`[${levelString}] `);
        break;
      case LogLevel.INFO:
        consoleMessage += chalk.blue(`[${levelString}] `);
        break;
      case LogLevel.WARN:
        consoleMessage += chalk.yellow(`[${levelString}] `);
        break;
      case LogLevel.ERROR:
        consoleMessage += chalk.red(`[${levelString}] `);
        break;
    }

    // Add message
    consoleMessage += message;

    // Add data if provided
    if (data !== undefined) {
      if (typeof data === 'object') {
        consoleMessage += '\n' + JSON.stringify(data, null, 2);
      } else {
        consoleMessage += ' ' + String(data);
      }
    }

    // Log to console
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(consoleMessage);
        break;
      case LogLevel.INFO:
        console.info(consoleMessage);
        break;
      case LogLevel.WARN:
        console.warn(consoleMessage);
        break;
      case LogLevel.ERROR:
        console.error(consoleMessage);
        break;
    }
  }
}
