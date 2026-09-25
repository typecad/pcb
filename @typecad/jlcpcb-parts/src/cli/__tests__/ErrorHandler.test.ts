import { describe, it, expect, vi } from 'vitest';
import { ErrorHandler } from '../ErrorHandler.js';
import { FileSystemError, NetworkError, ParsingError } from '../../types/index.js';

// Mock chalk to avoid color codes in test output
vi.mock('chalk', () => ({
  default: {
    red: (text: string) => text,
    yellow: (text: string) => text,
  },
}));

describe('ErrorHandler', () => {
  describe('handleError', () => {
    it('should handle network errors', () => {
      const networkError = new NetworkError('Failed to connect', 'ENOTFOUND');

      const result = ErrorHandler.handleError(networkError);

      expect(result).toContain('Network error');
      expect(result).toContain('Check your internet connection');
    });

    it('should handle file system errors', () => {
      const fileError = new FileSystemError('File not found', 'ENOENT', '/path/to/file');

      const result = ErrorHandler.handleError(fileError);

      expect(result).toContain('File system error');
      expect(result).toContain('not found');
      expect(result).toContain('/path/to/file');
    });

    it('should handle parsing errors', () => {
      const parseError = new ParsingError('Invalid JSON', 10, 5);

      const result = ErrorHandler.handleError(parseError);

      expect(result).toContain('Parsing error');
      expect(result).toContain('line 10');
      expect(result).toContain('column 5');
    });

    it('should handle timeout errors', () => {
      // Arrange
      const timeoutError = new Error('Operation timed out after 10000ms');

      // Act
      const result = ErrorHandler.handleError(timeoutError);

      // Assert
      expect(result).toContain('Timeout error');
      expect(result).toContain('took too long');
    });

    it('should handle generic errors', () => {
      // Arrange
      const genericError = new Error('Something went wrong');

      // Act
      const result = ErrorHandler.handleError(genericError);

      // Assert
      expect(result).toContain('Something went wrong');
      expect(result).toContain('unexpected error');
    });

    it('should handle non-Error objects', () => {
      // Arrange
      const nonError = 'This is not an Error object';

      // Act
      const result = ErrorHandler.handleError(nonError);

      // Assert
      expect(result).toContain('An unknown error occurred');
      expect(result).toContain('This is not an Error object');
    });
  });

  describe('Network error handling', () => {
    it('should provide specific suggestions for ETIMEDOUT', () => {
      const timeoutError = new NetworkError('Connection timed out', 'ETIMEDOUT');

      const result = ErrorHandler.handleError(timeoutError);

      expect(result).toContain('server took too long');
    });

    it('should provide specific suggestions for ECONNREFUSED', () => {
      const refusedError = new NetworkError('Connection refused', 'ECONNREFUSED');

      const result = ErrorHandler.handleError(refusedError);

      expect(result).toContain('server refused');
    });

    it('should provide specific suggestions for HTTP status codes', () => {
      const notFoundError = new NetworkError('Not Found', 'NETWORK_ERROR', 404);

      const result = ErrorHandler.handleError(notFoundError);

      expect(result).toContain('resource was not found');
    });
  });

  describe('File system error handling', () => {
    it('should provide specific suggestions for EACCES', () => {
      const accessError = new FileSystemError('Permission denied', 'EACCES', '/path/to/file');

      const result = ErrorHandler.handleError(accessError);

      expect(result).toContain('Permission denied');
      expect(result).toContain('necessary permissions');
    });

    it('should provide specific suggestions for EISDIR', () => {
      const isDirError = new FileSystemError('Is a directory', 'EISDIR', '/path/to/dir');

      const result = ErrorHandler.handleError(isDirError);

      expect(result).toContain('Expected a file but found a directory');
    });
  });
});
