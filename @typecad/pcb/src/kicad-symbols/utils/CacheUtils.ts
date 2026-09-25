import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promises as fs } from 'node:fs';
import logger from '../../utils/logging.js';

/**
 * Utility functions for cache directory management
 */
export class CacheUtils {
  private static readonly CACHE_DIR_NAME = 'kicad-symbols-cache';

  /**
   * Gets the shared cache directory for all instances of the application
   * Creates the directory if it doesn't exist
   * @returns Promise<string> Path to the cache directory
   */
  static async getSharedCacheDir(): Promise<string> {
    const tempDir = tmpdir();
    const cacheDir = join(tempDir, this.CACHE_DIR_NAME);

    try {
      // Ensure the cache directory exists
      await fs.mkdir(cacheDir, { recursive: true });
      return cacheDir;
    } catch (error) {
      throw new Error(`Failed to create cache directory: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Gets the default cache file path in the shared cache directory
   * @param filename Optional filename, defaults to 'kicad-symbols-cache.json'
   * @returns Promise<string> Full path to the cache file
   */
  static async getDefaultCacheFilePath(filename: string = 'kicad-symbols-cache.json'): Promise<string> {
    const cacheDir = await this.getSharedCacheDir();
    return join(cacheDir, filename);
  }

  /**
   * Gets the timestamp file path in the shared cache directory
   * @returns Promise<string> Full path to the timestamp file
   */
  static async getTimestampFilePath(): Promise<string> {
    const cacheDir = await this.getSharedCacheDir();
    return join(cacheDir, '.kicad-cache-timestamp');
  }

  /**
   * Cleans up old cache files (optional utility for maintenance)
   * @param maxAgeHours Maximum age in hours before files are considered old
   */
  static async cleanupOldCacheFiles(maxAgeHours: number = 168): Promise<void> {
    // Default 7 days
    try {
      const cacheDir = await this.getSharedCacheDir();
      const files = await fs.readdir(cacheDir);
      const now = Date.now();
      const maxAgeMs = maxAgeHours * 60 * 60 * 1000;

      for (const file of files) {
        const filePath = join(cacheDir, file);
        try {
          const stats = await fs.stat(filePath);
          const fileAge = now - stats.mtime.getTime();

          if (fileAge > maxAgeMs) {
            await fs.unlink(filePath);
            logger.info(`Cleaned up old cache file: ${file}`);
          }
        } catch (error) {
          // Ignore errors for individual files
          logger.warn(`Failed to clean up cache file ${file}:`, error);
        }
      }
    } catch (error) {
      logger.warn('Failed to cleanup cache directory:', error);
    }
  }
}
