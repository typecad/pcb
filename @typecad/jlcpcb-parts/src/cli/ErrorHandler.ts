import chalk from 'chalk';
import { FileSystemError, NetworkError, ParsingError } from '../types/index.js';

/**
 * Class for handling errors and providing user-friendly messages
 */
export class ErrorHandler {
  /**
   * Handles an error and returns a user-friendly message
   * @param error - The error to handle
   * @returns User-friendly error message with suggestions
   */
  public static handleError(error: unknown): string {
    if (error instanceof Error) {
      // Handle specific error types
      if (this.isNetworkError(error)) {
        return this.handleNetworkError(error);
      } else if (this.isFileSystemError(error)) {
        return this.handleFileSystemError(error);
      } else if (this.isParsingError(error)) {
        return this.handleParsingError(error);
      } else if (error.message.includes('timed out')) {
        return this.handleTimeoutError(error);
      }

      // Generic error handling
      return `${error.message}\n${chalk.yellow('This is an unexpected error. Please report it to the developers.')}`;
    }

    // Unknown error type
    return `An unknown error occurred: ${String(error)}`;
  }

  /**
   * Checks if an error is a network error
   * @param error - Error to check
   * @returns True if the error is a network error
   */
  private static isNetworkError(error: Error): error is NetworkError {
    return error instanceof NetworkError;
  }

  /**
   * Checks if an error is a file system error
   * @param error - Error to check
   * @returns True if the error is a file system error
   */
  private static isFileSystemError(error: Error): error is FileSystemError {
    return error instanceof FileSystemError;
  }

  /**
   * Checks if an error is a parsing error
   * @param error - Error to check
   * @returns True if the error is a parsing error
   */
  private static isParsingError(error: Error): error is ParsingError {
    return error instanceof ParsingError;
  }

  /**
   * Handles a network error
   * @param error - Network error to handle
   * @returns User-friendly error message with suggestions
   */
  private static handleNetworkError(error: NetworkError): string {
    const message = `Network error: ${error.message}`;
    let suggestion = '';

    // Add specific suggestions based on error code
    switch (error.code) {
      case 'ENOTFOUND':
        suggestion = 'Check your internet connection and try again.';
        break;
      case 'ETIMEDOUT':
        suggestion = 'The server took too long to respond. Try again later.';
        break;
      case 'ECONNREFUSED':
        suggestion =
          'The server refused the connection. It might be down or your firewall might be blocking the connection.';
        break;
      default:
        if (error.statusCode) {
          if (error.statusCode === 404) {
            suggestion = 'The requested resource was not found. The JLCPCB data source might have changed.';
          } else if (error.statusCode === 403) {
            suggestion =
              'Access to the resource was forbidden. Check if you need to authenticate or if the resource is no longer public.';
          } else if (error.statusCode >= 500) {
            suggestion = 'The server encountered an error. Try again later.';
          }
        } else {
          suggestion = 'Check your internet connection and try again.';
        }
    }

    return `${message}\n${chalk.yellow(suggestion)}`;
  }

  /**
   * Handles a file system error
   * @param error - File system error to handle
   * @returns User-friendly error message with suggestions
   */
  private static handleFileSystemError(error: FileSystemError): string {
    const message = `File system error: ${error.message}`;
    let suggestion = '';

    // Add specific suggestions based on error code
    switch (error.code) {
      case 'ENOENT':
        suggestion = `The file or directory was not found: ${error.path}. Check if the path is correct.`;
        break;
      case 'EACCES':
        suggestion = `Permission denied for: ${error.path}. Check if you have the necessary permissions.`;
        break;
      case 'EISDIR':
        suggestion = `Expected a file but found a directory: ${error.path}.`;
        break;
      default:
        suggestion = `There was an issue with the file system operation on: ${error.path}.`;
    }

    return `${message}\n${chalk.yellow(suggestion)}`;
  }

  /**
   * Handles a parsing error
   * @param error - Parsing error to handle
   * @returns User-friendly error message with suggestions
   */
  private static handleParsingError(error: ParsingError): string {
    const message = `Parsing error: ${error.message}`;
    let suggestion = '';

    if (error.line !== undefined && error.column !== undefined) {
      suggestion = `Error occurred at line ${error.line}, column ${error.column}. The data format might be corrupted or invalid.`;
    } else {
      suggestion = 'The data format might be corrupted or invalid. Try refreshing the data source.';
    }

    return `${message}\n${chalk.yellow(suggestion)}`;
  }

  /**
   * Handles a timeout error
   * @param error - Timeout error to handle
   * @returns User-friendly error message with suggestions
   */
  private static handleTimeoutError(error: Error): string {
    const message = `Timeout error: ${error.message}`;
    const suggestion =
      'The operation took too long to complete. Try using more specific search terms or check your internet connection.';

    return `${message}\n${chalk.yellow(suggestion)}`;
  }
}
