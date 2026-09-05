import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger, LogLevel } from '../Logger.js';

describe('Logger', () => {
  // Mock console methods
  const originalConsoleLog = console.log;
  const originalConsoleInfo = console.info;
  const originalConsoleWarn = console.warn;
  const originalConsoleError = console.error;
  const originalConsoleDebug = console.debug;

  const mockConsoleLog = vi.fn();
  const mockConsoleInfo = vi.fn();
  const mockConsoleWarn = vi.fn();
  const mockConsoleError = vi.fn();
  const mockConsoleDebug = vi.fn();

  beforeEach(() => {
    // Setup mocks before each test
    console.log = mockConsoleLog;
    console.info = mockConsoleInfo;
    console.warn = mockConsoleWarn;
    console.error = mockConsoleError;
    console.debug = mockConsoleDebug;

    // Clear mock calls
    vi.clearAllMocks();

    // Reset Logger singleton
    (Logger as any).instance = undefined;
  });

  afterEach(() => {
    // Restore original console methods
    console.log = originalConsoleLog;
    console.info = originalConsoleInfo;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
    console.debug = originalConsoleDebug;
  });

  describe('getInstance', () => {
    it('should create a singleton instance with default options', () => {
      // Act
      const logger1 = Logger.getInstance();
      const logger2 = Logger.getInstance();

      // Assert
      expect(logger1).toBe(logger2);
    });

    it('should create a singleton instance with custom options', () => {
      // Act
      const logger = Logger.getInstance({
        consoleLevel: LogLevel.DEBUG,
        includeTimestamps: false,
      });

      // Assert
      expect(logger).toBeDefined();
    });
  });

  describe('log methods', () => {
    it('should log debug messages', () => {
      // Arrange
      const logger = Logger.getInstance({ consoleLevel: LogLevel.DEBUG });

      // Act
      logger.debug('Debug message');

      // Assert
      expect(mockConsoleDebug).toHaveBeenCalled();
    });

    it('should log info messages', () => {
      // Arrange
      const logger = Logger.getInstance();

      // Act
      logger.info('Info message');

      // Assert
      expect(mockConsoleInfo).toHaveBeenCalled();
    });

    it('should log warning messages', () => {
      // Arrange
      const logger = Logger.getInstance();

      // Act
      logger.warn('Warning message');

      // Assert
      expect(mockConsoleWarn).toHaveBeenCalled();
    });

    it('should log error messages', () => {
      // Arrange
      const logger = Logger.getInstance();
      const error = new Error('Test error');

      // Act
      logger.error('Error message', error);

      // Assert
      expect(mockConsoleError).toHaveBeenCalled();
    });

    it('should not log messages below console level', () => {
      // Arrange
      const logger = Logger.getInstance({ consoleLevel: LogLevel.WARN });

      // Act
      logger.debug('Debug message');
      logger.info('Info message');

      // Assert
      expect(mockConsoleDebug).not.toHaveBeenCalled();
      expect(mockConsoleInfo).not.toHaveBeenCalled();
    });

    it('should handle additional data in log messages', () => {
      // Arrange
      const logger = Logger.getInstance();
      const data = { key: 'value' };

      // Act
      logger.info('Info message', data);

      // Assert
      expect(mockConsoleInfo).toHaveBeenCalled();
    });
  });
});
