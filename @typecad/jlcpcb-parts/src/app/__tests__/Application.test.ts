import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Application } from '../index.js';
import { ComponentSearchEngine } from '../../scoring/SearchEngine.js';
import { DataManager } from '../../data/DataManager.js';
import { Logger, LogLevel } from '../../cli/Logger.js';
import { GlobalErrorHandler } from '../../cli/GlobalErrorHandler.js';

// Mock the dependencies
vi.mock('../../data/DataManager.js', () => ({
  DataManager: vi.fn().mockImplementation(function () {
    return {
      ensureDataAvailable: vi.fn().mockResolvedValue(undefined),
      getCsvData: vi.fn().mockResolvedValue([
        {
          lcsc: 'C1234',
          category_id: '1',
          category: 'Capacitors',
          subcategory: 'Ceramic Capacitors',
          mfr: 'Samsung',
          package: '0603',
          joints: '2',
          manufacturer: 'Samsung',
          basic: 'Y',
          preferred: 'Y',
          description: '100nF 50V X7R 0603 Ceramic Capacitor',
          datasheet: 'https://example.com/datasheet.pdf',
          stock: '10000',
          last_on_stock: '2023-01-01',
          price: '0.01',
          extra: '',
          assembly_process: 'SMT',
          min_order_qty: '10',
          attrition_qty: '1',
        },
      ]),
    };
  }),
}));

vi.mock('../../parsers/ParameterParser.js', () => ({
  ElectricalParameterParser: vi.fn().mockImplementation(function () {
    return {
      parseQuery: vi.fn().mockReturnValue({
        value: { value: 1e-7, unit: 'F', originalText: '100nF' },
      }),
    };
  }),
}));

vi.mock('../../scoring/FuzzyScorer.js', () => ({
  ComponentFuzzyScorer: vi.fn().mockImplementation(function () {
    return {
      rankComponents: vi.fn().mockReturnValue([
        {
          component: {
            lcsc: 'C1234',
            description: '100nF 50V X7R 0603 Ceramic Capacitor',
          },
          score: 95,
          matchDetails: [],
        },
      ]),
      filterTopResults: vi.fn().mockImplementation((components) => components),
      generateMatchSummary: vi.fn().mockReturnValue('Matched on value and package'),
    };
  }),
}));

vi.mock('../../scoring/SearchEngine.js', () => ({
  ComponentSearchEngine: vi.fn().mockImplementation(function () {
    return {
      search: vi.fn().mockResolvedValue([
        {
          lcsc: 'C1234',
          manufacturer: 'Samsung',
          partNumber: 'ABC123',
          description: '100nF 50V X7R 0603 Ceramic Capacitor',
          package: '0603',
          score: 95,
          matchSummary: 'Matched on value and package',
        },
      ]),
      clearCache: vi.fn(),
    };
  }),
}));

vi.mock('../../cli/CommandLineInterface.js', () => ({
  CommandLineInterface: vi.fn().mockImplementation(function () {
    return {
      run: vi.fn().mockResolvedValue(undefined),
    };
  }),
}));

// Mock the Logger class
vi.mock('../../cli/Logger.js', () => ({
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
  LogLevel: {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    NONE: 4,
  },
}));

// Mock the GlobalErrorHandler class
vi.mock('../../cli/GlobalErrorHandler.js', () => ({
  GlobalErrorHandler: {
    initialize: vi.fn(),
  },
}));

describe('Application', () => {
  // Mock console.log and console.error
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const mockConsoleLog = vi.fn();
  const mockConsoleError = vi.fn();

  // Mock process.exit
  const originalProcessExit = process.exit;
  const mockProcessExit = vi.fn() as unknown as typeof process.exit;

  beforeEach(() => {
    // Setup mocks before each test
    console.log = mockConsoleLog;
    console.error = mockConsoleError;
    process.exit = mockProcessExit;

    // Clear mock calls
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original functions after each test
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    process.exit = originalProcessExit;
  });

  describe('constructor', () => {
    it('should create an instance with default parameters', () => {
      // Act
      const app = new Application();

      // Assert
      expect(app).toBeDefined();
      expect(Logger.getInstance).toHaveBeenCalled();
      expect(GlobalErrorHandler.initialize).toHaveBeenCalled();
      expect(DataManager).toHaveBeenCalled();
      expect(ComponentSearchEngine).toHaveBeenCalled();
    });

    it('should create an instance with custom parameters', () => {
      // Act
      const app = new Application(
        'https://custom-url.com/data.csv',
        'custom-file.csv',
        './cache',
        12,
        'custom-program',
        LogLevel.DEBUG,
        false, // Use isolated cache for tests
      );

      // Assert
      expect(app).toBeDefined();
      expect(Logger.getInstance).toHaveBeenCalledWith({
        consoleLevel: LogLevel.DEBUG,
      });
      expect(DataManager).toHaveBeenCalledWith(
        'https://custom-url.com/data.csv',
        'custom-file.csv',
        './cache',
        12,
        false,
      );
    });

    it('should handle initialization errors', () => {
      // Arrange
      const error = new Error('Initialization error');
      (DataManager as any).mockImplementationOnce(function () {
        throw error;
      });

      // Act & Assert
      expect(() => new Application()).toThrow(error);
      expect(Logger.getInstance().error).toHaveBeenCalledWith('Failed to initialize application', error);
    });
  });

  describe('run', () => {
    it('should run the CLI with the provided arguments', async () => {
      // Arrange
      const app = new Application();
      const args = ['node', 'script.js', 'search', 'query'];

      // Act
      await app.run(args);

      // Assert
      const cli = (app as any).cli;
      expect(cli.run).toHaveBeenCalledWith(args);
      expect(app.getLogger().info).toHaveBeenCalledWith('Starting application', { args: ['search', 'query'] });
      expect(app.getLogger().info).toHaveBeenCalledWith('Application completed successfully');
    });

    it('should handle errors gracefully', async () => {
      const app = new Application();
      const args = ['node', 'script.js', 'search', 'query'];
      const error = new Error('Test error');

      (app as any).cli.run = vi.fn().mockRejectedValue(error);

      await expect(app.run(args)).rejects.toThrow('Test error');

      expect(app.getLogger().error).toHaveBeenCalledWith('Application failed', error);
      expect(mockConsoleError).toHaveBeenCalled();
    });
  });

  describe('shutdown', () => {
    it('should perform cleanup operations', async () => {
      // Arrange
      const app = new Application();

      // Act
      await app.shutdown();

      // Assert
      expect(app.getLogger().info).toHaveBeenCalledWith('Shutting down application...');
      expect(app.getLogger().info).toHaveBeenCalledWith('Application shutdown complete');
      expect((app.getSearchEngine() as any).clearCache).toHaveBeenCalled();
    });

    it('should handle errors during shutdown', async () => {
      // Arrange
      const app = new Application();
      const error = new Error('Shutdown error');

      // Mock clearCache to throw an error
      (app.getSearchEngine() as any).clearCache = vi.fn().mockImplementation(() => {
        throw error;
      });

      // Act
      await app.shutdown();

      // Assert
      expect(app.getLogger().error).toHaveBeenCalledWith('Error during shutdown', error);
    });
  });

  describe('getters', () => {
    it('should return the search engine instance', () => {
      // Arrange
      const app = new Application();

      // Act
      const searchEngine = app.getSearchEngine();

      // Assert
      expect(searchEngine).toBeDefined();
    });

    it('should return the data manager instance', () => {
      // Arrange
      const app = new Application();

      // Act
      const dataManager = app.getDataManager();

      // Assert
      expect(dataManager).toBeDefined();
    });
  });
});
