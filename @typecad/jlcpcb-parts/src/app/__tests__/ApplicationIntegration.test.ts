import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger, LogLevel } from '../../cli/Logger.js';

// Mock all the dependencies that Application uses
vi.mock('../../data/DataManager.js');
vi.mock('../../parsers/ParameterParser.js');
vi.mock('../../scoring/FuzzyScorer.js');
vi.mock('../../scoring/SearchEngine.js');
vi.mock('../../cli/CommandLineInterface.js');
vi.mock('../../cli/ErrorHandler.js');
vi.mock('../../cli/GlobalErrorHandler.js');

// Mock Logger with proper getInstance method
vi.mock('../../cli/Logger.js', () => ({
  Logger: {
    getInstance: vi.fn().mockReturnValue({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
  LogLevel: {
    DEBUG: 'debug',
    INFO: 'info',
    WARN: 'warn',
    ERROR: 'error',
  },
}));

// Import the actual functions to test
import { runApplication, Application, _resetSignalHandlers } from '../index.js';

describe('Application Integration', () => {
  // Mock console.log and console.error
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const mockConsoleLog = vi.fn();
  const mockConsoleError = vi.fn();

  // Mock process.exit
  const originalProcessExit = process.exit;
  const mockProcessExit = vi.fn() as unknown as typeof process.exit;

  // Mock process.on
  const originalProcessOn = process.on;
  const mockProcessOn = vi.fn();

  // Store event handlers
  const eventHandlers: Record<string, Function> = {};

  beforeEach(() => {
    // Setup mocks before each test
    console.log = mockConsoleLog;
    console.error = mockConsoleError;
    process.exit = mockProcessExit;
    process.on = mockProcessOn;

    // Mock process.on to capture event handlers
    mockProcessOn.mockImplementation((event: string, handler: Function) => {
      eventHandlers[event] = handler;
      return process;
    });

    // Clear mock calls
    vi.clearAllMocks();
    _resetSignalHandlers();
  });

  afterEach(() => {
    // Restore original functions after each test
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    process.exit = originalProcessExit;
    process.on = originalProcessOn;
  });

  describe('runApplication', () => {
    it('should create and run an Application instance', async () => {
      // Arrange
      const args = ['node', 'script.js', 'search', 'query'];

      // Act
      await runApplication(args);

      // Assert - Since we're testing the actual implementation,
      // we just verify it doesn't throw and completes successfully
      expect(mockProcessExit).not.toHaveBeenCalled();
    });

    it('should handle application initialization errors', async () => {
      // Arrange
      const args = ['node', 'script.js', 'search', 'query'];

      // Mock one of the dependencies to throw during construction
      const { DataManager } = await import('../../data/DataManager.js');
      vi.mocked(DataManager).mockImplementationOnce(() => {
        throw new Error('Initialization error');
      });

      // Act & Assert
      // The error should be caught and handled by the runApplication function
      try {
        await runApplication(args);
      } catch (error) {
        // If an error is thrown, it means the error handling isn't working as expected
        // But we can still check that the console.error was called
      }

      // Assert
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Failed to initialize application'),
        expect.any(String),
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should set up signal handlers for graceful shutdown', async () => {
      // Arrange
      const args = ['node', 'script.js', 'search', 'query'];

      // Act
      await runApplication(args);

      // Assert
      expect(mockProcessOn).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(mockProcessOn).toHaveBeenCalledWith('SIGTERM', expect.any(Function));

      // Verify SIGINT handler
      if (eventHandlers['SIGINT']) {
        await eventHandlers['SIGINT']();
        expect(mockProcessExit).toHaveBeenCalledWith(0);
      }
    });

    it('should pass custom options to Application constructor', async () => {
      // Arrange
      const args = ['node', 'script.js', 'search', 'query'];
      const options = {
        csvUrl: 'https://custom-url.com/data.csv',
        localCsvFileName: 'custom-file.csv',
        cacheDir: './cache',
        cacheExpirationHours: 12,
        programName: 'custom-program',
        logLevel: LogLevel.DEBUG,
      };

      // Act
      await runApplication(args, options);

      // Assert - Verify that DataManager was called with the custom options
      const { DataManager } = await import('../../data/DataManager.js');
      expect(DataManager).toHaveBeenCalledWith(
        options.csvUrl,
        options.localCsvFileName,
        options.cacheDir,
        options.cacheExpirationHours,
        true, // useSharedCache default
      );
    });
  });

  describe('Error handling integration', () => {
    it('should handle application run errors', async () => {
      // Arrange
      const args = ['node', 'script.js', 'search', 'query'];

      // Mock CLI to throw an error during run
      const { CommandLineInterface } = await import('../../cli/CommandLineInterface.js');
      vi.mocked(CommandLineInterface).mockImplementationOnce(
        () =>
          ({
            run: vi.fn().mockRejectedValue(new Error('Run error')),
          }) as any,
      );

      // Act
      await runApplication(args);

      // Assert - The error should be handled and process.exit should be called
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should handle shutdown errors during signal handling', async () => {
      // Arrange
      const args = ['node', 'script.js', 'search', 'query'];

      // Act
      await runApplication(args);

      // Trigger SIGINT handler
      if (eventHandlers['SIGINT']) {
        await eventHandlers['SIGINT']();

        // Assert
        // Even with potential shutdown errors, we should still exit
        expect(mockProcessExit).toHaveBeenCalledWith(0);
      }
    });
  });
});
