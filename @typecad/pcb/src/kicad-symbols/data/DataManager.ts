import { promises as fs } from 'node:fs';
import logger from '../../utils/logging.js';
import { ComponentRecord } from '../types/index.js';
import { DateBasedCacheManager } from './DateBasedCacheManager.js';
import { KiCadLocalDataProcessor, ProcessingProgress, ProcessingStatistics } from './KiCadLocalDataProcessor.js';
import { KiCadSymbolConverter } from './KiCadSymbolConverter.js';
import { CacheUtils } from '../utils/CacheUtils.js';

/**
 * Data source modes for the DataManager
 */
export enum DataSourceMode {
  /** Process local KiCad symbol files */
  LOCAL_FILES = 'local_files',
}

/**
 * Configuration options for DataManager
 */
export interface DataManagerConfig {
  /** Data source mode */
  mode: DataSourceMode;
  /** Custom KiCad symbols path (for local mode) */
  customSymbolsPath?: string;
  /** Enable progress reporting */
  enableProgress: boolean;
  /** Progress callback function */
  progressCallback?: (progress: ProcessingProgress) => void;
}

/**
 * Default DataManager configuration
 */
const DEFAULT_CONFIG: DataManagerConfig = {
  mode: DataSourceMode.LOCAL_FILES,
  enableProgress: false,
};

/**
 * Manages component data including caching and parsing
 * Supports local file processing mode only
 */
export class DataManager {
  private readonly localDataPath: string;
  private readonly cacheManager: DateBasedCacheManager;
  private readonly localProcessor: KiCadLocalDataProcessor;
  private readonly config: DataManagerConfig;
  private cachedComponents: ComponentRecord[] | null = null;
  private currentMode: DataSourceMode = DataSourceMode.LOCAL_FILES;
  private readonly useSharedCache: boolean;

  /**
   * Creates a new DataManager
   * @param localDataPath Local path to save the data file (ignored if useSharedCache is true)
   * @param cacheDir Directory to store cache files (ignored if useSharedCache is true)
   * @param cacheExpirationHours Number of hours before cache expires
   * @param config Optional configuration for data source mode and options
   * @param useSharedCache Whether to use shared temp directory for cache files
   */
  constructor(
    localDataPath: string = 'kicad-symbols-data.json',
    cacheDir: string = '.',
    cacheExpirationHours: number = 24,
    config: Partial<DataManagerConfig> = {},
    useSharedCache: boolean = true,
  ) {
    this.useSharedCache = useSharedCache;
    this.localDataPath = localDataPath;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.currentMode = DataSourceMode.LOCAL_FILES;

    this.cacheManager = new DateBasedCacheManager(cacheDir, cacheExpirationHours, useSharedCache);
    this.localProcessor = new KiCadLocalDataProcessor({
      customSymbolsPath: this.config.customSymbolsPath,
      enableProgress: this.config.enableProgress,
    });
  }

  /**
   * Gets the cache file path, using shared cache directory if enabled
   */
  private async getCacheFilePath(): Promise<string> {
    if (this.useSharedCache) {
      return await CacheUtils.getDefaultCacheFilePath();
    }
    return this.localDataPath;
  }

  /**
   * Ensures that component data is available and up-to-date
   */
  async ensureDataAvailable(): Promise<void> {
    try {
      // Always use local files mode
      this.currentMode = DataSourceMode.LOCAL_FILES;

      await this.ensureLocalDataAvailable();
    } catch (error) {
      logger.error('Failed to ensure data availability:', error);
      throw error;
    }
  }

  /**
   * Ensures local data is available and up-to-date
   */
  private async ensureLocalDataAvailable(): Promise<void> {
    try {
      // Check if we have valid cached data
      if (await this.isLocalCacheValid()) {
        logger.info('Using cached local KiCad symbols data.');
        return;
      }

      // Check if local symbols are available
      const symbolsPath = await this.getLocalSymbolsPath();
      if (!symbolsPath) {
        throw new Error('No local KiCad symbols found. Please ensure KiCad symbols are installed.');
      }

      logger.info('Processing local KiCad symbols...');

      // Process local symbols
      const extractedSymbols = await this.localProcessor.processLocalSymbols();

      // Convert to ComponentRecord format
      const converter = new KiCadSymbolConverter();
      const components = converter.convertSymbolsToComponentRecords(extractedSymbols);

      // Save processed data
      await this.saveDataToFile(components);

      // Update cache timestamp
      await this.cacheManager.writeTimestamp();

      logger.info(`Successfully processed ${components.length} symbols from local files.`);
    } catch (error) {
      logger.error('Failed to process local symbols:', error);
      throw error;
    }
  }

  /**
   * Gets component data from the cache or processes local files
   */
  async getCsvData(): Promise<ComponentRecord[]> {
    if (this.cachedComponents) {
      return this.cachedComponents;
    }

    await this.ensureDataAvailable();

    try {
      this.cachedComponents = await this.loadDataFromFile();
      return this.cachedComponents;
    } catch (error) {
      logger.error('Failed to load component data:', error);
      throw error;
    }
  }

  /**
   * Checks if the local cache is valid
   */
  async isDataStale(): Promise<boolean> {
    return !(await this.isLocalCacheValid());
  }

  /**
   * Saves component data to a JSON file
   */
  private async saveDataToFile(components: ComponentRecord[]): Promise<void> {
    try {
      const cacheFilePath = await this.getCacheFilePath();
      const data = JSON.stringify(components, null, 2);
      await fs.writeFile(cacheFilePath, data, 'utf8');
    } catch (error) {
      logger.error('Failed to save data to file:', error);
      throw error;
    }
  }

  /**
   * Loads component data from the JSON file
   */
  private async loadDataFromFile(): Promise<ComponentRecord[]> {
    try {
      const cacheFilePath = await this.getCacheFilePath();
      const data = await fs.readFile(cacheFilePath, 'utf8');
      return JSON.parse(data) as ComponentRecord[];
    } catch (error) {
      logger.error('Failed to load data from file:', error);
      throw error;
    }
  }

  /**
   * Gets the current data source mode
   */
  getCurrentMode(): DataSourceMode {
    return this.currentMode;
  }

  /**
   * Checks if local KiCad symbols are available
   */
  async areLocalSymbolsAvailable(): Promise<boolean> {
    const symbolsPath = await this.getLocalSymbolsPath();
    return symbolsPath !== undefined;
  }

  /**
   * Gets the path to local KiCad symbols
   */
  async getLocalSymbolsPath(): Promise<string | undefined> {
    try {
      return await this.localProcessor.getSymbolsPath();
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Forces a refresh of the data by clearing cache and reprocessing
   */
  async forceRefresh(): Promise<void> {
    logger.info('Forcing data refresh...');

    // Clear cached data
    this.cachedComponents = null;

    // Clear cache timestamp
    await this.cacheManager.deleteTimestamp();

    // Reprocess data
    await this.ensureDataAvailable();
  }

  /**
   * Gets processing statistics from the local processor
   */
  getProcessingStatistics(): ProcessingStatistics {
    return this.localProcessor.getStatistics();
  }

  /**
   * Gets a summary of processing results
   */
  getProcessingSummary(): string {
    return this.localProcessor.getProcessingSummary();
  }

  /**
   * Checks if the local cache is valid
   */
  private async isLocalCacheValid(): Promise<boolean> {
    try {
      // Check if cache file exists and is not expired
      if (await this.cacheManager.isCacheStale()) {
        return false;
      }

      // Check if data file exists
      const cacheFilePath = await this.getCacheFilePath();
      if (!(await this.fileExists(cacheFilePath))) {
        return false;
      }

      // Check if local symbols have been updated since last cache
      const symbolsPath = await this.getLocalSymbolsPath();
      if (!symbolsPath) {
        return false;
      }

      const cacheTimestamp = await this.cacheManager.readTimestamp();
      if (!cacheTimestamp) {
        return false;
      }

      // Check if symbol files are newer than cache
      if (await this.hasNewerSymbolFiles(symbolsPath, cacheTimestamp)) {
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Error checking cache validity:', error);
      return false;
    }
  }

  /**
   * Checks if symbol files are newer than the cache timestamp
   */
  private async hasNewerSymbolFiles(symbolsPath: string, cacheTimestamp: Date): Promise<boolean> {
    try {
      const stats = await fs.stat(symbolsPath);
      return stats.mtime > cacheTimestamp;
    } catch (error) {
      logger.error('Error checking file timestamps:', error);
      return false;
    }
  }

  /**
   * Checks if a file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
