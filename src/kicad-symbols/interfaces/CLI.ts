import { SearchResult } from '../types/index.js';

/**
 * Interface for the command-line interface
 */
export interface CLI {
  /**
   * Main entry point for CLI execution
   * @param args - Command line arguments
   */
  run(args: string[]): Promise<void>;

  /**
   * Displays search results in a formatted manner
   * @param results - Array of search results to display
   */
  displayResults(results: SearchResult[]): void;

  /**
   * Displays help text and usage information
   */
  displayHelp(): void;
}
