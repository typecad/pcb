import { CLI } from '../interfaces/CLI.js';
import { SearchEngine } from '../interfaces/SearchEngine.js';
import { SearchResult, JsonSearchResult, JsonErrorResponse } from '../types/index.js';
import chalk from 'chalk';
import { ProgressIndicator } from './ProgressIndicator.js';
import { ErrorHandler } from './ErrorHandler.js';
import * as readline from 'readline';

import { execFileSync } from 'child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import logger from '../../utils/logging.js';

/**
 * Command-line interface implementation for the KiCad symbols search tool
 */
export class CommandLineInterface implements CLI {
  private readonly searchEngine: SearchEngine;
  private readonly programName: string;

  /**
   * Command Line Interface for the KiCad symbols search application
   * @param searchEngine - The search engine to use for queries
   * @param programName - The name of the program (default: 'kicad-symbols')
   */
  constructor(searchEngine: SearchEngine, programName: string = 'kicad-symbols') {
    this.searchEngine = searchEngine;
    this.programName = programName;
  }

  /**
   * Prompts the user for a search query when none is provided
   * @returns Promise that resolves to the user's search query
   */
  private async promptForSearchQuery(): Promise<string> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      logger.log(chalk.blue(`\n${this.programName} - KiCad Symbols Search Tool`));

      rl.question(chalk.cyan('Search query: '), (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }

  /**
   * Main entry point for CLI execution
   * @param args - Command line arguments (process.argv)
   */
  public async run(args: string[]): Promise<void> {
    // Remove the first two arguments (node executable and script path)
    const cliArgs = args.slice(2);

    let parsedArgs: {
      query: string;
      help: boolean;
      version: boolean;
      format: 'detailed' | 'compact' | 'table' | 'json';
      sortBy: 'score' | 'id' | 'manufacturer' | 'package';
      limit: number;
    };

    try {
      // Parse command-line arguments
      parsedArgs = this.parseArguments(cliArgs);

      // Handle help flag
      if (parsedArgs.help) {
        this.displayHelp();
        return;
      }

      // Handle version flag
      if (parsedArgs.version) {
        this.displayVersion();
        return;
      }

      // Check if we have a search query
      if (!parsedArgs.query) {
        // Prompt for user input if no query provided
        parsedArgs.query = await this.promptForSearchQuery();

        // If user still didn't provide a query, exit gracefully
        if (!parsedArgs.query || parsedArgs.query.trim().length === 0) {
          if (parsedArgs.format === 'json') {
            this.displayJsonError(new Error('No search query provided'), 'MISSING_QUERY');
          } else {
            logger.log(chalk.yellow('No search query provided. Exiting.'));
          }
          process.exit(0);
        }
      }

      // Validate search query
      if (!this.validateQuery(parsedArgs.query)) {
        if (parsedArgs.format === 'json') {
          this.displayJsonError(new Error(`Invalid search query: "${parsedArgs.query}"`), 'INVALID_QUERY');
        } else {
          logger.error(chalk.red(`Error: Invalid search query: "${parsedArgs.query}"`));
          logger.error(chalk.yellow('Search query must not be empty and should contain valid characters'));
          logger.error(chalk.yellow('Try using alphanumeric characters, spaces, and common symbols.'));
        }
        process.exit(1);
      }

      // Create progress indicator only if not in JSON mode
      const progress = parsedArgs.format === 'json' ? null : new ProgressIndicator();

      // Start progress indicator for search (only if not in JSON mode)
      if (progress) {
        progress.start(`Searching for components matching: "${parsedArgs.query}"`);
      }

      // Suppress console output in JSON mode
      let originalConsoleLog: typeof console.log | null = null;
      if (parsedArgs.format === 'json') {
        originalConsoleLog = console.log;
        console.log = () => {}; // Suppress all console.log output
      }

      try {
        // Perform search
        const results = await this.searchEngine.search(parsedArgs.query);

        // Restore console.log if it was suppressed
        if (originalConsoleLog) {
          console.log = originalConsoleLog;
        }

        // Stop progress indicator (only if not in JSON mode)
        if (progress) {
          progress.stop();
        }

        // If no results, provide suggestions (only if not in JSON mode)
        if (results.length === 0 && parsedArgs.format !== 'json') {
          logger.log(chalk.yellow('No components found matching your search criteria.'));
          logger.log(chalk.yellow('Suggestions:'));
          logger.log(chalk.yellow('- Try using more general terms (e.g., "capacitor" instead of "ceramic capacitor")'));
          logger.log(chalk.yellow('- Check your spelling and try alternative terms'));
          logger.log(chalk.yellow('- Remove specific parameters that might be too restrictive'));
          logger.log(chalk.yellow('- Try searching for a different package size or value'));
          return;
        }

        // Sort results if needed
        if (parsedArgs.sortBy !== 'score') {
          this.sortResults(results, parsedArgs.sortBy);
        }

        // Limit results if needed
        const limitedResults =
          parsedArgs.limit > 0 && parsedArgs.limit < results.length ? results.slice(0, parsedArgs.limit) : results;

        // Display results
        this.displayResults(limitedResults, parsedArgs.format);

        // Show additional information if results were limited (only if not in JSON mode)
        if (results.length > limitedResults.length && parsedArgs.format !== 'json') {
          logger.log(
            chalk.blue(
              `Showing ${limitedResults.length} of ${results.length} matching components. Use --limit option to see more.`,
            ),
          );
        }

        // Display top match summary at the end (only if not in JSON mode)
        if (results.length > 0 && parsedArgs.format !== 'json') {
          const topMatch = results[0];
          logger.log(chalk.bold.blue(`Top match: ${chalk.italic(topMatch.lcsc)} - ${topMatch.description}`));
        }

        const actionableResults = limitedResults.filter((r) => r.footprint && r.footprint.length > 0);

        if (actionableResults.length > 0 && parsedArgs.format !== 'json') {
          logger.log();
          const { confirm, input } = await import('@inquirer/prompts');
          const wantToAdd = await confirm({
            message: 'Do you want to add a component from these results?',
            default: false,
          });

          if (wantToAdd) {
            const indexStr = await input({
              message: `Enter the number of the result (1-${limitedResults.length}):`,
              validate: (val) => {
                const idx = parseInt(val, 10);
                return (
                  (!isNaN(idx) && idx >= 1 && idx <= limitedResults.length) ||
                  `Please enter a number between 1 and ${limitedResults.length}`
                );
              },
            });

            const selectedIdx = parseInt(indexStr, 10) - 1;
            const selectedResult = limitedResults[selectedIdx];

            if (!selectedResult.footprint || selectedResult.footprint.length === 0) {
              logger.log(chalk.yellow('This result does not have a specific footprint. Cannot create component.'));
            } else {
              const componentName = await input({
                message: 'Component name?',
                default: selectedResult.partNumber.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
              });

              logger.log(chalk.blue(`Running add-component for ${selectedResult.lcsc}...`));

              try {
                const __filename = fileURLToPath(import.meta.url);
                const __dirname = path.dirname(__filename);
                const addComponentPath = path.resolve(__dirname, '../../cli/add-component/index.js');

                let folder = './';
                if (fs.existsSync('./src')) {
                  folder = '.';
                }

                execFileSync(
                  process.execPath,
                  [
                    addComponentPath,
                    '--kicad=true',
                    `--symbol=${selectedResult.lcsc}`,
                    `--folder=${folder}`,
                    `--footprint=${selectedResult.footprint}`,
                  ],
                  { stdio: 'inherit' },
                );
                logger.log(chalk.green('Component created successfully!'));
              } catch (error) {
                logger.error(chalk.red('Failed to create component.'));
              }
            }
          }
        }
      } catch (searchError) {
        // Restore console.log if it was suppressed
        if (parsedArgs.format === 'json' && originalConsoleLog) {
          console.log = originalConsoleLog;
        }

        // Stop progress indicator (only if not in JSON mode)
        if (progress) {
          progress.stop();
        }

        // Handle search errors in JSON format if needed
        if (parsedArgs.format === 'json') {
          this.displayJsonError(searchError, 'SEARCH_ERROR');
          process.exit(1);
        }

        throw searchError;
      }
    } catch (error) {
      // Handle errors based on output format
      // Try to parse arguments to determine format, but handle parsing errors gracefully
      let isJsonFormat = false;
      try {
        const tempParsedArgs = this.parseArguments(cliArgs);
        isJsonFormat = tempParsedArgs.format === 'json';
      } catch (parseError) {
        // If parsing fails, check if JSON format was explicitly requested in args
        isJsonFormat =
          (cliArgs.includes('--format') && cliArgs.includes('json')) ||
          (cliArgs.includes('-f') && cliArgs.includes('json'));
      }

      if (isJsonFormat) {
        // Output error in JSON format using dedicated method
        this.displayJsonError(error, 'SYSTEM_ERROR');
      } else {
        // Use ErrorHandler to provide user-friendly error messages
        const errorMessage = ErrorHandler.handleError(error);
        logger.error(chalk.red(errorMessage));
      }

      // Exit with error code
      process.exit(1);
    }
  }

  /**
   * Parses command-line arguments into a structured object
   * @param args - Command-line arguments
   * @returns Parsed arguments object
   */
  private parseArguments(args: string[]): {
    query: string;
    help: boolean;
    version: boolean;
    format: 'detailed' | 'compact' | 'table' | 'json';
    sortBy: 'score' | 'id' | 'manufacturer' | 'package';
    limit: number;
  } {
    const result = {
      query: '',
      help: false,
      version: false,
      format: 'detailed' as 'detailed' | 'compact' | 'table' | 'json',
      sortBy: 'score' as 'score' | 'id' | 'manufacturer' | 'package',
      limit: 5,
    };

    // First pass: check if JSON format is requested to suppress warnings
    let isJsonFormat = false;
    for (let i = 0; i < args.length; i++) {
      if ((args[i] === '--format' || args[i] === '-f') && args[i + 1] === 'json') {
        isJsonFormat = true;
        break;
      }
    }

    // Process arguments
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      // Handle flags
      if (arg === '--help' || arg === '-h') {
        result.help = true;
        continue;
      }

      if (arg === '--version' || arg === '-v') {
        result.version = true;
        continue;
      }

      // Handle format option
      if (arg === '--format' || arg === '-f') {
        const formatValue = args[++i];
        if (
          formatValue === 'detailed' ||
          formatValue === 'compact' ||
          formatValue === 'table' ||
          formatValue === 'json'
        ) {
          result.format = formatValue;
        } else {
          if (!isJsonFormat) {
            logger.warn(chalk.yellow(`Warning: Invalid format '${formatValue}'. Using default 'detailed' format.`));
          }
        }
        continue;
      }

      // Handle sort option
      if (arg === '--sort' || arg === '-s') {
        const sortValue = args[++i];
        if (sortValue === 'score' || sortValue === 'id' || sortValue === 'manufacturer' || sortValue === 'package') {
          result.sortBy = sortValue;
        } else {
          if (!isJsonFormat) {
            logger.warn(chalk.yellow(`Warning: Invalid sort option '${sortValue}'. Using default 'score' sort.`));
          }
        }
        continue;
      }

      // Handle limit option
      if (arg === '--limit' || arg === '-l') {
        const limitValue = parseInt(args[++i], 10);
        if (!isNaN(limitValue) && limitValue > 0) {
          result.limit = limitValue;
        } else {
          if (!isJsonFormat) {
            logger.warn(chalk.yellow(`Warning: Invalid limit '${args[i]}'. Using default limit of 5.`));
          }
        }
        continue;
      }

      // If not a flag, treat as part of the query
      if (!arg.startsWith('-')) {
        // If we already have a query, append with space
        if (result.query) {
          result.query += ' ';
        }
        result.query += arg;
      }
    }

    return result;
  }

  /**
   * Validates a search query
   * @param query - Search query to validate
   * @returns True if the query is valid, false otherwise
   */
  private validateQuery(query: string): boolean {
    // Query must not be empty
    if (!query || query.trim().length === 0) {
      return false;
    }

    // Query must not contain invalid characters
    const invalidCharsRegex = /[^\w\s\d.,\-+%()[\]{}:;'"\/\\&@#$^*=<>?!]/g;
    if (invalidCharsRegex.test(query)) {
      return false;
    }

    return true;
  }

  /**
   * Sorts search results based on the specified criteria
   * @param results - Array of search results to sort
   * @param sortBy - Sorting criteria
   */
  private sortResults(results: SearchResult[], sortBy: 'score' | 'id' | 'manufacturer' | 'package'): void {
    switch (sortBy) {
      case 'id':
        results.sort((a, b) => a.lcsc.localeCompare(b.lcsc));
        break;
      case 'manufacturer':
        results.sort((a, b) => a.manufacturer.localeCompare(b.manufacturer));
        break;
      case 'package':
        results.sort((a, b) => a.package.localeCompare(b.package));
        break;
      // 'score' is the default and already sorted by the search engine
      default:
        break;
    }
  }

  /**
   * Gets color for score based on its value
   * @param score - Score value
   * @returns Chalk color function
   */
  private getScoreColor(score: number): (text: string) => string {
    if (score >= 90) {
      return chalk.green;
    } else if (score >= 75) {
      return chalk.yellow;
    } else if (score >= 50) {
      return chalk.hex('#FFA500'); // Orange
    } else {
      return chalk.red;
    }
  }

  /**
   * Displays search results in a formatted manner
   * @param results - Array of search results to display
   * @param format - Format to use for display (detailed, compact, table, or json)
   */
  public displayResults(results: SearchResult[], format: 'detailed' | 'compact' | 'table' | 'json' = 'detailed'): void {
    // Handle JSON format separately
    if (format === 'json') {
      this.displayJsonResults(results);
      return;
    }

    if (results.length === 0) {
      logger.log(chalk.yellow('No components found matching your search criteria.'));
      logger.log(chalk.yellow('Try using more general terms or check your spelling.'));
      return;
    }

    logger.log(chalk.green(`\nFound ${results.length} matching components:\n`));

    // Display results based on format
    switch (format) {
      case 'detailed':
        this.displayDetailedResults(results);
        break;
      case 'compact':
        this.displayCompactResults(results);
        break;
      case 'table':
        this.displayTableResults(results);
        break;
      default:
        this.displayDetailedResults(results);
    }
  }

  /**
   * Displays results in detailed format
   * @param results - Array of search results to display
   */
  private displayDetailedResults(results: SearchResult[]): void {
    results.forEach((result, index) => {
      const scoreColor = this.getScoreColor(result.score);

      logger.log(chalk.bold(`${index + 1}. ${result.lcsc} - ${result.description}`));
      logger.log(`   ${chalk.cyan('Part Number:')} ${result.partNumber}`);
      if (result.footprint) {
        logger.log(`   ${chalk.cyan('Footprint:')} ${result.footprint}`);
      }
      if (result.fpFilters && result.fpFilters.length > 0) {
        logger.log(`   ${chalk.cyan('Footprint Filters:')} ${result.fpFilters.join(', ')}`);
      }
      logger.log(); // Empty line between results
    });
  }

  /**
   * Displays results in compact format
   * @param results - Array of search results to display
   */
  private displayCompactResults(results: SearchResult[]): void {
    results.forEach((result, index) => {
      const scoreColor = this.getScoreColor(result.score);
      logger.log(
        `${index + 1}. ${chalk.bold(result.lcsc)} - ` +
          `${result.description.substring(0, 40)}${result.description.length > 40 ? '...' : ''} - ` +
          `${scoreColor(result.score.toFixed(1))}`,
      );
    });
    logger.log(); // Empty line at the end
  }

  /**
   * Displays results in table format
   * @param results - Array of search results to display
   */
  private displayTableResults(results: SearchResult[]): void {
    // Calculate column widths
    const symbolWidth = Math.max(8, ...results.map((r) => r.lcsc.length));
    const descWidth = Math.min(60, Math.max(11, ...results.map((r) => r.description.length)));

    // Print table header
    logger.log(
      chalk.bold(
        `${'#'.padEnd(3)} ` +
          `${'ID'.padEnd(symbolWidth)} ` +
          `${'Score'.padEnd(6)} ` +
          `${'Description'.padEnd(descWidth)}`,
      ),
    );

    // Print separator
    logger.log(
      `${''.padEnd(3, '-')} ` +
        `${''.padEnd(symbolWidth, '-')} ` +
        `${''.padEnd(6, '-')} ` +
        `${''.padEnd(descWidth, '-')}`,
    );

    // Print table rows
    results.forEach((result, index) => {
      const scoreColor = this.getScoreColor(result.score);

      // Truncate long text
      const description =
        result.description.length > descWidth
          ? result.description.substring(0, descWidth - 3) + '...'
          : result.description;

      logger.log(
        `${(index + 1).toString().padEnd(3)} ` +
          `${chalk.cyan(result.lcsc.padEnd(symbolWidth))} ` +
          `${scoreColor(result.score.toFixed(1).padEnd(6))} ` +
          `${description}`,
      );
    });

    logger.log(); // Empty line at the end
  }

  /**
   * Displays results in JSON format
   * @param results - Array of search results to display
   */
  private displayJsonResults(results: SearchResult[]): void {
    // Handle empty results by outputting empty JSON array
    if (results.length === 0) {
      logger.log('[]');
      return;
    }

    // Convert SearchResult array to simplified JSON format
    const jsonResults = results.map((result) => ({
      id: result.lcsc,
      description: result.description,
      score: result.score,
      matchSummary: result.matchSummary,
    }));

    // Output clean JSON with no additional formatting or colors
    logger.log(JSON.stringify(jsonResults));
  }

  /**
   * Formats and outputs errors in JSON format
   * @param error - The error to format
   * @param code - Optional error code for programmatic handling
   */
  private displayJsonError(error: unknown, code?: string): void {
    let errorMessage: string;
    let errorCode: string | undefined = code;

    // Get clean error message without ANSI color codes for JSON output
    if (error instanceof Error) {
      errorMessage = error.message;
    } else {
      errorMessage = String(error);
    }

    // If no code provided, try to determine it from the error
    if (!errorCode) {
      if (error instanceof Error) {
        if (error.message.includes('No search query provided')) {
          errorCode = 'MISSING_QUERY';
        } else if (error.message.includes('Invalid search query')) {
          errorCode = 'INVALID_QUERY';
        } else if (error.message.includes('timed out') || error.message.includes('timeout')) {
          errorCode = 'TIMEOUT_ERROR';
        } else if (
          error.message.includes('network') ||
          error.message.includes('ENOTFOUND') ||
          error.message.includes('ETIMEDOUT')
        ) {
          errorCode = 'NETWORK_ERROR';
        } else if (
          error.message.includes('file') ||
          error.message.includes('ENOENT') ||
          error.message.includes('EACCES')
        ) {
          errorCode = 'FILE_SYSTEM_ERROR';
        } else if (
          error.message.includes('parse') ||
          error.message.includes('parsing') ||
          error.message.includes('Unexpected token')
        ) {
          errorCode = 'PARSING_ERROR';
        } else {
          errorCode = 'SYSTEM_ERROR';
        }
      } else {
        errorCode = 'UNKNOWN_ERROR';
      }
    } else {
      // If a code was provided, use it but still try to refine it based on error content
      // This allows for more specific error codes when the provided code is generic
      if (error instanceof Error) {
        if (errorCode === 'SEARCH_ERROR' || errorCode === 'SYSTEM_ERROR') {
          // Refine the error code based on the actual error message
          if (error.message.includes('timed out') || error.message.includes('timeout')) {
            errorCode = 'TIMEOUT_ERROR';
          } else if (
            error.message.includes('network') ||
            error.message.includes('ENOTFOUND') ||
            error.message.includes('ETIMEDOUT')
          ) {
            errorCode = 'NETWORK_ERROR';
          } else if (
            error.message.includes('file') ||
            error.message.includes('ENOENT') ||
            error.message.includes('EACCES')
          ) {
            errorCode = 'FILE_SYSTEM_ERROR';
          } else if (
            error.message.includes('parse') ||
            error.message.includes('parsing') ||
            error.message.includes('Unexpected token')
          ) {
            errorCode = 'PARSING_ERROR';
          }
          // Keep the provided code if no more specific match is found
        }
      } else {
        // For non-Error objects, if a generic code was provided, use UNKNOWN_ERROR instead
        if (errorCode === 'SEARCH_ERROR' || errorCode === 'SYSTEM_ERROR') {
          errorCode = 'UNKNOWN_ERROR';
        }
      }
    }

    // Create JSON error response
    const jsonError: JsonErrorResponse = {
      error: true,
      message: errorMessage,
      code: errorCode,
    };

    // Output JSON error to stdout (not stderr) for consistent JSON output
    logger.log(JSON.stringify(jsonError));
  }

  /**
   * Displays help text and usage information
   */
  public displayHelp(): void {
    logger.log(chalk.bold(`\n${this.programName} - KiCad Symbols Search Tool\n`));
    logger.log('A command-line tool for searching KiCad symbols using fuzzy matching.\n');

    logger.log(chalk.bold('Usage:'));
    logger.log(`  ${this.programName} [options] <search query>\n`);

    logger.log(chalk.bold('Options:'));
    logger.log('  -h, --help                Display this help message');
    logger.log('  -v, --version             Display version information');
    logger.log('  -f, --format <format>     Output format: detailed, compact, table, or json (default: detailed)');
    logger.log('  -s, --sort <field>        Sort by: score, id, manufacturer, or package (default: score)');
    logger.log('  -l, --limit <number>      Limit number of results (default: 5)\n');

    logger.log(chalk.bold('Output Formats:'));
    logger.log('  detailed                  Human-readable detailed output with colors and formatting');
    logger.log('  compact                   Compact single-line format for each symbol');
    logger.log('  table                     Tabular format with aligned columns');
    logger.log(
      '  json                      Machine-readable JSON format (suppresses all formatting and progress indicators)\n',
    );

    logger.log(chalk.bold('JSON Format:'));
    logger.log(
      '  The JSON format outputs clean, machine-readable JSON without any formatting, colors, or progress indicators.',
    );
    logger.log('  This format is ideal for programmatic integration and automated scripts.');
    logger.log('  When no results are found, an empty array [] is returned.');
    logger.log('  Error responses include an "error" field set to true with a "message" and optional "code".\n');

    logger.log(chalk.bold('Examples:'));
    logger.log(`  ${this.programName} "4xxx:14528"`);
    logger.log(`  ${this.programName} "op amp" --format table`);
    logger.log(`  ${this.programName} "connector" --sort id --limit 10`);
    logger.log(`  ${this.programName} "LM358" --format compact`);
    logger.log(`  ${this.programName} "capacitor" --format json`);
    logger.log(`  ${this.programName} "resistor" --format json --limit 3 | jq '.[0].id'`);
    logger.log();
    logger.log('This is part of the typeCAD project. Visit https://typecad.net to learn more about code-as-schematic.');
    logger.log();
  }

  /**
   * Displays version information
   */
  private displayVersion(): void {
    // For simplicity in testing, just use a hardcoded version
    // In a real implementation, we would read from package.json
    logger.log(`${this.programName} version 1.0.0`);
  }
}
