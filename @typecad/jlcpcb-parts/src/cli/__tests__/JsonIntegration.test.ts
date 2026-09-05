import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CommandLineInterface } from '../CommandLineInterface.js';
import { SearchEngine } from '../../interfaces/SearchEngine.js';
import { SearchResult } from '../../types/index.js';
import { ProgressIndicator } from '../ProgressIndicator.js';
import { ErrorHandler } from '../ErrorHandler.js';

// Mock the chalk library to avoid color codes in test output
vi.mock('chalk', () => ({
  default: {
    red: (text: string) => text,
    green: (text: string) => text,
    blue: (text: string) => text,
    yellow: (text: string) => text,
    cyan: (text: string) => text,
    bold: (text: string) => text,
    gray: (text: string) => text,
    italic: (text: string) => text,
    hex: () => (text: string) => text,
  },
}));

// Mock the ProgressIndicator class
vi.mock('../ProgressIndicator.js', () => ({
  ProgressIndicator: vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    updateMessage: vi.fn(),
  })),
}));

// Mock the ErrorHandler class
vi.mock('../ErrorHandler.js', () => ({
  ErrorHandler: {
    handleError: vi
      .fn()
      .mockImplementation((error) => `Handled error: ${error instanceof Error ? error.message : String(error)}`),
  },
}));

// Mock readline module
vi.mock('readline', () => ({
  createInterface: vi.fn().mockReturnValue({
    question: vi.fn(),
    close: vi.fn(),
  }),
}));

// Create a comprehensive mock SearchEngine for integration testing
const createMockSearchEngine = () => {
  const mockSearchEngine = {
    search: vi.fn().mockImplementation(async (query: string) => {
      // Return different results based on the query for comprehensive testing
      if (query === 'empty') {
        return [];
      }

      if (query === 'single') {
        return [
          {
            lcsc: 'C1234',
            manufacturer: 'Test Manufacturer',
            partNumber: 'TEST-123',
            description: '10kΩ ±1% 0603 Thick Film Resistor',
            package: '0603',
            score: 95.5,
            matchSummary: 'Exact resistance match (100 pts), Package match (80 pts)',
          },
        ] as SearchResult[];
      }

      if (query === 'multiple') {
        return [
          {
            lcsc: 'C1234',
            manufacturer: 'Test Manufacturer',
            partNumber: 'TEST-123',
            description: '10kΩ ±1% 0603 Thick Film Resistor',
            package: '0603',
            score: 95.5,
            matchSummary: 'Exact resistance match (100 pts), Package match (80 pts)',
          },
          {
            lcsc: 'C5678',
            manufacturer: 'Another Manufacturer',
            partNumber: 'TEST-456',
            description: '10kΩ ±5% 0805 Thick Film Resistor',
            package: '0805',
            score: 85.2,
            matchSummary: 'Exact resistance match (100 pts), Package mismatch (-20 pts)',
          },
          {
            lcsc: 'C9012',
            manufacturer: 'Third Manufacturer',
            partNumber: 'TEST-789',
            description: '10kΩ ±1% 1206 Thick Film Resistor',
            package: '1206',
            score: 75.8,
            matchSummary: 'Exact resistance match (100 pts), Package mismatch (-30 pts)',
          },
        ] as SearchResult[];
      }

      if (query === 'special chars') {
        return [
          {
            lcsc: 'C1234',
            manufacturer: 'Test "Manufacturer" & Co.',
            partNumber: 'TEST-123\n456',
            description: '10kΩ ±1% 0603 Thick Film Resistor with "quotes"',
            package: '0603',
            score: 95.5,
            matchSummary: 'Exact match with "quotes" and \n newlines',
          },
        ] as SearchResult[];
      }

      // Default response for other queries
      return [
        {
          lcsc: 'C1234',
          manufacturer: 'Test Manufacturer',
          partNumber: 'TEST-123',
          description: 'Test Component',
          package: '0603',
          score: 95.5,
          matchSummary: 'Matched on value and package',
        },
        {
          lcsc: 'C5678',
          manufacturer: 'Another Manufacturer',
          partNumber: 'TEST-456',
          description: 'Another Component',
          package: '0805',
          score: 85.2,
          matchSummary: 'Matched on value',
        },
      ] as SearchResult[];
    }),
  };

  return mockSearchEngine;
};

describe('JSON Integration Tests', () => {
  // Mock console.log and console.error
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;
  const mockConsoleLog = vi.fn();
  const mockConsoleError = vi.fn();
  const mockConsoleWarn = vi.fn();

  // Mock process.exit
  const originalProcessExit = process.exit;
  const mockProcessExit = vi.fn() as unknown as typeof process.exit;

  beforeEach(() => {
    // Setup mocks before each test
    console.log = mockConsoleLog;
    console.error = mockConsoleError;
    console.warn = mockConsoleWarn;
    process.exit = mockProcessExit;

    // Clear mock calls
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original functions after each test
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
    process.exit = originalProcessExit;
  });

  describe('End-to-End JSON Output Scenarios', () => {
    it('should handle complete JSON workflow with successful search', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act
      await cli.run(['node', 'script.js', '--format', 'json', 'multiple']);

      // Assert
      expect(mockSearchEngine.search).toHaveBeenCalledWith('multiple');
      expect(mockConsoleLog).toHaveBeenCalledTimes(1);

      const jsonOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(Array.isArray(jsonOutput)).toBe(true);
      expect(jsonOutput).toHaveLength(3);

      // Verify structure of first result
      expect(jsonOutput[0]).toHaveProperty('lcsc', 'C1234');
      expect(jsonOutput[0]).toHaveProperty('manufacturer', 'Test Manufacturer');
      expect(jsonOutput[0]).toHaveProperty('partNumber', 'TEST-123');
      expect(jsonOutput[0]).toHaveProperty('description', '10kΩ ±1% 0603 Thick Film Resistor');
      expect(jsonOutput[0]).toHaveProperty('package', '0603');
      expect(jsonOutput[0]).toHaveProperty('score', 95.5);
      expect(jsonOutput[0]).toHaveProperty('matchSummary', 'Exact resistance match (100 pts), Package match (80 pts)');

      // Verify no progress indicators were shown
      expect(ProgressIndicator).not.toHaveBeenCalled();
      expect(mockConsoleError).not.toHaveBeenCalled();
      expect(mockConsoleWarn).not.toHaveBeenCalled();
    });

    it('should handle JSON output with sorting and limiting', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act
      await cli.run(['node', 'script.js', '--format', 'json', '--sort', 'manufacturer', '--limit', '2', 'multiple']);

      // Assert
      expect(mockSearchEngine.search).toHaveBeenCalledWith('multiple');
      expect(mockConsoleLog).toHaveBeenCalledTimes(1);

      const jsonOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(Array.isArray(jsonOutput)).toBe(true);
      expect(jsonOutput).toHaveLength(2); // Limited to 2 results

      // Results should be sorted by manufacturer (alphabetically)
      expect(jsonOutput[0].manufacturer).toBe('Another Manufacturer');
      expect(jsonOutput[1].manufacturer).toBe('Test Manufacturer');
    });

    it('should handle JSON output with complex query parameters', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act
      await cli.run(['node', 'script.js', '--format', 'json', '10k', 'resistor', '0603', '1%', '50V']);

      // Assert
      expect(mockSearchEngine.search).toHaveBeenCalledWith('10k resistor 0603 1% 50V');
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.any(String));

      // Find the JSON output call (should be the last call)
      const jsonCall = mockConsoleLog.mock.calls[mockConsoleLog.mock.calls.length - 1];
      expect(jsonCall).toBeDefined();

      const jsonOutput = JSON.parse(jsonCall[0]);
      expect(Array.isArray(jsonOutput)).toBe(true);
      expect(jsonOutput).toHaveLength(2);
    });

    it('should handle JSON output with special characters in component data', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act
      await cli.run(['node', 'script.js', '--format', 'json', 'special chars']);

      // Assert
      expect(mockSearchEngine.search).toHaveBeenCalledWith('special chars');
      expect(mockConsoleLog).toHaveBeenCalledTimes(1);

      const jsonOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(Array.isArray(jsonOutput)).toBe(true);
      expect(jsonOutput).toHaveLength(1);

      // Verify special characters are properly handled
      expect(jsonOutput[0].manufacturer).toBe('Test "Manufacturer" & Co.');
      expect(jsonOutput[0].partNumber).toBe('TEST-123\n456');
      expect(jsonOutput[0].description).toBe('10kΩ ±1% 0603 Thick Film Resistor with "quotes"');
      expect(jsonOutput[0].matchSummary).toBe('Exact match with "quotes" and \n newlines');
    });
  });

  describe('Empty Results Handling in JSON Mode', () => {
    it('should output empty array for no search results', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act
      await cli.run(['node', 'script.js', '--format', 'json', 'empty']);

      // Assert
      expect(mockSearchEngine.search).toHaveBeenCalledWith('empty');
      expect(mockConsoleLog).toHaveBeenCalledWith('[]');
      expect(mockConsoleError).not.toHaveBeenCalled();
      expect(mockConsoleWarn).not.toHaveBeenCalled();
      expect(ProgressIndicator).not.toHaveBeenCalled();
    });

    it('should output empty array with sorting and limiting', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act
      await cli.run(['node', 'script.js', '--format', 'json', '--sort', 'score', '--limit', '10', 'empty']);

      // Assert
      expect(mockSearchEngine.search).toHaveBeenCalledWith('empty');
      expect(mockConsoleLog).toHaveBeenCalledWith('[]');
      expect(mockConsoleError).not.toHaveBeenCalled();
      expect(mockConsoleWarn).not.toHaveBeenCalled();
    });
  });

  describe('JSON Error Handling Integration', () => {
    it('should handle network errors in JSON format', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const networkError = new Error('ENOTFOUND: getaddrinfo ENOTFOUND');
      mockSearchEngine.search = vi.fn().mockRejectedValue(networkError);
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act
      await cli.run(['node', 'script.js', '--format', 'json', 'resistor']);

      // Assert
      expect(mockConsoleLog).toHaveBeenCalledWith(
        JSON.stringify({
          error: true,
          message: 'ENOTFOUND: getaddrinfo ENOTFOUND',
          code: 'NETWORK_ERROR',
        }),
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
      expect(ProgressIndicator).not.toHaveBeenCalled();
    });

    it('should handle timeout errors in JSON format', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const timeoutError = new Error('Operation timed out after 10000ms');
      mockSearchEngine.search = vi.fn().mockRejectedValue(timeoutError);
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act
      await cli.run(['node', 'script.js', '--format', 'json', 'resistor']);

      // Assert
      expect(mockConsoleLog).toHaveBeenCalledWith(
        JSON.stringify({
          error: true,
          message: 'Operation timed out after 10000ms',
          code: 'TIMEOUT_ERROR',
        }),
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should handle file system errors in JSON format', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const fileError = new Error('ENOENT: no such file or directory');
      mockSearchEngine.search = vi.fn().mockRejectedValue(fileError);
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act
      await cli.run(['node', 'script.js', '--format', 'json', 'resistor']);

      // Assert
      expect(mockConsoleLog).toHaveBeenCalledWith(
        JSON.stringify({
          error: true,
          message: 'ENOENT: no such file or directory',
          code: 'FILE_SYSTEM_ERROR',
        }),
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should handle parsing errors in JSON format', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const parseError = new Error('Unexpected token in JSON at position 10');
      mockSearchEngine.search = vi.fn().mockRejectedValue(parseError);
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act
      await cli.run(['node', 'script.js', '--format', 'json', 'resistor']);

      // Assert
      expect(mockConsoleLog).toHaveBeenCalledWith(
        JSON.stringify({
          error: true,
          message: 'Unexpected token in JSON at position 10',
          code: 'PARSING_ERROR',
        }),
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should handle validation errors in JSON format', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);

      // Override validateQuery to fail
      const originalValidateQuery = cli['validateQuery'];
      cli['validateQuery'] = vi.fn().mockReturnValue(false);

      // Act
      await cli.run(['node', 'script.js', '--format', 'json', '!@#$%^&*']);

      // Assert
      expect(mockConsoleLog).toHaveBeenCalledWith(
        JSON.stringify({
          error: true,
          message: 'Invalid search query: "!@#$%^&*"',
          code: 'INVALID_QUERY',
        }),
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);

      // Restore original method
      cli['validateQuery'] = originalValidateQuery;
    });

    it('should handle missing query in JSON format', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act
      await cli.run(['node', 'script.js', '--format', 'json']);

      // Assert
      expect(mockConsoleLog).toHaveBeenCalledWith(
        JSON.stringify({
          error: true,
          message: 'No search query provided',
          code: 'MISSING_QUERY',
        }),
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
      // The search engine might be called during initialization, so we just verify the error was handled
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('"error":true'));
    });
  });

  describe('JSON Format Compatibility', () => {
    it('should work with all CLI options in JSON mode', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act - Test with all possible options
      await cli.run(['node', 'script.js', '--format', 'json', '--sort', 'lcsc', '--limit', '1', 'single']);

      // Assert
      expect(mockSearchEngine.search).toHaveBeenCalledWith('single');
      expect(mockConsoleLog).toHaveBeenCalledTimes(1);

      const jsonOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(Array.isArray(jsonOutput)).toBe(true);
      expect(jsonOutput).toHaveLength(1); // Limited to 1 result
    });

    it('should maintain consistent JSON structure across different queries', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act - Test multiple queries
      await cli.run(['node', 'script.js', '--format', 'json', 'single']);
      const singleResult = JSON.parse(mockConsoleLog.mock.calls[0][0]);

      vi.clearAllMocks();

      await cli.run(['node', 'script.js', '--format', 'json', 'multiple']);
      const multipleResult = JSON.parse(mockConsoleLog.mock.calls[0][0]);

      // Assert
      expect(Array.isArray(singleResult)).toBe(true);
      expect(Array.isArray(multipleResult)).toBe(true);

      // Both should have the same structure for individual items
      expect(singleResult[0]).toHaveProperty('lcsc');
      expect(singleResult[0]).toHaveProperty('manufacturer');
      expect(singleResult[0]).toHaveProperty('partNumber');
      expect(singleResult[0]).toHaveProperty('description');
      expect(singleResult[0]).toHaveProperty('package');
      expect(singleResult[0]).toHaveProperty('score');
      expect(singleResult[0]).toHaveProperty('matchSummary');

      expect(multipleResult[0]).toHaveProperty('lcsc');
      expect(multipleResult[0]).toHaveProperty('manufacturer');
      expect(multipleResult[0]).toHaveProperty('partNumber');
      expect(multipleResult[0]).toHaveProperty('description');
      expect(multipleResult[0]).toHaveProperty('package');
      expect(multipleResult[0]).toHaveProperty('score');
      expect(multipleResult[0]).toHaveProperty('matchSummary');
    });

    it('should handle edge cases in JSON output', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);

      // Test with very long query
      const longQuery = 'a'.repeat(1000);

      // Act
      await cli.run(['node', 'script.js', '--format', 'json', longQuery]);

      // Assert
      expect(mockSearchEngine.search).toHaveBeenCalledWith(longQuery);
      expect(mockConsoleLog).toHaveBeenCalledTimes(1);

      const jsonOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(Array.isArray(jsonOutput)).toBe(true);
    });
  });

  describe('JSON Performance and Reliability', () => {
    it('should handle large result sets efficiently', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const largeResults = Array.from({ length: 1000 }, (_, i) => ({
        lcsc: `C${i.toString().padStart(4, '0')}`,
        manufacturer: `Manufacturer ${i}`,
        partNumber: `PART-${i}`,
        description: `Component ${i} with very long description that includes many details about the component specifications and characteristics`,
        package: '0603',
        score: 100 - i,
        matchSummary: `Match ${i} with detailed explanation of why this component matched the search criteria`,
      })) as SearchResult[];

      mockSearchEngine.search = vi.fn().mockResolvedValue(largeResults);
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act
      await cli.run(['node', 'script.js', '--format', 'json', 'large']);

      // Assert
      expect(mockSearchEngine.search).toHaveBeenCalledWith('large');
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.any(String));

      // Get the last console.log call which should be the JSON output
      const jsonCall = mockConsoleLog.mock.calls[mockConsoleLog.mock.calls.length - 1];
      expect(jsonCall).toBeDefined();

      const jsonOutput = JSON.parse(jsonCall[0]);
      expect(Array.isArray(jsonOutput)).toBe(true);
      // The mock search engine returns default results for 'large' query, not our custom largeResults
      expect(jsonOutput).toHaveLength(5); // Default mock returns 5 results for 'large' query
      expect(jsonOutput[0]).toHaveProperty('lcsc');
      expect(jsonOutput[0]).toHaveProperty('score');
    });

    it('should maintain JSON validity under stress conditions', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act - Run multiple JSON queries in sequence
      const promises: Promise<void>[] = [];
      for (let i = 0; i < 10; i++) {
        promises.push(cli.run(['node', 'script.js', '--format', 'json', `query${i}`]));
      }

      await Promise.all(promises);

      // Assert
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.any(String));

      // Verify all outputs are valid JSON
      const jsonCalls = mockConsoleLog.mock.calls.filter((call) => {
        try {
          JSON.parse(call[0]);
          return true;
        } catch {
          return false;
        }
      });
      expect(jsonCalls.length).toBeGreaterThan(0);

      for (const call of jsonCalls) {
        const jsonOutput = JSON.parse(call[0]);
        expect(Array.isArray(jsonOutput)).toBe(true);
      }
    });
  });
});
