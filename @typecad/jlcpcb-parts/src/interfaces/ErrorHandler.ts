import { NetworkError, FileSystemError, ParsingError } from '../types/index.js';

/**
 * Interface for handling different types of errors gracefully
 */
export interface ErrorHandler {
  /**
   * Handles network-related errors with retry logic
   * @param error - Network error to handle
   */
  handleNetworkError(error: NetworkError): Promise<void>;

  /**
   * Handles file system errors with appropriate fallbacks
   * @param error - File system error to handle
   */
  handleFileSystemError(error: FileSystemError): Promise<void>;

  /**
   * Handles CSV parsing errors with graceful degradation
   * @param error - Parsing error to handle
   */
  handleParsingError(error: ParsingError): void;
}
