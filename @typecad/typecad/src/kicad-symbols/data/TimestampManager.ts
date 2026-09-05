import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { CacheUtils } from '../utils/CacheUtils.js';

/**
 * Manages timestamp tracking for cache expiration
 */
export class TimestampManager {
  private readonly timestampFile: string;
  private readonly cacheExpirationHours: number;
  private readonly useSharedCache: boolean;

  constructor(cacheDir: string = '.', cacheExpirationHours: number = 24, useSharedCache: boolean = true) {
    this.useSharedCache = useSharedCache;
    this.cacheExpirationHours = cacheExpirationHours;

    if (useSharedCache) {
      // Will be set asynchronously in getTimestampFile()
      this.timestampFile = '';
    } else {
      // Legacy behavior for backward compatibility
      this.timestampFile = join(cacheDir, '.kicad-cache-timestamp');
    }
  }

  /**
   * Gets the timestamp file path, creating shared cache directory if needed
   */
  private async getTimestampFile(): Promise<string> {
    if (this.useSharedCache) {
      return await CacheUtils.getTimestampFilePath();
    }
    return this.timestampFile;
  }

  /**
   * Reads the timestamp from the timestamp file
   * @returns The timestamp as a Date object, or null if file doesn't exist or is invalid
   */
  async readTimestamp(): Promise<Date | null> {
    try {
      const timestampFile = await this.getTimestampFile();
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
      const timestampFile = await this.getTimestampFile();
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
      const timestampFile = await this.getTimestampFile();
      await fs.unlink(timestampFile);
    } catch (error) {
      // Ignore errors if file doesn't exist
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }
}
