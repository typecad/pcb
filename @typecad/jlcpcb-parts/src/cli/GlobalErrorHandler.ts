import { Logger } from './Logger.js';
import { ErrorHandler } from './ErrorHandler.js';

/**
 * Class for handling global unhandled exceptions and rejections
 */
export class GlobalErrorHandler {
  private static isInitialized = false;
  private static logger: Logger;

  /**
   * Initializes the global error handler
   * @param logger - Logger instance to use
   */
  public static initialize(logger: Logger): void {
    if (this.isInitialized) {
      return;
    }

    this.logger = logger;

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.handleUncaughtException(error);
    });

    // Handle unhandled rejections
    process.on('unhandledRejection', (reason) => {
      this.handleUnhandledRejection(reason);
    });

    // Handle warnings
    process.on('warning', (warning) => {
      this.handleWarning(warning);
    });

    // Handle exit
    process.on('exit', (code) => {
      this.handleExit(code);
    });

    this.isInitialized = true;
    logger.info('Global error handler initialized');
  }

  /**
   * Handles an uncaught exception
   * @param error - The uncaught exception
   */
  private static handleUncaughtException(error: Error): void {
    this.logger.error('Uncaught exception', error);

    // Use ErrorHandler to get a user-friendly error message
    const errorMessage = ErrorHandler.handleError(error);
    console.error(`\nFatal error: ${errorMessage}`);

    // Exit with error code
    process.exit(1);
  }

  /**
   * Handles an unhandled rejection
   * @param reason - The reason for the rejection
   */
  private static handleUnhandledRejection(reason: unknown): void {
    let error: Error;

    if (reason instanceof Error) {
      error = reason;
    } else {
      error = new Error(`Unhandled rejection: ${String(reason)}`);
    }

    this.logger.error('Unhandled rejection', error);

    // Use ErrorHandler to get a user-friendly error message
    const errorMessage = ErrorHandler.handleError(error);
    console.error(`\nFatal error: ${errorMessage}`);

    // Exit with error code
    process.exit(1);
  }

  /**
   * Handles a warning
   * @param warning - The warning
   */
  private static handleWarning(warning: Error): void {
    this.logger.warn('Warning', warning);
  }

  /**
   * Handles process exit
   * @param code - The exit code
   */
  private static handleExit(code: number): void {
    this.logger.info(`Process exiting with code ${code}`);
  }
}
