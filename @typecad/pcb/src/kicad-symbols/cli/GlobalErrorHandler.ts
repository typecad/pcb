import { ErrorHandler } from './ErrorHandler.js';
import logger from '../../utils/logging.js';

/**
 * Class for handling global unhandled exceptions and rejections
 */
export class GlobalErrorHandler {
  private static isInitialized = false;

  /**
   * Initializes the global error handler
   */
  public static initialize(): void {
    if (this.isInitialized) {
      return;
    }

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.handleUncaughtException(error);
    });

    // Handle unhandled rejections
    process.on('unhandledRejection', (reason) => {
      this.handleUnhandledRejection(reason);
    });

    this.isInitialized = true;
  }

  /**
   * Handles an uncaught exception
   * @param error - The uncaught exception
   */
  private static handleUncaughtException(error: Error): void {
    // Use ErrorHandler to get a user-friendly error message
    const errorMessage = ErrorHandler.handleError(error);
    logger.error(`\nFatal error: ${errorMessage}`);

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

    // Use ErrorHandler to get a user-friendly error message
    const errorMessage = ErrorHandler.handleError(error);
    logger.error(`\nFatal error: ${errorMessage}`);

    // Exit with error code
    process.exit(1);
  }
}
