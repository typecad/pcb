import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GlobalErrorHandler } from '../GlobalErrorHandler.js';
import { Logger, LogLevel } from '../Logger.js';

// Mock the Logger class
vi.mock('../Logger.js', () => ({
  Logger: {
    getInstance: vi.fn().mockReturnValue({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
    LogLevel: {
      DEBUG: 0,
      INFO: 1,
      WARN: 2,
      ERROR: 3,
      NONE: 4,
    },
  },
}));

// Mock the ErrorHandler class
vi.mock('../ErrorHandler.js', () => ({
  ErrorHandler: {
    handleError: vi.fn().mockReturnValue('Handled error message'),
  },
}));

describe('GlobalErrorHandler', () => {
  // Mock process.exit
  const originalProcessExit = process.exit;
  const mockProcessExit = vi.fn() as unknown as typeof process.exit;

  // Mock console.error
  const originalConsoleError = console.error;
  const mockConsoleError = vi.fn();

  // Mock process event handlers
  const originalProcessOn = process.on;
  const mockProcessOn = vi.fn();

  // Store original event handlers
  const originalEventHandlers: Record<string, any> = {};

  beforeEach(() => {
    // Setup mocks before each test
    process.exit = mockProcessExit;
    console.error = mockConsoleError;
    process.on = mockProcessOn;

    // Store event handlers for testing
    mockProcessOn.mockImplementation((event: string, handler: any) => {
      originalEventHandlers[event] = handler;
      return process;
    });

    // Clear mock calls
    vi.clearAllMocks();

    // Reset GlobalErrorHandler
    (GlobalErrorHandler as any).isInitialized = false;
  });

  afterEach(() => {
    // Restore original functions
    process.exit = originalProcessExit;
    console.error = originalConsoleError;
    process.on = originalProcessOn;
  });

  describe('initialize', () => {
    it('should initialize the global error handler', () => {
      // Arrange
      const logger = Logger.getInstance();

      // Act
      GlobalErrorHandler.initialize(logger);

      // Assert
      expect(mockProcessOn).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
      expect(mockProcessOn).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));
      expect(mockProcessOn).toHaveBeenCalledWith('warning', expect.any(Function));
      expect(mockProcessOn).toHaveBeenCalledWith('exit', expect.any(Function));
      expect(logger.info).toHaveBeenCalledWith('Global error handler initialized');
    });

    it('should not initialize twice', () => {
      // Arrange
      const logger = Logger.getInstance();

      // Act
      GlobalErrorHandler.initialize(logger);
      mockProcessOn.mockClear();
      GlobalErrorHandler.initialize(logger);

      // Assert
      expect(mockProcessOn).not.toHaveBeenCalled();
    });
  });

  describe('event handlers', () => {
    it('should handle uncaught exceptions', () => {
      // Arrange
      const logger = Logger.getInstance();
      GlobalErrorHandler.initialize(logger);
      const error = new Error('Test error');

      // Act
      originalEventHandlers['uncaughtException'](error);

      // Assert
      expect(logger.error).toHaveBeenCalledWith('Uncaught exception', error);
      expect(mockConsoleError).toHaveBeenCalledWith('\nFatal error: Handled error message');
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should handle unhandled rejections', () => {
      // Arrange
      const logger = Logger.getInstance();
      GlobalErrorHandler.initialize(logger);
      const reason = new Error('Test rejection');

      // Act
      originalEventHandlers['unhandledRejection'](reason);

      // Assert
      expect(logger.error).toHaveBeenCalledWith('Unhandled rejection', reason);
      expect(mockConsoleError).toHaveBeenCalledWith('\nFatal error: Handled error message');
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should handle non-Error rejections', () => {
      // Arrange
      const logger = Logger.getInstance();
      GlobalErrorHandler.initialize(logger);
      const reason = 'String rejection';

      // Act
      originalEventHandlers['unhandledRejection'](reason);

      // Assert
      expect(logger.error).toHaveBeenCalledWith('Unhandled rejection', expect.any(Error));
      expect(mockConsoleError).toHaveBeenCalledWith('\nFatal error: Handled error message');
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should handle warnings', () => {
      // Arrange
      const logger = Logger.getInstance();
      GlobalErrorHandler.initialize(logger);
      const warning = new Error('Test warning');

      // Act
      originalEventHandlers['warning'](warning);

      // Assert
      expect(logger.warn).toHaveBeenCalledWith('Warning', warning);
    });

    it('should handle exit', () => {
      // Arrange
      const logger = Logger.getInstance();
      GlobalErrorHandler.initialize(logger);

      // Act
      originalEventHandlers['exit'](0);

      // Assert
      expect(logger.info).toHaveBeenCalledWith('Process exiting with code 0');
    });
  });
});
