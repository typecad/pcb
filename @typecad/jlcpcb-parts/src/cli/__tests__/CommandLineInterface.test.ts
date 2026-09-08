import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf-8'));

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
  ProgressIndicator: vi.fn().mockImplementation(function () {
    return {
      start: vi.fn(),
      stop: vi.fn(),
      updateMessage: vi.fn(),
    };
  }),
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

// Create a mock SearchEngine for testing
const createMockSearchEngine = () => {
  const mockSearchEngine = {
    search: vi.fn().mockImplementation(async (query: string) => {
      // Return mock results based on the query
      if (query === 'empty') {
        return [];
      }

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

describe('CommandLineInterface', () => {
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

  describe('run', () => {
    it('should display help when --help flag is provided', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);
      const displayHelpSpy = vi.spyOn(cli, 'displayHelp');

      // Act
      await cli.run(['node', 'script.js', '--help']);

      // Assert
      expect(displayHelpSpy).toHaveBeenCalled();
      expect(mockSearchEngine.search).not.toHaveBeenCalled();
    });

    it('should display help when -h flag is provided', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);
      const displayHelpSpy = vi.spyOn(cli, 'displayHelp');

      // Act
      await cli.run(['node', 'script.js', '-h']);

      // Assert
      expect(displayHelpSpy).toHaveBeenCalled();
      expect(mockSearchEngine.search).not.toHaveBeenCalled();
    });

    it('should display version when --version flag is provided', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act
      await cli.run(['node', 'script.js', '--version']);

      // Assert
      expect(mockConsoleLog).toHaveBeenCalledWith(`jlcpcb-search version ${version}`);
      expect(mockSearchEngine.search).not.toHaveBeenCalled();
    });

    it('should display version when -v flag is provided', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act
      await cli.run(['node', 'script.js', '-v']);

      // Assert
      expect(mockConsoleLog).toHaveBeenCalledWith(`jlcpcb-search version ${version}`);
      expect(mockSearchEngine.search).not.toHaveBeenCalled();
    });

    it('should prompt for query when no query is provided in interactive mode', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);

      // Mock the promptForSearchQuery method to return empty string (user pressed enter)
      const promptSpy = vi.spyOn(cli as any, 'promptForSearchQuery').mockResolvedValue('');

      // Act
      await cli.run(['node', 'script.js']);

      // Assert
      expect(promptSpy).toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith('No search query provided. Exiting.');
      expect(mockProcessExit).toHaveBeenCalledWith(0);
    });

    it('should perform search when user provides query through interactive prompt', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);
      const displayResultsSpy = vi.spyOn(cli, 'displayResults');

      // Mock the promptForSearchQuery method to return a search query
      const promptSpy = vi.spyOn(cli as any, 'promptForSearchQuery').mockResolvedValue('resistor 10k');

      // Act
      await cli.run(['node', 'script.js']);

      // Assert
      expect(promptSpy).toHaveBeenCalled();
      expect(mockSearchEngine.search).toHaveBeenCalledWith('resistor 10k');
      expect(displayResultsSpy).toHaveBeenCalled();
    });

    it('should not prompt in JSON format and return error immediately', async () => {
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
    });

    it('should validate the search query', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);

      // Override the validateQuery method to fail for our test
      const originalValidateQuery = cli['validateQuery'];
      cli['validateQuery'] = vi.fn().mockReturnValue(false);

      // Act
      await cli.run(['node', 'script.js', '!@#$%^&*']);

      // Assert
      expect(mockConsoleError).toHaveBeenCalledWith('Error: Invalid search query: "!@#$%^&*"');
      expect(mockProcessExit).toHaveBeenCalledWith(1);

      // Restore original method
      cli['validateQuery'] = originalValidateQuery;
    });

    it('should perform search with valid query', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);
      const displayResultsSpy = vi.spyOn(cli, 'displayResults');

      // Act
      await cli.run(['node', 'script.js', '10k', 'resistor']);

      // Assert
      expect(mockSearchEngine.search).toHaveBeenCalledWith('10k resistor');
      expect(displayResultsSpy).toHaveBeenCalled();
    });

    it('should handle search errors gracefully', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      mockSearchEngine.search = vi.fn().mockRejectedValue(new Error('Search failed'));
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act
      await cli.run(['node', 'script.js', 'test']);

      // Assert
      expect(ErrorHandler.handleError).toHaveBeenCalled();
      expect(mockConsoleError).toHaveBeenCalled();
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should use progress indicator during search', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act
      await cli.run(['node', 'script.js', 'resistor']);

      // Assert
      expect(ProgressIndicator).toHaveBeenCalled();
      const progressInstance = (ProgressIndicator as any).mock.results[0].value;
      expect(progressInstance.start).toHaveBeenCalled();
      expect(progressInstance.stop).toHaveBeenCalled();
    });

    it('should stop progress indicator when search fails', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      mockSearchEngine.search = vi.fn().mockRejectedValue(new Error('Search failed'));
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act
      await cli.run(['node', 'script.js', 'test']).catch(() => {});

      // Assert
      const progressInstance = (ProgressIndicator as any).mock.results[0].value;
      expect(progressInstance.start).toHaveBeenCalled();
      expect(progressInstance.stop).toHaveBeenCalled();
    });

    it('should provide suggestions when no results are found', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      mockSearchEngine.search = vi.fn().mockResolvedValue([]);
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act
      await cli.run(['node', 'script.js', 'empty']);

      // Assert
      expect(mockConsoleLog).toHaveBeenCalledWith('No components found matching your search criteria.');
      expect(mockConsoleLog).toHaveBeenCalledWith('Suggestions:');
      // Check that we have multiple suggestion lines
      const suggestionCalls = mockConsoleLog.mock.calls.filter(
        (call) => call[0] && typeof call[0] === 'string' && call[0].includes('-'),
      );
      expect(suggestionCalls.length).toBeGreaterThan(0);
    });

    it('should use format option when provided', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);
      const displayResultsSpy = vi.spyOn(cli, 'displayResults');

      // Act
      await cli.run(['node', 'script.js', '--format', 'table', 'resistor']);

      // Assert
      expect(mockSearchEngine.search).toHaveBeenCalledWith('resistor');
      expect(displayResultsSpy).toHaveBeenCalledWith(expect.anything(), 'table');
    });

    it('should use sort option when provided', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);
      const sortResultsSpy = vi.spyOn(cli as any, 'sortResults');

      // Act
      await cli.run(['node', 'script.js', '--sort', 'manufacturer', 'resistor']);

      // Assert
      expect(mockSearchEngine.search).toHaveBeenCalledWith('resistor');
      expect(sortResultsSpy).toHaveBeenCalled();
    });

    it('should use limit option when provided', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);
      const displayResultsSpy = vi.spyOn(cli, 'displayResults');

      // Act
      await cli.run(['node', 'script.js', '--limit', '1', 'resistor']);

      // Assert
      expect(mockSearchEngine.search).toHaveBeenCalledWith('resistor');
      // Should only pass one result to displayResults
      expect(displayResultsSpy).toHaveBeenCalledWith(expect.arrayContaining([expect.anything()]), expect.anything());
      expect(displayResultsSpy.mock.calls[0][0].length).toBe(1);
    });

    it('should warn about invalid format option', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act
      await cli.run(['node', 'script.js', '--format', 'invalid', 'resistor']);

      // Assert
      expect(mockConsoleWarn).toHaveBeenCalledWith(expect.stringContaining('Invalid format'));
      expect(mockSearchEngine.search).toHaveBeenCalledWith('resistor');
    });
  });

  describe('displayResults', () => {
    it('should display message when no results are found', () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);
      const results: SearchResult[] = [];

      // Act
      cli.displayResults(results);

      // Assert
      expect(mockConsoleLog).toHaveBeenCalledWith('No components found matching your search criteria.');
    });

    it('should display detailed results by default', () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);
      const displayDetailedResultsSpy = vi.spyOn(cli as any, 'displayDetailedResults');
      const results: SearchResult[] = [
        {
          lcsc: 'C1234',
          manufacturer: 'Test Manufacturer',
          partNumber: 'TEST-123',
          description: 'Test Component',
          package: '0603',
          score: 95.5,
          matchSummary: 'Matched on value and package',
        },
      ];

      // Act
      cli.displayResults(results);

      // Assert
      expect(displayDetailedResultsSpy).toHaveBeenCalled();
    });

    it('should display compact results when format is compact', () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);
      const displayCompactResultsSpy = vi.spyOn(cli as any, 'displayCompactResults');
      const results: SearchResult[] = [
        {
          lcsc: 'C1234',
          manufacturer: 'Test Manufacturer',
          partNumber: 'TEST-123',
          description: 'Test Component',
          package: '0603',
          score: 95.5,
          matchSummary: 'Matched on value and package',
        },
      ];

      // Act
      cli.displayResults(results, 'compact');

      // Assert
      expect(displayCompactResultsSpy).toHaveBeenCalled();
    });

    it('should display table results when format is table', () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);
      const displayTableResultsSpy = vi.spyOn(cli as any, 'displayTableResults');
      const results: SearchResult[] = [
        {
          lcsc: 'C1234',
          manufacturer: 'Test Manufacturer',
          partNumber: 'TEST-123',
          description: 'Test Component',
          package: '0603',
          score: 95.5,
          matchSummary: 'Matched on value and package',
        },
      ];

      // Act
      cli.displayResults(results, 'table');

      // Assert
      expect(displayTableResultsSpy).toHaveBeenCalled();
    });
  });

  describe('displayHelp', () => {
    it('should display help text with all options and format descriptions', () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act
      cli.displayHelp();

      // Assert
      expect(mockConsoleLog).toHaveBeenCalled();
      // Check for specific help text sections
      const calls = mockConsoleLog.mock.calls.flat().join(' ');
      expect(calls).toContain('Usage:');
      expect(calls).toContain('Options:');
      expect(calls).toContain('Examples:');
      expect(calls).toContain('--format');
      expect(calls).toContain('--sort');
      expect(calls).toContain('--limit');

      // Check for new format descriptions
      expect(calls).toContain('Output Formats:');
      expect(calls).toContain('detailed');
      expect(calls).toContain('compact');
      expect(calls).toContain('table');
      expect(calls).toContain('json');
      expect(calls).toContain('Machine-readable JSON format');
      expect(calls).toContain('suppresses all formatting and progress indicators');

      // Check for JSON format section
      expect(calls).toContain('JSON Format:');
      expect(calls).toContain('machine-readable JSON without any formatting');
      expect(calls).toContain('programmatic integration');
      expect(calls).toContain('automated scripts');
      expect(calls).toContain('empty array []');
      expect(calls).toContain('Error responses include an "error" field');

      // Check for enhanced examples
      expect(calls).toContain('--format json');
      expect(calls).toContain('jq');
    });
  });

  describe('sortResults', () => {
    it('should sort results by lcsc', () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);
      const results: SearchResult[] = [
        {
          lcsc: 'C5678',
          manufacturer: 'Test Manufacturer',
          partNumber: 'TEST-123',
          description: 'Test Component',
          package: '0603',
          score: 95.5,
          matchSummary: 'Matched on value and package',
        },
        {
          lcsc: 'C1234',
          manufacturer: 'Another Manufacturer',
          partNumber: 'TEST-456',
          description: 'Another Component',
          package: '0805',
          score: 85.2,
          matchSummary: 'Matched on value',
        },
      ];

      // Act
      (cli as any).sortResults(results, 'lcsc');

      // Assert
      expect(results[0].lcsc).toBe('C1234');
      expect(results[1].lcsc).toBe('C5678');
    });

    it('should sort results by manufacturer', () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);
      const results: SearchResult[] = [
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
      ];

      // Act
      (cli as any).sortResults(results, 'manufacturer');

      // Assert
      expect(results[0].manufacturer).toBe('Another Manufacturer');
      expect(results[1].manufacturer).toBe('Test Manufacturer');
    });
  });

  describe('getScoreColor', () => {
    it('should return green for high scores', () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act
      const colorFn = (cli as any).getScoreColor(95);

      // Assert
      // Since we mocked chalk, we can't test the actual color
      // Just verify it returns a function
      expect(typeof colorFn).toBe('function');
    });
  });

  describe('JSON format error handling', () => {
    it('should output JSON error when no query is provided in JSON format', async () => {
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
    });

    it('should output JSON error when query validation fails in JSON format', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);

      // Override the validateQuery method to fail for our test
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

    it('should output JSON error when search engine fails in JSON format', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      mockSearchEngine.search = vi.fn().mockRejectedValue(new Error('Search engine error'));
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act
      await cli.run(['node', 'script.js', '--format', 'json', 'resistor']);

      // Assert
      expect(mockConsoleLog).toHaveBeenCalledWith(
        JSON.stringify({
          error: true,
          message: 'Search engine error',
          code: 'SEARCH_ERROR',
        }),
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should output JSON error when argument parsing fails in JSON format', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);

      // Override parseArguments to throw an error
      const originalParseArguments = cli['parseArguments'];
      cli['parseArguments'] = vi.fn().mockImplementation(() => {
        throw new Error('Invalid arguments');
      });

      // Act
      await cli.run(['node', 'script.js', '--format', 'json', 'resistor']);

      // Assert
      expect(mockConsoleLog).toHaveBeenCalledWith(
        JSON.stringify({
          error: true,
          message: 'Invalid arguments',
          code: 'SYSTEM_ERROR',
        }),
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);

      // Restore original method
      cli['parseArguments'] = originalParseArguments;
    });

    it('should output JSON error with appropriate code for network errors', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const networkError = new Error('Network timeout');
      networkError.message = 'ENOTFOUND';
      mockSearchEngine.search = vi.fn().mockRejectedValue(networkError);
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act
      await cli.run(['node', 'script.js', '--format', 'json', 'resistor']);

      // Assert
      expect(mockConsoleLog).toHaveBeenCalledWith(
        JSON.stringify({
          error: true,
          message: 'ENOTFOUND',
          code: 'NETWORK_ERROR',
        }),
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should output JSON error with appropriate code for timeout errors', async () => {
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

    it('should output JSON error with appropriate code for file system errors', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const fileError = new Error('File not found');
      fileError.message = 'ENOENT: no such file or directory';
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

    it('should output JSON error with appropriate code for parsing errors', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const parseError = new Error('Invalid JSON format');
      parseError.message = 'Unexpected token in JSON at position 10';
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

    it('should output JSON error with UNKNOWN_ERROR for non-Error objects', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      mockSearchEngine.search = vi.fn().mockRejectedValue('String error');
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act
      await cli.run(['node', 'script.js', '--format', 'json', 'resistor']);

      // Assert
      expect(mockConsoleLog).toHaveBeenCalledWith(
        JSON.stringify({
          error: true,
          message: 'String error',
          code: 'UNKNOWN_ERROR',
        }),
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should output JSON error with SEARCH_ERROR for generic search errors', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const genericError = new Error('Some generic error');
      mockSearchEngine.search = vi.fn().mockRejectedValue(genericError);
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act
      await cli.run(['node', 'script.js', '--format', 'json', 'resistor']);

      // Assert
      expect(mockConsoleLog).toHaveBeenCalledWith(
        JSON.stringify({
          error: true,
          message: 'Some generic error',
          code: 'SEARCH_ERROR',
        }),
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should handle JSON format detection when argument parsing fails', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);

      // Override parseArguments to throw an error
      const originalParseArguments = cli['parseArguments'];
      cli['parseArguments'] = vi.fn().mockImplementation(() => {
        throw new Error('Parse error');
      });

      // Act - Test with explicit JSON format flag
      await cli.run(['node', 'script.js', '--format', 'json', 'resistor']);

      // Assert - Should still output JSON error
      expect(mockConsoleLog).toHaveBeenCalledWith(
        JSON.stringify({
          error: true,
          message: 'Parse error',
          code: 'SYSTEM_ERROR',
        }),
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);

      // Restore original method
      cli['parseArguments'] = originalParseArguments;
    });

    it('should not show progress indicators in JSON format', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act
      await cli.run(['node', 'script.js', '--format', 'json', 'resistor']);

      // Assert - Progress indicator should not be created in JSON mode
      expect(ProgressIndicator).not.toHaveBeenCalled();
    });

    it('should not show help text in JSON format when no query provided', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);
      const displayHelpSpy = vi.spyOn(cli, 'displayHelp');

      // Act
      await cli.run(['node', 'script.js', '--format', 'json']);

      // Assert - Help should not be displayed in JSON mode
      expect(displayHelpSpy).not.toHaveBeenCalled();
      expect(mockConsoleLog).toHaveBeenCalledWith(
        JSON.stringify({
          error: true,
          message: 'No search query provided',
          code: 'MISSING_QUERY',
        }),
      );
    });
  });

  describe('JSON argument parsing', () => {
    it('should accept json as a valid format option', () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act
      const result = (cli as any).parseArguments(['--format', 'json', 'resistor']);

      // Assert
      expect(result.format).toBe('json');
      expect(result.query).toBe('resistor');
    });

    it('should accept -f json as a valid format option', () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act
      const result = (cli as any).parseArguments(['-f', 'json', 'resistor']);

      // Assert
      expect(result.format).toBe('json');
      expect(result.query).toBe('resistor');
    });

    it('should handle json format with other options', () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act
      const result = (cli as any).parseArguments([
        '--format',
        'json',
        '--sort',
        'manufacturer',
        '--limit',
        '5',
        '10k',
        'resistor',
      ]);

      // Assert
      expect(result.format).toBe('json');
      expect(result.sortBy).toBe('manufacturer');
      expect(result.limit).toBe(5);
      expect(result.query).toBe('10k resistor');
    });

    it('should maintain backward compatibility with existing formats', () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act & Assert
      expect((cli as any).parseArguments(['--format', 'detailed', 'resistor']).format).toBe('detailed');
      expect((cli as any).parseArguments(['--format', 'compact', 'resistor']).format).toBe('compact');
      expect((cli as any).parseArguments(['--format', 'table', 'resistor']).format).toBe('table');
      expect((cli as any).parseArguments(['--format', 'json', 'resistor']).format).toBe('json');
    });
  });

  describe('JSON output formatting', () => {
    it('should output valid JSON structure for search results', () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);
      const results: SearchResult[] = [
        {
          lcsc: 'C1234',
          manufacturer: 'Test Manufacturer',
          partNumber: 'TEST-123',
          description: '10kΩ ±1% 0603 Thick Film Resistor',
          package: '0603',
          score: 95.5,
          matchSummary: 'Exact resistance match (100 pts), Package match (80 pts)',
        },
      ];

      // Act
      (cli as any).displayJsonResults(results);

      // Assert
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.any(String));
      const jsonOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(Array.isArray(jsonOutput)).toBe(true);
      expect(jsonOutput).toHaveLength(1);
      expect(jsonOutput[0]).toHaveProperty('lcsc', 'C1234');
      expect(jsonOutput[0]).toHaveProperty('manufacturer', 'Test Manufacturer');
      expect(jsonOutput[0]).toHaveProperty('partNumber', 'TEST-123');
      expect(jsonOutput[0]).toHaveProperty('description', '10kΩ ±1% 0603 Thick Film Resistor');
      expect(jsonOutput[0]).toHaveProperty('package', '0603');
      expect(jsonOutput[0]).toHaveProperty('score', 95.5);
      expect(jsonOutput[0]).toHaveProperty('matchSummary', 'Exact resistance match (100 pts), Package match (80 pts)');
    });

    it('should output empty array for no results', () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);
      const results: SearchResult[] = [];

      // Act
      (cli as any).displayJsonResults(results);

      // Assert
      expect(mockConsoleLog).toHaveBeenCalledWith('[]');
    });

    it('should output multiple results in JSON array', () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);
      const results: SearchResult[] = [
        {
          lcsc: 'C1234',
          manufacturer: 'Test Manufacturer',
          partNumber: 'TEST-123',
          description: '10kΩ Resistor',
          package: '0603',
          score: 95.5,
          matchSummary: 'Exact match',
        },
        {
          lcsc: 'C5678',
          manufacturer: 'Another Manufacturer',
          partNumber: 'TEST-456',
          description: '10kΩ Resistor',
          package: '0805',
          score: 85.2,
          matchSummary: 'Partial match',
        },
      ];

      // Act
      (cli as any).displayJsonResults(results);

      // Assert
      const jsonOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(Array.isArray(jsonOutput)).toBe(true);
      expect(jsonOutput).toHaveLength(2);
      expect(jsonOutput[0].lcsc).toBe('C1234');
      expect(jsonOutput[1].lcsc).toBe('C5678');
    });

    it('should maintain data types in JSON output', () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);
      const results: SearchResult[] = [
        {
          lcsc: 'C1234',
          manufacturer: 'Test Manufacturer',
          partNumber: 'TEST-123',
          description: '10kΩ Resistor',
          package: '0603',
          score: 95.5,
          matchSummary: 'Exact match',
        },
      ];

      // Act
      (cli as any).displayJsonResults(results);

      // Assert
      const jsonOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(typeof jsonOutput[0].score).toBe('number');
      expect(jsonOutput[0].score).toBe(95.5);
      expect(typeof jsonOutput[0].lcsc).toBe('string');
      expect(typeof jsonOutput[0].manufacturer).toBe('string');
    });

    it('should output compact JSON without pretty printing', () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);
      const results: SearchResult[] = [
        {
          lcsc: 'C1234',
          manufacturer: 'Test Manufacturer',
          partNumber: 'TEST-123',
          description: '10kΩ Resistor',
          package: '0603',
          score: 95.5,
          matchSummary: 'Exact match',
        },
      ];

      // Act
      (cli as any).displayJsonResults(results);

      // Assert
      const jsonString = mockConsoleLog.mock.calls[0][0];
      // Should be compact (no extra whitespace or newlines)
      expect(jsonString).not.toContain('\n');
      expect(jsonString).not.toContain('  ');
      // Should be valid JSON
      expect(() => JSON.parse(jsonString)).not.toThrow();
    });
  });

  describe('JSON error handling', () => {
    it('should detect MISSING_QUERY error code from error message', () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act
      (cli as any).displayJsonError(new Error('No search query provided'));

      // Assert
      expect(mockConsoleLog).toHaveBeenCalledWith(
        JSON.stringify({
          error: true,
          message: 'No search query provided',
          code: 'MISSING_QUERY',
        }),
      );
    });

    it('should detect INVALID_QUERY error code from error message', () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act
      (cli as any).displayJsonError(new Error('Invalid search query: "test"'));

      // Assert
      expect(mockConsoleLog).toHaveBeenCalledWith(
        JSON.stringify({
          error: true,
          message: 'Invalid search query: "test"',
          code: 'INVALID_QUERY',
        }),
      );
    });

    it('should detect TIMEOUT_ERROR error code from error message', () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act
      (cli as any).displayJsonError(new Error('Operation timed out after 10000ms'));

      // Assert
      expect(mockConsoleLog).toHaveBeenCalledWith(
        JSON.stringify({
          error: true,
          message: 'Operation timed out after 10000ms',
          code: 'TIMEOUT_ERROR',
        }),
      );
    });

    it('should detect NETWORK_ERROR error code from error message', () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act
      (cli as any).displayJsonError(new Error('ENOTFOUND: getaddrinfo ENOTFOUND'));

      // Assert
      expect(mockConsoleLog).toHaveBeenCalledWith(
        JSON.stringify({
          error: true,
          message: 'ENOTFOUND: getaddrinfo ENOTFOUND',
          code: 'NETWORK_ERROR',
        }),
      );
    });

    it('should detect FILE_SYSTEM_ERROR error code from error message', () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act
      (cli as any).displayJsonError(new Error('ENOENT: no such file or directory'));

      // Assert
      expect(mockConsoleLog).toHaveBeenCalledWith(
        JSON.stringify({
          error: true,
          message: 'ENOENT: no such file or directory',
          code: 'FILE_SYSTEM_ERROR',
        }),
      );
    });

    it('should detect PARSING_ERROR error code from error message', () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act
      (cli as any).displayJsonError(new Error('Unexpected token in JSON at position 10'));

      // Assert
      expect(mockConsoleLog).toHaveBeenCalledWith(
        JSON.stringify({
          error: true,
          message: 'Unexpected token in JSON at position 10',
          code: 'PARSING_ERROR',
        }),
      );
    });

    it('should use provided error code when specified', () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act
      (cli as any).displayJsonError(new Error('Some error'), 'CUSTOM_ERROR');

      // Assert
      expect(mockConsoleLog).toHaveBeenCalledWith(
        JSON.stringify({
          error: true,
          message: 'Some error',
          code: 'CUSTOM_ERROR',
        }),
      );
    });

    it('should refine SEARCH_ERROR to more specific error codes', () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act
      (cli as any).displayJsonError(new Error('ENOTFOUND: getaddrinfo ENOTFOUND'), 'SEARCH_ERROR');

      // Assert
      expect(mockConsoleLog).toHaveBeenCalledWith(
        JSON.stringify({
          error: true,
          message: 'ENOTFOUND: getaddrinfo ENOTFOUND',
          code: 'NETWORK_ERROR',
        }),
      );
    });

    it('should refine SYSTEM_ERROR to more specific error codes', () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act
      (cli as any).displayJsonError(new Error('ENOENT: no such file or directory'), 'SYSTEM_ERROR');

      // Assert
      expect(mockConsoleLog).toHaveBeenCalledWith(
        JSON.stringify({
          error: true,
          message: 'ENOENT: no such file or directory',
          code: 'FILE_SYSTEM_ERROR',
        }),
      );
    });

    it('should use UNKNOWN_ERROR for non-Error objects with generic codes', () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act
      (cli as any).displayJsonError('String error', 'SEARCH_ERROR');

      // Assert
      expect(mockConsoleLog).toHaveBeenCalledWith(
        JSON.stringify({
          error: true,
          message: 'String error',
          code: 'UNKNOWN_ERROR',
        }),
      );
    });

    it('should use SYSTEM_ERROR for generic errors without specific patterns', () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act
      (cli as any).displayJsonError(new Error('Some generic error'));

      // Assert
      expect(mockConsoleLog).toHaveBeenCalledWith(
        JSON.stringify({
          error: true,
          message: 'Some generic error',
          code: 'SYSTEM_ERROR',
        }),
      );
    });

    it('should use UNKNOWN_ERROR for non-Error objects without specific patterns', () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act
      (cli as any).displayJsonError('Some string error');

      // Assert
      expect(mockConsoleLog).toHaveBeenCalledWith(
        JSON.stringify({
          error: true,
          message: 'Some string error',
          code: 'UNKNOWN_ERROR',
        }),
      );
    });
  });

  describe('JSON error handling integration', () => {
    it('should handle end-to-end JSON error output for missing query', async () => {
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
      // Ensure no help text or other output was displayed
      expect(mockConsoleError).not.toHaveBeenCalled();
    });

    it('should handle end-to-end JSON error output for search failures', async () => {
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
      // Ensure no progress indicators were shown
      expect(ProgressIndicator).not.toHaveBeenCalled();
    });

    it('should handle end-to-end JSON error output for validation failures', async () => {
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
  });

  describe('JSON output integration', () => {
    it('should output JSON results for successful search', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act
      await cli.run(['node', 'script.js', '--format', 'json', 'resistor']);

      // Assert
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.any(String));
      const jsonOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(Array.isArray(jsonOutput)).toBe(true);
      expect(jsonOutput).toHaveLength(2);
      expect(jsonOutput[0]).toHaveProperty('lcsc');
      expect(jsonOutput[0]).toHaveProperty('score');
      expect(jsonOutput[0]).toHaveProperty('description');
    });

    it('should output empty array for no results in JSON format', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      mockSearchEngine.search = vi.fn().mockResolvedValue([]);
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act
      await cli.run(['node', 'script.js', '--format', 'json', 'empty']);

      // Assert
      expect(mockConsoleLog).toHaveBeenCalledWith('[]');
      // Ensure no suggestions or other text was output
      expect(mockConsoleError).not.toHaveBeenCalled();
    });

    it('should respect limit option in JSON output', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act
      await cli.run(['node', 'script.js', '--format', 'json', '--limit', '1', 'resistor']);

      // Assert
      const jsonOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(jsonOutput).toHaveLength(1);
    });

    it('should respect sort option in JSON output', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act
      await cli.run(['node', 'script.js', '--format', 'json', '--sort', 'manufacturer', 'resistor']);

      // Assert
      const jsonOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(jsonOutput).toHaveLength(2);
      // Results should be sorted by manufacturer
      expect(jsonOutput[0].manufacturer).toBe('Another Manufacturer');
      expect(jsonOutput[1].manufacturer).toBe('Test Manufacturer');
    });

    it('should suppress all non-JSON output in JSON mode', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act
      await cli.run(['node', 'script.js', '--format', 'json', 'resistor']);

      // Assert
      // Should only have one console.log call with JSON output
      expect(mockConsoleLog).toHaveBeenCalledTimes(1);
      expect(mockConsoleError).not.toHaveBeenCalled();
      expect(mockConsoleWarn).not.toHaveBeenCalled();
      // Progress indicator should not be created
      expect(ProgressIndicator).not.toHaveBeenCalled();
    });

    it('should handle complex queries with multiple parameters in JSON format', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act
      await cli.run(['node', 'script.js', '--format', 'json', '10k', 'resistor', '0603', '1%', '50V']);

      // Assert
      expect(mockSearchEngine.search).toHaveBeenCalledWith('10k resistor 0603 1% 50V');
      // Get the last console.log call which should be the JSON output
      const jsonCall = mockConsoleLog.mock.calls[mockConsoleLog.mock.calls.length - 1];
      const jsonOutput = JSON.parse(jsonCall[0]);
      expect(Array.isArray(jsonOutput)).toBe(true);
    });
  });

  describe('JSON compatibility tests', () => {
    it('should maintain backward compatibility with existing formats', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act & Assert - Test that existing formats still work
      await cli.run(['node', 'script.js', '--format', 'detailed', 'resistor']);
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Test Component'));

      // Clear mocks
      vi.clearAllMocks();

      await cli.run(['node', 'script.js', '--format', 'compact', 'resistor']);
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('C1234'));

      // Clear mocks
      vi.clearAllMocks();

      await cli.run(['node', 'script.js', '--format', 'table', 'resistor']);
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('LCSC'));
    });

    it('should handle mixed format scenarios gracefully', async () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);

      // Act - Test that JSON format doesn't interfere with other formats
      await cli.run(['node', 'script.js', '--format', 'json', 'resistor']);
      const jsonOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(Array.isArray(jsonOutput)).toBe(true);

      // Clear mocks and test detailed format
      vi.clearAllMocks();
      await cli.run(['node', 'script.js', '--format', 'detailed', 'resistor']);
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Test Component'));
    });
  });

  describe('JSON edge cases', () => {
    it('should handle special characters in component data', () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);
      const results: SearchResult[] = [
        {
          lcsc: 'C1234',
          manufacturer: 'Test "Manufacturer" & Co.',
          partNumber: 'TEST-123\n456',
          description: '10kΩ ±1% 0603 Thick Film Resistor with "quotes"',
          package: '0603',
          score: 95.5,
          matchSummary: 'Exact match with "quotes" and \n newlines',
        },
      ];

      // Act
      (cli as any).displayJsonResults(results);

      // Assert
      const jsonOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(jsonOutput[0].manufacturer).toBe('Test "Manufacturer" & Co.');
      expect(jsonOutput[0].partNumber).toBe('TEST-123\n456');
      expect(jsonOutput[0].description).toBe('10kΩ ±1% 0603 Thick Film Resistor with "quotes"');
      expect(jsonOutput[0].matchSummary).toBe('Exact match with "quotes" and \n newlines');
    });

    it('should handle very large result sets', () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);
      const results: SearchResult[] = Array.from({ length: 1000 }, (_, i) => ({
        lcsc: `C${i.toString().padStart(4, '0')}`,
        manufacturer: `Manufacturer ${i}`,
        partNumber: `PART-${i}`,
        description: `Component ${i}`,
        package: '0603',
        score: 100 - i,
        matchSummary: `Match ${i}`,
      }));

      // Act
      (cli as any).displayJsonResults(results);

      // Assert
      const jsonOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(jsonOutput).toHaveLength(1000);
      expect(jsonOutput[0].lcsc).toBe('C0000');
      expect(jsonOutput[999].lcsc).toBe('C0999');
    });

    it('should handle zero score results', () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);
      const results: SearchResult[] = [
        {
          lcsc: 'C1234',
          manufacturer: 'Test Manufacturer',
          partNumber: 'TEST-123',
          description: '10kΩ Resistor',
          package: '0603',
          score: 0,
          matchSummary: 'No match',
        },
      ];

      // Act
      (cli as any).displayJsonResults(results);

      // Assert
      const jsonOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(jsonOutput[0].score).toBe(0);
    });

    it('should handle floating point scores', () => {
      // Arrange
      const mockSearchEngine = createMockSearchEngine();
      const cli = new CommandLineInterface(mockSearchEngine);
      const results: SearchResult[] = [
        {
          lcsc: 'C1234',
          manufacturer: 'Test Manufacturer',
          partNumber: 'TEST-123',
          description: '10kΩ Resistor',
          package: '0603',
          score: 95.123456789,
          matchSummary: 'Exact match',
        },
      ];

      // Act
      (cli as any).displayJsonResults(results);

      // Assert
      const jsonOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(jsonOutput[0].score).toBe(95.123456789);
    });
  });
});

describe('isTypecadProjectDir', () => {
  it('recognizes a directory holding any typecad.conf variant', async () => {
    const { isTypecadProjectDir } = await import('../CommandLineInterface.js');
    const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');

    for (const conf of ['typecad.conf.ts', 'typecad.conf.js', 'typecad.json']) {
      const dir = mkdtempSync(join(tmpdir(), 'jlcpcb-guard-'));
      try {
        writeFileSync(join(dir, conf), '{}');
        expect(isTypecadProjectDir(dir)).toBe(true);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('rejects a directory with no typecad config', async () => {
    const { isTypecadProjectDir } = await import('../CommandLineInterface.js');
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');

    const dir = mkdtempSync(join(tmpdir(), 'jlcpcb-guard-'));
    try {
      expect(isTypecadProjectDir(dir)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks the add prompt outside a project', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'jlcpcb-guard-'));
    const originalCwd = process.cwd();
    const confirmSpy = vi.fn(async () => true);

    try {
      process.chdir(dir);
      const cli = new CommandLineInterface({} as SearchEngine);
      (cli as any).promptConfirm = confirmSpy;
      await (cli as any).promptInstallComponent([]);
      expect(confirmSpy).not.toHaveBeenCalled();
    } finally {
      process.chdir(originalCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
