import { CLI } from '../interfaces/CLI.js';
import { SearchEngine } from '../interfaces/SearchEngine.js';
import { SearchResult, JsonSearchResult, JsonErrorResponse } from '../types/index.js';
import chalk from 'chalk';
import { Logger, LogLevel } from './Logger.js';
import { ProgressIndicator } from './ProgressIndicator.js';
import { ErrorHandler } from './ErrorHandler.js';
import * as readline from 'readline';
import { execFileSync } from 'child_process';
import { existsSync } from 'node:fs';
import { platform } from 'node:os';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json');

/**
 * Command-line interface implementation for the JLCPCB component search tool
 */
const IS_WIN = platform() === 'win32';
const IS_CMD_EXT = /\.(?:cmd|bat)$/i;

function findExecutable(name: string): string | undefined {
  const pathEnv = process.env.PATH?.split(IS_WIN ? ';' : ':') ?? [];
  const exts = IS_WIN ? (process.env.PATHEXT?.split(';') ?? ['.exe']) : [''];
  for (const dir of pathEnv) {
    for (const ext of exts) {
      const p = join(dir, name + ext);
      if (existsSync(p)) return p;
    }
  }
  return undefined;
}

/**
 * Whether `dir` is a typeCAD project directory. The typeCAD CLI (`add
 * component`, `doctor`) operates on the current directory and recognizes a
 * project by its `typecad.conf.*` file there — scaffolded projects keep it
 * in `<project>/hw/`.
 */
export function isTypecadProjectDir(dir: string = process.cwd()): boolean {
  return ['typecad.conf.ts', 'typecad.conf.js', 'typecad.json'].some((conf) => existsSync(join(dir, conf)));
}

export class CommandLineInterface implements CLI {
  private readonly searchEngine: SearchEngine;
  private readonly programName: string;

  /**
   * Creates a new CommandLineInterface instance
   * @param searchEngine - The search engine to use for queries
   * @param programName - The name of the program (default: 'jlcpcb-search')
   */
  constructor(searchEngine: SearchEngine, programName: string = 'jlcpcb-search') {
    this.searchEngine = searchEngine;
    this.programName = programName;
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
      sortBy: 'score' | 'lcsc' | 'manufacturer' | 'package';
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
        // In JSON format, don't prompt - just return error immediately
        if (parsedArgs.format === 'json') {
          this.displayJsonError(new Error('No search query provided'), 'MISSING_QUERY');
          process.exit(1);
          return;
        }

        // Prompt for user input if no query provided (non-JSON mode only)
        parsedArgs.query = await this.promptForSearchQuery();
        // If user still didn't provide a query, exit gracefully
        if (!parsedArgs.query || parsedArgs.query.trim().length === 0) {
          console.log(chalk.yellow('No search query provided. Exiting.'));
          process.exit(0);
          return;
        }
      }

      // Validate search query
      if (!this.validateQuery(parsedArgs.query)) {
        if (parsedArgs.format === 'json') {
          this.displayJsonError(new Error(`Invalid search query: "${parsedArgs.query}"`), 'INVALID_QUERY');
        } else {
          console.error(chalk.red(`Error: Invalid search query: "${parsedArgs.query}"`));
          console.error(chalk.yellow('Search query must not be empty and should contain valid characters'));
          console.error(chalk.yellow('Try using alphanumeric characters, spaces, and common symbols.'));
        }
        process.exit(1);
        return;
      }

      // Create progress indicator only if not in JSON mode
      const progress = parsedArgs.format === 'json' ? null : new ProgressIndicator();

      // Start progress indicator for search (only if not in JSON mode)
      if (progress) {
        progress.start(`Searching for components matching: "${parsedArgs.query}"`);
      }

      // Suppress Logger output in JSON mode
      if (parsedArgs.format === 'json') {
        const logger = Logger.getInstance();
        logger.setConsoleLevel(LogLevel.NONE);
      }

      try {
        // Perform search
        const results = await this.searchEngine.search(parsedArgs.query);

        // Restore Logger level if it was suppressed
        if (parsedArgs.format === 'json') {
          Logger.getInstance().setConsoleLevel(LogLevel.INFO);
        }

        // Stop progress indicator (only if not in JSON mode)
        if (progress) {
          progress.stop();
        }

        // If no results, provide suggestions (only if not in JSON mode)
        if (results.length === 0 && parsedArgs.format !== 'json') {
          console.log(chalk.yellow('No components found matching your search criteria.'));
          console.log(chalk.yellow('Suggestions:'));
          console.log(
            chalk.yellow('- Try using more general terms (e.g., "capacitor" instead of "ceramic capacitor")'),
          );
          console.log(chalk.yellow('- Check your spelling and try alternative terms'));
          console.log(chalk.yellow('- Remove specific parameters that might be too restrictive'));
          console.log(chalk.yellow('- Try searching for a different package size or value'));
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
          console.log(
            chalk.blue(
              `Showing ${limitedResults.length} of ${results.length} matching components. Use --limit option to see more.`,
            ),
          );
        }

        // Display top match summary at the end (only if not in JSON mode)
        if (results.length > 0 && parsedArgs.format !== 'json') {
          const topMatch = results[0];
          console.log(
            chalk.bold.blue(`Top match: #C${topMatch.lcsc} - ${topMatch.description} (Score: ${topMatch.score})`),
          );
        }

        if (limitedResults.length > 0 && parsedArgs.format !== 'json') {
          await this.promptInstallComponent(limitedResults);
        }
      } catch (searchError) {
        // Restore Logger level if it was suppressed
        if (parsedArgs.format === 'json') {
          Logger.getInstance().setConsoleLevel(LogLevel.INFO);
        }

        // Stop progress indicator (only if not in JSON mode)
        if (progress) {
          progress.stop();
        }

        // Handle search errors in JSON format if needed
        if (parsedArgs.format === 'json') {
          this.displayJsonError(searchError, 'SEARCH_ERROR');
          process.exit(1);
          return;
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
        console.error(chalk.red(errorMessage));
      }

      // Exit with error code
      process.exit(1);
      return;
    }
  }

  /**
   * Prompts the user to install a component from search results
   * @param results - Array of search results to choose from
   */
  private async promptInstallComponent(results: SearchResult[]): Promise<void> {
    // The underlying `typecad-pcb add component` writes into the CURRENT
    // directory's project; run anywhere else and it fails deep inside the
    // typeCAD CLI. Refuse up front with guidance instead of offering the
    // option at all.
    if (!isTypecadProjectDir()) {
      console.error(chalk.red('Error: no typeCAD project in the current directory.'));
      console.error(
        chalk.yellow(
          'Components can only be added from a project folder — the one containing typecad.conf.ts (scaffolded projects keep it in <project>/hw).',
        ),
      );
      console.error(chalk.yellow('Create a project first with: npx @typecad/pcb create'));
      return;
    }

    const wantToAdd = await this.promptConfirm('Do you want to add a component from these results?');
    if (!wantToAdd) return;

    const indexStr = await this.promptInput(`Enter the number of the result (1-${results.length}):`, (val) => {
      const idx = parseInt(val, 10);
      return !isNaN(idx) && idx >= 1 && idx <= results.length
        ? true
        : `Please enter a number between 1 and ${results.length}`;
    });

    const selectedIdx = parseInt(indexStr, 10) - 1;
    const selectedResult = results[selectedIdx];

    const lcscNumber = selectedResult.lcsc.startsWith('C') ? selectedResult.lcsc : `C${selectedResult.lcsc}`;

    console.log(chalk.blue(`Running typecad-pcb add component for ${lcscNumber}...`));

    try {
      const typecadBin = findExecutable('typecad-pcb');
      if (!typecadBin) {
        console.error(chalk.red('Error: typecad-pcb command not found.'));
        console.error(chalk.yellow('Install typeCAD globally: npm install -g @typecad/pcb'));
        console.error(chalk.yellow('Or run: npx @typecad/pcb add component --jlcpcb=true --c=' + lcscNumber));
        return;
      }

      const args = ['add', 'component', '--jlcpcb=true', `--c=${lcscNumber}`];

      if (IS_WIN && (!typecadBin || IS_CMD_EXT.test(typecadBin))) {
        execFileSync('cmd.exe', ['/d', '/s', '/c', 'typecad-pcb', ...args], { stdio: 'inherit' });
      } else {
        execFileSync(typecadBin, args, { stdio: 'inherit' });
      }
      console.log(chalk.green('Component created successfully!'));
    } catch (error) {
      console.error(chalk.red('Failed to create component.'));
    }
  }

  /**
   * Prompts the user with a yes/no confirmation
   * @param question - The question to ask
   * @returns True if the user confirms, false otherwise
   */
  private async promptConfirm(question: string): Promise<boolean> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      rl.question(`${chalk.cyan(question)} ${chalk.gray('(y/N)')} `, (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
      });
    });
  }

  /**
   * Prompts the user for text input with optional validation
   * @param question - The question to ask
   * @param validate - Optional validation function
   * @returns The user's input
   */
  private async promptInput(question: string, validate?: (input: string) => string | boolean): Promise<string> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      const ask = () => {
        rl.question(chalk.cyan(question + ' '), (answer) => {
          if (validate) {
            const result = validate(answer.trim());
            if (result !== true) {
              console.log(chalk.yellow(typeof result === 'string' ? result : 'Invalid input'));
              ask();
              return;
            }
          }
          rl.close();
          resolve(answer.trim());
        });
      };
      ask();
    });
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
    sortBy: 'score' | 'lcsc' | 'manufacturer' | 'package';
    limit: number;
  } {
    const result = {
      query: '',
      help: false,
      version: false,
      format: 'detailed' as 'detailed' | 'compact' | 'table' | 'json',
      sortBy: 'score' as 'score' | 'lcsc' | 'manufacturer' | 'package',
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
            console.warn(chalk.yellow(`Warning: Invalid format '${formatValue}'. Using default 'detailed' format.`));
          }
        }
        continue;
      }

      // Handle sort option
      if (arg === '--sort' || arg === '-s') {
        const sortValue = args[++i];
        if (sortValue === 'score' || sortValue === 'lcsc' || sortValue === 'manufacturer' || sortValue === 'package') {
          result.sortBy = sortValue;
        } else {
          if (!isJsonFormat) {
            console.warn(chalk.yellow(`Warning: Invalid sort option '${sortValue}'. Using default 'score' sort.`));
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
            console.warn(chalk.yellow(`Warning: Invalid limit '${args[i]}'. Using default limit of 5.`));
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
    const invalidCharsRegex = /[^\w\s\d.,\-+%()[\]{}:;'"\/\\&@#$^*=<>?!°Ωωµ±℃]/g;
    if (invalidCharsRegex.test(query)) {
      return false;
    }

    return true;
  }

  /**
   * Prompts the user for a search query when none is provided
   * @returns Promise that resolves to the user's input
   */
  private async promptForSearchQuery(): Promise<string> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      console.log(chalk.blue(`\n${this.programName} - KiCad Symbols Search Tool`));
      console.log(chalk.yellow('No search query provided. Please enter a search term:'));
      console.log(chalk.gray('Examples: "capacitor", "LM358", "4xxx:14528", "op amp"'));
      console.log(chalk.gray('Press Ctrl+C to exit\n'));

      rl.question(chalk.cyan('Search query: '), (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }

  /**
   * Sorts search results based on the specified criteria
   * @param results - Array of search results to sort
   * @param sortBy - Sorting criteria
   */
  private sortResults(results: SearchResult[], sortBy: 'score' | 'lcsc' | 'manufacturer' | 'package'): void {
    switch (sortBy) {
      case 'lcsc':
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
      console.log(chalk.yellow('No components found matching your search criteria.'));
      console.log(chalk.yellow('Try using more general terms or check your spelling.'));
      return;
    }

    console.log(chalk.green(`\nFound ${results.length} matching components:\n`));

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
      console.log(chalk.bold(`${index + 1}. #C${result.lcsc} - ${result.description}`));
      console.log(`   ${chalk.cyan('Manufacturer:')} ${result.manufacturer}`);
      console.log(`   ${chalk.cyan('Part Number:')} ${result.partNumber}`);
      console.log(`   ${chalk.cyan('Package:')} ${result.package}`);
      console.log(`   ${chalk.cyan('Details:')} ${result.matchSummary}`);
      console.log();
    });
  }

  /**
   * Displays results in compact format
   * @param results - Array of search results to display
   */
  private displayCompactResults(results: SearchResult[]): void {
    results.forEach((result, index) => {
      const scoreColor = this.getScoreColor(result.score);
      console.log(
        `${index + 1}. ${chalk.bold('#C' + result.lcsc)} - ` +
          `${result.description.substring(0, 40)}${result.description.length > 40 ? '...' : ''} - ` +
          `${result.package} - ` +
          `${scoreColor(result.score.toFixed(1))}`,
      );
    });
    console.log(); // Empty line at the end
  }

  /**
   * Displays results in table format
   * @param results - Array of search results to display
   */
  private displayTableResults(results: SearchResult[]): void {
    // Calculate column widths (accounting for #C prefix)
    const lcscWidth = Math.max(8, ...results.map((r) => ('#C' + r.lcsc).length));
    const mfrWidth = Math.max(12, ...results.map((r) => (r.manufacturer.length > 15 ? 15 : r.manufacturer.length)));
    const partWidth = Math.max(12, ...results.map((r) => (r.partNumber.length > 15 ? 15 : r.partNumber.length)));
    const pkgWidth = Math.max(7, ...results.map((r) => r.package.length));
    const descWidth = Math.min(40, Math.max(11, ...results.map((r) => r.description.length)));

    // Print table header
    console.log(
      chalk.bold(
        `${'#'.padEnd(3)} ` +
          `${'LCSC'.padEnd(lcscWidth)} ` +
          `${'Manufacturer'.padEnd(mfrWidth)} ` +
          `${'Part Number'.padEnd(partWidth)} ` +
          `${'Package'.padEnd(pkgWidth)} ` +
          `${'Score'.padEnd(6)} ` +
          `${'Description'.padEnd(descWidth)}`,
      ),
    );

    // Print separator
    console.log(
      `${''.padEnd(3, '-')} ` +
        `${''.padEnd(lcscWidth, '-')} ` +
        `${''.padEnd(mfrWidth, '-')} ` +
        `${''.padEnd(partWidth, '-')} ` +
        `${''.padEnd(pkgWidth, '-')} ` +
        `${''.padEnd(6, '-')} ` +
        `${''.padEnd(descWidth, '-')}`,
    );

    // Print table rows
    results.forEach((result, index) => {
      const scoreColor = this.getScoreColor(result.score);

      // Truncate long text
      const manufacturer =
        result.manufacturer.length > mfrWidth
          ? result.manufacturer.substring(0, mfrWidth - 3) + '...'
          : result.manufacturer;

      const partNumber =
        result.partNumber.length > partWidth
          ? result.partNumber.substring(0, partWidth - 3) + '...'
          : result.partNumber;

      const description =
        result.description.length > descWidth
          ? result.description.substring(0, descWidth - 3) + '...'
          : result.description;

      console.log(
        `${(index + 1).toString().padEnd(3)} ` +
          `${chalk.cyan(('#C' + result.lcsc).padEnd(lcscWidth))} ` +
          `${manufacturer.padEnd(mfrWidth)} ` +
          `${partNumber.padEnd(partWidth)} ` +
          `${result.package.padEnd(pkgWidth)} ` +
          `${scoreColor(result.score.toFixed(1).padEnd(6))} ` +
          `${description}`,
      );
    });

    console.log(); // Empty line at the end
  }

  /**
   * Displays results in JSON format
   * @param results - Array of search results to display
   */
  private displayJsonResults(results: SearchResult[]): void {
    // Handle empty results by outputting empty JSON array
    if (results.length === 0) {
      console.log('[]');
      return;
    }

    // Convert SearchResult array to JsonSearchResult array for consistent serialization
    const jsonResults = results.map((result) => ({
      lcsc: result.lcsc,
      manufacturer: result.manufacturer,
      partNumber: result.partNumber,
      description: result.description,
      package: result.package,
      score: result.score,
      matchSummary: result.matchSummary,
      ...(result.footprint && { footprint: result.footprint }),
      ...(result.fpFilters && result.fpFilters.length > 0 && { fpFilters: result.fpFilters }),
    }));

    // Output clean JSON with no additional formatting or colors
    console.log(JSON.stringify(jsonResults));
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
    console.log(JSON.stringify(jsonError));
  }

  /**
   * Displays help text and usage information
   */
  public displayHelp(): void {
    console.log(chalk.bold(`\n${this.programName} - JLCPCB Component Search Tool\n`));
    console.log('A command-line tool for searching JLCPCB components using fuzzy matching.\n');

    console.log(chalk.bold('Usage:'));
    console.log(`  ${this.programName} [options] <search query>\n`);

    console.log(chalk.bold('Options:'));
    console.log('  -h, --help                Display this help message');
    console.log('  -v, --version             Display version information');
    console.log('  -f, --format <format>     Output format: detailed, compact, table, or json (default: detailed)');
    console.log('  -s, --sort <field>        Sort by: score, lcsc, manufacturer, or package (default: score)');
    console.log('  -l, --limit <number>      Limit number of results (default: 5)\n');

    console.log(chalk.bold('Output Formats:'));
    console.log('  detailed                  Human-readable detailed output with colors and formatting');
    console.log('  compact                   Compact single-line format for each component');
    console.log('  table                     Tabular format with aligned columns');
    console.log(
      '  json                      Machine-readable JSON format (suppresses all formatting and progress indicators)\n',
    );

    console.log(chalk.bold('JSON Format:'));
    console.log(
      '  The JSON format outputs clean, machine-readable JSON without any formatting, colors, or progress indicators.',
    );
    console.log('  This format is ideal for programmatic integration and automated scripts.');
    console.log('  When no results are found, an empty array [] is returned.');
    console.log('  Error responses include an "error" field set to true with a "message" and optional "code".\n');

    console.log(chalk.bold('Examples:'));
    console.log(`  ${this.programName} "10k resistor 0603"`);
    console.log(`  ${this.programName} "100uF capacitor 16V" --format table`);
    console.log(`  ${this.programName} "USB-C connector" --sort manufacturer --limit 10`);
    console.log(`  ${this.programName} "LM358 op amp" --format compact`);
    console.log(`  ${this.programName} "capacitor" --format json`);
    console.log(`  ${this.programName} "resistor" --format json --limit 3 | jq '.[0].lcsc'`);
    console.log();
    console.log(
      chalk.italic(
        'This is part of the typeCAD project. Visit https://typecad.net to learn more about code-as-schematic.',
      ),
    );
    console.log();
  }

  /**
   * Displays version information
   */
  private displayVersion(): void {
    console.log(`${this.programName} version ${pkg.version}`);
  }
}
