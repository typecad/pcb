import { DataManager, DataSourceMode } from '../data/DataManager.js';
import { EnhancedScoringSystem } from '../scoring/EnhancedScoringSystem.js';
import { ComponentSearchEngine } from '../scoring/SearchEngine.js';
import { ElectricalParameterParser, DataSourceType } from '../parsers/ParameterParser.js';
import logger from '../../utils/logging.js';
import { CommandLineInterface } from '../cli/CommandLineInterface.js';
import { ErrorHandler } from '../cli/ErrorHandler.js';

/**
 * Main application class that orchestrates all components
 *
 * The Application class serves as the central coordinator for the KiCad symbols search system.
 * It manages the initialization and coordination of all major components including data management,
 * parameter parsing, search engine, and command-line interface.
 *
 * Key responsibilities:
 * - Initialize and configure all system components
 * - Manage data loading and caching
 * - Coordinate search operations
 * - Handle application lifecycle (startup, shutdown)
 * - Provide error handling and logging
 *
 * @class Application
 * @example
 * ```typescript
 * // Create and run application
 * const app = new Application();
 * await app.run(process.argv);
 *
 * // Or use the convenience function
 * await runApplication(process.argv, {
 *   logLevel: LogLevel.INFO,
 *   cacheExpirationHours: 12
 * });
 * ```
 */
export class Application {
  private readonly dataManager: DataManager;
  private readonly parameterParser: ElectricalParameterParser;
  private readonly fuzzyScorer: EnhancedScoringSystem;
  private readonly searchEngine: ComponentSearchEngine;
  private readonly cli: CommandLineInterface;

  /**
   * Creates a new Application instance
   * @param localCachePath - Path to local cache file (ignored when using shared cache)
   * @param cacheDir - Directory for cache files (ignored when using shared cache)
   * @param cacheExpirationHours - Cache expiration time in hours
   * @param programName - Name of the program for CLI
   * @param useSharedCache - Whether to use shared temp directory for cache files (default: true)
   */
  constructor(
    localCachePath: string = 'kicad-symbols-cache.json',
    cacheDir: string = '.',
    cacheExpirationHours: number = 24,
    programName: string = 'kicad-symbols',
    useSharedCache: boolean = true,
  ) {
    try {
      // Create data manager with progress tracking
      this.dataManager = new DataManager(
        localCachePath,
        cacheDir,
        cacheExpirationHours,
        {
          mode: DataSourceMode.LOCAL_FILES,
          enableProgress: true,
          progressCallback: (progress) => {
            if (progress.phase === 'scanning' || progress.phase === 'extracting') {
              logger.debug(`${progress.phase}: ${progress.step} (${progress.percentage.toFixed(1)}%)`);
            }
          },
        },
        useSharedCache,
      );

      // Determine data source type and create appropriate parameter parser
      const dataSourceType = this.determineDataSourceType();
      this.parameterParser = new ElectricalParameterParser(dataSourceType);
      this.fuzzyScorer = new EnhancedScoringSystem();

      // Create search engine
      this.searchEngine = new ComponentSearchEngine(this.dataManager, this.parameterParser, this.fuzzyScorer);

      // Create CLI
      this.cli = new CommandLineInterface(this.searchEngine, programName);
    } catch (error) {
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
      // Run the CLI with the provided arguments
      await this.cli.run(args);
    } catch (error) {
      // Handle any uncaught errors
      const errorMessage = ErrorHandler.handleError(error);
      logger.error(errorMessage);

      // Exit with error code
      process.exit(1);
    }
  }

  /**
   * Performs cleanup operations before shutdown
   */
  public async shutdown(): Promise<void> {
    try {
      // Add any cleanup operations here
      // For example, closing database connections, saving state, etc.

      // Clear search engine cache if available
      if (this.searchEngine && typeof this.searchEngine.clearCache === 'function') {
        this.searchEngine.clearCache();
      }
    } catch (error) {
      logger.debug('App: shutdown error', error);
    }
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
  /**
   * Determines the data source type based on the data manager's current mode
   * @returns DataSourceType for parameter parsing
   * @private
   */
  private determineDataSourceType(): DataSourceType {
    // For now, assume KiCad symbols since that's what this application is designed for
    // In the future, this could be made more dynamic based on actual data source detection
    return DataSourceType.KICAD;
  }

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
    localCachePath?: string;
    cacheDir?: string;
    cacheExpirationHours?: number;
    programName?: string;
    useSharedCache?: boolean;
  } = {},
): Promise<void> {
  const {
    localCachePath = 'kicad-symbols-cache.json',
    cacheDir = '.',
    cacheExpirationHours = 24,
    programName = 'kicad-symbols',
    useSharedCache = true,
  } = options;

  let app: Application | null = null;

  try {
    // Create application with provided options
    app = new Application(localCachePath, cacheDir, cacheExpirationHours, programName, useSharedCache);

    // Run the application
    await app.run(args);
  } catch (error) {
    // Handle any uncaught errors
    const errorMessage = ErrorHandler.handleError(error);
    logger.error(errorMessage);

    // Exit with error code
    process.exit(1);
  } finally {
    // Ensure cleanup
    if (app) {
      await app.shutdown();
    }
  }
}
