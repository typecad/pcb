import { promises as fs } from 'fs';
import { ComponentRecord } from '../types/index.js';
import { TimestampManager } from './TimestampManager.js';
import { CsvDownloader } from './CsvDownloader.js';
import { CsvParser } from './CsvParser.js';
import { CacheUtils } from '../utils/CacheUtils.js';
import { Logger } from '../cli/Logger.js';

/**
 * Manages component data including downloading, caching, and parsing.
 * Supports both shared cache directory and custom cache directory modes.
 */
export class DataManager {
  private readonly csvUrl: string;
  private readonly localCsvFileName: string;
  private readonly cacheDir: string;
  private readonly useSharedCache: boolean;
  private readonly timestampManager: TimestampManager;
  private readonly csvDownloader: CsvDownloader;
  private readonly csvParser: CsvParser;
  private cachedComponents: ComponentRecord[] | null = null;
  private resolvedCsvPath: string | null = null;
  private readonly logger: Logger;

  /**
   * Creates a new DataManager
   * @param csvUrl URL to download the CSV file from
   * @param localCsvFileName Name of the CSV file to save
   * @param cacheDir Directory to store cache files (used when useSharedCache is false)
   * @param cacheExpirationHours Number of hours before cache expires
   * @param useSharedCache Whether to use shared cache directory (default: true)
   */
  constructor(
    csvUrl: string = 'https://cdfer.github.io/jlcpcb-parts-database/jlcpcb-components-basic-preferred.csv',
    localCsvFileName: string = 'jlcpcb-components-basic-preferred.csv',
    cacheDir: string = '.',
    cacheExpirationHours: number = 24,
    useSharedCache: boolean = true,
  ) {
    this.csvUrl = csvUrl;
    this.localCsvFileName = localCsvFileName;
    this.cacheDir = cacheDir;
    this.useSharedCache = useSharedCache;
    this.timestampManager = new TimestampManager(cacheDir, cacheExpirationHours, useSharedCache);
    this.csvDownloader = new CsvDownloader(3, 1000, useSharedCache, cacheDir);
    this.csvParser = new CsvParser();
    this.logger = Logger.getInstance();
  }

  /**
   * Gets the resolved CSV file path, calculating it if needed
   * @returns Promise that resolves to the CSV file path
   */
  private async getResolvedCsvPath(): Promise<string> {
    if (this.resolvedCsvPath) {
      return this.resolvedCsvPath;
    }

    this.resolvedCsvPath = await CacheUtils.resolveCacheFilePath(
      this.localCsvFileName,
      this.useSharedCache,
      this.cacheDir,
    );

    return this.resolvedCsvPath;
  }

  /**
   * Ensures that component data is available and up-to-date
   * @returns Promise that resolves when data is available
   */
  async ensureDataAvailable(): Promise<void> {
    const isStale = await this.timestampManager.isCacheStale();

    if (isStale) {
      try {
        this.logger.info('Cache is stale or does not exist. Downloading fresh data...');
        await this.downloadCsvFile();
        await this.timestampManager.writeTimestamp();
        this.logger.info('Download complete and timestamp updated.');

        // Clear cached components to force reload
        this.cachedComponents = null;
      } catch (error) {
        // Check if local file exists before giving up
        try {
          const csvPath = await this.getResolvedCsvPath();
          await fs.access(csvPath);
          this.logger.warn(
            `Download failed, but using existing local file: ${error instanceof Error ? error.message : String(error)}`,
          );
        } catch {
          // No local file exists and download failed
          throw new Error(
            `Failed to download component data and no local cache exists: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    } else {
      const ageHours = await this.timestampManager.getCacheAgeHours();
      this.logger.info(`Using cached data (${ageHours?.toFixed(1)} hours old).`);
    }
  }

  /**
   * Gets the component data, downloading if necessary
   * @returns Promise that resolves to an array of ComponentRecord objects
   */
  async getCsvData(): Promise<ComponentRecord[]> {
    // Return cached components if available
    if (this.cachedComponents) {
      return this.cachedComponents;
    }

    // Ensure data is available
    await this.ensureDataAvailable();

    // Parse the CSV file
    try {
      this.logger.info('Parsing component data...');
      const csvPath = await this.getResolvedCsvPath();
      const components = await this.csvParser.parseFile(csvPath);
      this.logger.info(`Loaded ${components.length} components.`);

      // Cache the components
      this.cachedComponents = components;

      return components;
    } catch (error) {
      throw new Error(`Failed to parse component data: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Checks if the cache is stale
   * @returns Promise that resolves to true if cache is stale
   */
  async isDataStale(): Promise<boolean> {
    return this.timestampManager.isCacheStale();
  }

  /**
   * Downloads the CSV file from the remote URL
   * @private
   */
  private async downloadCsvFile(): Promise<void> {
    await this.csvDownloader.downloadCsv(this.csvUrl, this.localCsvFileName);
  }
}
