import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { TimestampManager } from './TimestampManager.js';
import { CacheUtils } from '../utils/CacheUtils.js';

/**
 * Manages cache validation based on remote "Last updated" dates
 * Extends TimestampManager to add date-based cache validation
 */
export class DateBasedCacheManager extends TimestampManager {
  private readonly lastUpdatedFile: string;
  private readonly useSharedCacheForDates: boolean;

  constructor(cacheDir: string = '.', cacheExpirationHours: number = 24, useSharedCache: boolean = true) {
    super(cacheDir, cacheExpirationHours, useSharedCache);
    this.useSharedCacheForDates = useSharedCache;

    if (useSharedCache) {
      // Will be set asynchronously in getLastUpdatedFile()
      this.lastUpdatedFile = '';
    } else {
      // Legacy behavior for backward compatibility
      this.lastUpdatedFile = join(cacheDir, '.kicad-last-updated-date');
    }
  }

  /**
   * Gets the last updated file path, creating shared cache directory if needed
   */
  private async getLastUpdatedFile(): Promise<string> {
    if (this.useSharedCacheForDates) {
      const cacheDir = await CacheUtils.getSharedCacheDir();
      return join(cacheDir, '.kicad-last-updated-date');
    }
    return this.lastUpdatedFile;
  }

  /**
   * Gets the stored "Last updated" date from the cache
   * @returns The last updated date as a Date object, or null if not found or invalid
   */
  async getLastUpdatedDate(): Promise<Date | null> {
    try {
      const lastUpdatedFile = await this.getLastUpdatedFile();
      const dateStr = await fs.readFile(lastUpdatedFile, 'utf-8');
      const date = new Date(dateStr.trim());

      // Validate that the date is a valid date
      if (isNaN(date.getTime())) {
        return null;
      }

      return date;
    } catch (error) {
      // File doesn't exist or can't be read
      return null;
    }
  }

  /**
   * Stores the "Last updated" date to the cache
   * @param date The last updated date to store
   */
  async setLastUpdatedDate(date: Date): Promise<void> {
    try {
      const lastUpdatedFile = await this.getLastUpdatedFile();
      await fs.writeFile(lastUpdatedFile, date.toISOString(), 'utf-8');
    } catch (error) {
      throw new Error(
        `Failed to write last updated date file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Checks if the cache is stale based on comparing stored date with remote date
   * @param remoteDate The current "Last updated" date from the remote source
   * @returns true if cache is stale (dates don't match or no stored date exists)
   */
  async isCacheStaleByDate(remoteDate: Date): Promise<boolean> {
    const storedDate = await this.getLastUpdatedDate();

    if (!storedDate) {
      // No stored date exists, cache is considered stale
      return true;
    }

    // Compare dates - if they're different, cache is stale
    return storedDate.getTime() !== remoteDate.getTime();
  }

  /**
   * Comprehensive cache validation that combines date-based and time-based checks
   * @param remoteDate The current "Last updated" date from the remote source (optional)
   * @returns true if cache is stale and needs to be refreshed
   */
  async isCacheStale(remoteDate?: Date): Promise<boolean> {
    // First check if we need to validate based on 24-hour interval
    const shouldCheckRemote = await this.shouldCheckRemoteDate();

    if (!shouldCheckRemote && !remoteDate) {
      // Within 24-hour window and no remote date provided, cache is fresh
      return false;
    }

    if (remoteDate) {
      // We have a remote date, use date-based validation
      const isStaleByDate = await this.isCacheStaleByDate(remoteDate);

      if (isStaleByDate) {
        return true;
      }

      // Dates match, update our check timestamp and consider cache fresh
      await this.writeTimestamp();
      return false;
    }

    // Fallback to time-based caching if date parsing fails or no remote date
    return await super.isCacheStale();
  }

  /**
   * Checks if we should validate against the remote date based on 24-hour interval
   * @returns true if more than 24 hours have passed since last check
   */
  private async shouldCheckRemoteDate(): Promise<boolean> {
    const cacheAge = await this.getCacheAgeHours();

    if (cacheAge === null) {
      // No timestamp exists, should check remote
      return true;
    }

    // Check if 24 hours have passed since last validation
    return cacheAge >= 24;
  }

  /**
   * Deletes both timestamp and last updated date files
   */
  async deleteTimestamp(): Promise<void> {
    await super.deleteTimestamp();

    try {
      const lastUpdatedFile = await this.getLastUpdatedFile();
      await fs.unlink(lastUpdatedFile);
    } catch (error) {
      // Ignore errors if file doesn't exist
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }
}
