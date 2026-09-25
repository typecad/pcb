import { DataManager } from '../data/DataManager.js';
import { ElectricalParameterParser } from '../parsers/ParameterParser.js';
import { ComponentFuzzyScorer } from '../scoring/FuzzyScorer.js';
import { ComponentSearchEngine } from '../scoring/SearchEngine.js';
import { CommandLineInterface } from '../cli/CommandLineInterface.js';
import { ErrorHandler } from '../cli/ErrorHandler.js';
import { Logger, LogLevel } from '../cli/Logger.js';
import { GlobalErrorHandler } from '../cli/GlobalErrorHandler.js';

let signalHandlersRegistered = false;

export function _resetSignalHandlers(): void {
  signalHandlersRegistered = false;
}

/**
 * Application class that initializes and coordinates all components
 */
export class Application {
  private readonly dataManager: DataManager;
  private readonly parameterParser: ElectricalParameterParser;
  private readonly fuzzyScorer: ComponentFuzzyScorer;
  private readonly searchEngine: ComponentSearchEngine;
  private readonly cli: CommandLineInterface;
  private readonly logger: Logger;

  /**
   * Creates a new Application instance
   * @param csvUrl - URL to download the CSV file from
   * @param localCsvFileName - Name of the CSV file to save
   * @param cacheDir - Directory to store cache files (used when useSharedCache is false)
   * @param cacheExpirationHours - Number of hours before cache expires
   * @param programName - Name of the program for CLI display
   * @param logLevel - Minimum log level to display in the console
   * @param useSharedCache - Whether to use shared cache directory (default: true)
   */
  constructor(
    csvUrl: string = 'https://cdfer.github.io/jlcpcb-parts-database/jlcpcb-components-basic-preferred.csv',
    localCsvFileName: string = 'jlcpcb-components-basic-preferred.csv',
    cacheDir: string = '.',
    cacheExpirationHours: number = 24,
    programName: string = 'jlcpcb-search',
    logLevel: LogLevel = LogLevel.WARN,
    useSharedCache: boolean = true,
  ) {
    // Initialize logger
    this.logger = Logger.getInstance({
      consoleLevel: logLevel,
    });

    // Initialize global error handler
    GlobalErrorHandler.initialize(this.logger);

    this.logger.info('Initializing application');

    try {
      // Initialize components
      this.dataManager = new DataManager(csvUrl, localCsvFileName, cacheDir, cacheExpirationHours, useSharedCache);
      this.parameterParser = new ElectricalParameterParser();
      this.fuzzyScorer = new ComponentFuzzyScorer();

      // Create search engine
      this.searchEngine = new ComponentSearchEngine(this.dataManager, this.parameterParser, this.fuzzyScorer);

      // Create CLI
      this.cli = new CommandLineInterface(this.searchEngine, programName);

      this.logger.info('Application initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize application', error);
      throw error;
    }
  }

  /**
   * Runs the application with the provided command-line arguments
   * @param args - Command-line arguments (process.argv)
   * @returns Promise that resolves when the application completes
   */
  public async run(args: string[]): Promise<void> {
    try {
      this.logger.info('Starting application', { args: args.slice(2) });

      // Run the CLI with the provided arguments
      await this.cli.run(args);

      this.logger.info('Application completed successfully');
    } catch (error) {
      this.logger.error('Application failed', error);

      const errorMessage = ErrorHandler.handleError(error);
      console.error(errorMessage);

      throw error;
    }
  }

  /**
   * Performs cleanup operations before shutdown
   */
  public async shutdown(): Promise<void> {
    this.logger.info('Shutting down application...');

    try {
      // Add any cleanup operations here
      // For example, closing database connections, saving state, etc.

      // Clear search engine cache if available
      if (this.searchEngine && typeof this.searchEngine.clearCache === 'function') {
        this.searchEngine.clearCache();
        this.logger.debug('Search engine cache cleared');
      }

      this.logger.info('Application shutdown complete');
    } catch (error) {
      this.logger.error('Error during shutdown', error);
    }
  }

  /**
   * Gets the logger instance
   * @returns The logger instance
   */
  public getLogger(): Logger {
    return this.logger;
  }

  /**
   * Gets the search engine instance
   * @returns The search engine instance
   */
  public getSearchEngine(): ComponentSearchEngine {
    return this.searchEngine;
  }

  /**
   * Gets the data manager instance
   * @returns The data manager instance
   */
  public getDataManager(): DataManager {
    return this.dataManager;
  }
}

/**
 * Creates and runs the application
 * @param args - Command-line arguments (process.argv)
 * @param options - Application options
 * @returns Promise that resolves when the application completes
 */
export async function runApplication(
  args: string[],
  options: {
    csvUrl?: string;
    localCsvFileName?: string;
    cacheDir?: string;
    cacheExpirationHours?: number;
    programName?: string;
    logLevel?: LogLevel;
    useSharedCache?: boolean;
  } = {},
): Promise<void> {
  let app: Application | null = null;

  try {
    // Create application with provided options
    app = new Application(
      options.csvUrl,
      options.localCsvFileName,
      options.cacheDir,
      options.cacheExpirationHours,
      options.programName,
      options.logLevel,
      options.useSharedCache,
    );

    const logger = app.getLogger();

    if (!signalHandlersRegistered) {
      signalHandlersRegistered = true;

      process.on('SIGINT', async () => {
        logger.info('\nReceived SIGINT. Shutting down...');
        if (app) {
          await app.shutdown();
        }
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        logger.info('\nReceived SIGTERM. Shutting down...');
        if (app) {
          await app.shutdown();
        }
        process.exit(0);
      });
    }

    // Run the application
    await app.run(args);
  } catch (error) {
    if (!app) {
      console.error('Failed to initialize application:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }

    process.exit(1);
  }
}
