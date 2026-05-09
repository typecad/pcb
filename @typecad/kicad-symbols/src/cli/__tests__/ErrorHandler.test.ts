import { describe, it, expect, vi } from 'vitest';
import { ErrorHandler } from '../ErrorHandler.js';
import { FileSystemError, NetworkError, ParsingError } from '../../types/index.js';

// Mock chalk to avoid color codes in test output
vi.mock('chalk', () => ({
  default: {
    red: (text: string) => text,
    yellow: (text: string) => text
  }
}));

describe('ErrorHandler', () => {
  describe('handleError', () => {
    it('should handle network errors', () => {
      // Arrange
      const networkError = new Error('Failed to connect') as NetworkError;
      networkError.code = 'ENOTFOUND';
      
      // Act
      const result = ErrorHandler.handleError(networkError);
      
      // Assert
      expect(result).toContain('Network error');
      expect(result).toContain('Check your internet connection');
    });
    
    it('should handle file system errors', () => {
      // Arrange
      const fileError = new Error('File not found') as FileSystemError;
      fileError.code = 'ENOENT';
      fileError.path = '/path/to/file';
      
      // Act
      const result = ErrorHandler.handleError(fileError);
      
      // Assert
      expect(result).toContain('File system error');
      expect(result).toContain('not found');
      expect(result).toContain('/path/to/file');
    });
    
    it('should handle parsing errors', () => {
      // Arrange
      const parseError = new Error('Invalid JSON') as ParsingError;
      parseError.line = 10;
      parseError.column = 5;
      
      // Act
      const result = ErrorHandler.handleError(parseError);
      
      // Assert
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
      // Arrange
      const timeoutError = new Error('Connection timed out') as NetworkError;
      timeoutError.code = 'ETIMEDOUT';
      
      // Act
      const result = ErrorHandler.handleError(timeoutError);
      
      // Assert
      expect(result).toContain('server took too long');
    });
    
    it('should provide specific suggestions for ECONNREFUSED', () => {
      // Arrange
      const refusedError = new Error('Connection refused') as NetworkError;
      refusedError.code = 'ECONNREFUSED';
      
      // Act
      const result = ErrorHandler.handleError(refusedError);
      
      // Assert
      expect(result).toContain('server refused');
    });
    
    it('should provide specific suggestions for HTTP status codes', () => {
      // Arrange
      const notFoundError = new Error('Not Found') as NetworkError;
      notFoundError.code = 'NETWORK_ERROR'; // Need to set a code to be recognized as NetworkError
      notFoundError.statusCode = 404;
      
      // Act
      const result = ErrorHandler.handleError(notFoundError);
      
      // Assert
      expect(result).toContain('resource was not found');
    });
  });
  
  describe('File system error handling', () => {
    it('should provide specific suggestions for EACCES', () => {
      // Arrange
      const accessError = new Error('Permission denied') as FileSystemError;
      accessError.code = 'EACCES';
      accessError.path = '/path/to/file';
      
      // Act
      const result = ErrorHandler.handleError(accessError);
      
      // Assert
      expect(result).toContain('Permission denied');
      expect(result).toContain('necessary permissions');
    });
    
    it('should provide specific suggestions for EISDIR', () => {
      // Arrange
      const isDirError = new Error('Is a directory') as FileSystemError;
      isDirError.code = 'EISDIR';
      isDirError.path = '/path/to/dir';
      
      // Act
      const result = ErrorHandler.handleError(isDirError);
      
      // Assert
      expect(result).toContain('Expected a file but found a directory');
    });
  });
});