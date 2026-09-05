import { promises as fs } from 'fs';
import { CacheUtils } from '../utils/CacheUtils.js';

/**
 * Manages timestamp tracking for cache expiration.
 * Supports both shared cache directory and custom cache directory modes.
 */
export class TimestampManager {
  private readonly cacheExpirationHours: number;
  private readonly useSharedCache: boolean;
  private readonly customCacheDir: string;
  private timestampFilePath: string | null = null;

  /**
   * Creates a new TimestampManager
   * @param cacheDir Custom cache directory (used when useSharedCache is false)
   * @param cacheExpirationHours Number of hours before cache expires
   * @param useSharedCache Whether to use shared cache directory (default: true)
   */
  constructor(cacheDir: string = '.', cacheExpirationHours: number = 24, useSharedCache: boolean = true) {
    this.cacheExpirationHours = cacheExpirationHours;
    this.useSharedCache = useSharedCache;
    this.customCacheDir = cacheDir;
  }

  /**
   * Gets the timestamp file path, resolving it asynchronously if needed
   * @returns Promise that resolves to the timestamp file path
   */
  private async getTimestampFilePath(): Promise<string> {
    if (this.timestampFilePath) {
      return this.timestampFilePath;
    }

    this.timestampFilePath = await CacheUtils.resolveCacheFilePath(
      '.jlcpcb-cache-timestamp',
      this.useSharedCache,
      this.customCacheDir,
    );

    return this.timestampFilePath;
  }

  /**
   * Reads the timestamp from the timestamp file
   * @returns The timestamp as a Date object, or null if file doesn't exist or is invalid
   */
  async readTimestamp(): Promise<Date | null> {
    try {
      const timestampFile = await this.getTimestampFilePath();
      const timestampStr = await fs.readFile(timestampFile, 'utf-8');
      const timestamp = new Date(timestampStr.trim());

      // Validate that the timestamp is a valid date
      if (isNaN(timestamp.getTime())) {
        return null;
      }

      return timestamp;
    } catch (error) {
      // File doesn't exist or can't be read
      return null;
    }
  }

  /**
   * Writes the current timestamp to the timestamp file
   * @param timestamp Optional timestamp to write, defaults to current time
   */
  async writeTimestamp(timestamp: Date = new Date()): Promise<void> {
    try {
      const timestampFile = await this.getTimestampFilePath();
      await fs.writeFile(timestampFile, timestamp.toISOString(), 'utf-8');
    } catch (error) {
      throw new Error(`Failed to write timestamp file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Checks if the cache is stale based on the timestamp file
   * @returns true if cache is stale (older than expiration time or doesn't exist)
   */
  async isCacheStale(): Promise<boolean> {
    const timestamp = await this.readTimestamp();

    if (!timestamp) {
      // No timestamp file exists, cache is considered stale
      return true;
    }

    const now = new Date();
    const expirationTime = new Date(timestamp.getTime() + this.cacheExpirationHours * 60 * 60 * 1000);

    return now > expirationTime;
  }

  /**
   * Gets the age of the cache in hours
   * @returns Age in hours, or null if no timestamp exists
   */
  async getCacheAgeHours(): Promise<number | null> {
    const timestamp = await this.readTimestamp();

    if (!timestamp) {
      return null;
    }

    const now = new Date();
    const ageMs = now.getTime() - timestamp.getTime();
    return ageMs / (1000 * 60 * 60);
  }

  /**
   * Deletes the timestamp file
   */
  async deleteTimestamp(): Promise<void> {
    try {
      const timestampFile = await this.getTimestampFilePath();
      await fs.unlink(timestampFile);
    } catch (error) {
      // Ignore errors if file doesn't exist
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }
}
