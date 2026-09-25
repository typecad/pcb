import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

/**
 * Utility class for managing shared cache directories across the application.
 * Provides OS-appropriate temporary directory handling and cache path resolution.
 */
export class CacheUtils {
  private static readonly APP_CACHE_DIR_NAME = 'typecad-jlcpcb-parts-cache';
  private static _sharedCacheDir: string | null = null;

  /**
   * Gets the shared cache directory path, creating it if it doesn't exist.
   * Uses OS-appropriate temporary directory locations:
   * - Windows: %TEMP%\typecad-jlcpcb-parts-cache\
   * - macOS/Linux: /tmp/typecad-jlcpcb-parts-cache/
   *
   * @returns Promise that resolves to the shared cache directory path
   */
  static async getSharedCacheDir(): Promise<string> {
    if (this._sharedCacheDir) {
      return this._sharedCacheDir;
    }

    // Get OS temp directory and join with our app-specific cache folder
    const osTmpDir = tmpdir();
    const sharedCacheDir = join(osTmpDir, this.APP_CACHE_DIR_NAME);

    try {
      // Ensure the directory exists
      await fs.mkdir(sharedCacheDir, { recursive: true });

      // Cache the path for future calls
      this._sharedCacheDir = sharedCacheDir;

      return sharedCacheDir;
    } catch (error) {
      throw new Error(
        `Failed to create shared cache directory at ${sharedCacheDir}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Resolves a cache file path, either in the shared cache directory or a custom directory.
   *
   * @param fileName - Name of the cache file
   * @param useSharedCache - Whether to use shared cache directory (default: true)
   * @param customCacheDir - Custom cache directory to use when useSharedCache is false (default: current directory)
   * @returns Promise that resolves to the full file path
   */
  static async resolveCacheFilePath(
    fileName: string,
    useSharedCache: boolean = true,
    customCacheDir: string = '.',
  ): Promise<string> {
    if (useSharedCache) {
      const sharedCacheDir = await this.getSharedCacheDir();
      return join(sharedCacheDir, fileName);
    } else {
      return join(customCacheDir, fileName);
    }
  }

  /**
   * Clears the shared cache directory by removing all files within it.
   * The directory itself is kept for future use.
   *
   * @returns Promise that resolves when cache is cleared
   */
  static async clearSharedCache(): Promise<void> {
    try {
      const sharedCacheDir = await this.getSharedCacheDir();
      const files = await fs.readdir(sharedCacheDir);

      // Remove all files in the cache directory
      for (const file of files) {
        const filePath = join(sharedCacheDir, file);
        const stat = await fs.stat(filePath);

        if (stat.isFile()) {
          await fs.unlink(filePath);
        } else if (stat.isDirectory()) {
          // For subdirectories, remove recursively
          await fs.rm(filePath, { recursive: true, force: true });
        }
      }
    } catch (error) {
      // If the cache directory doesn't exist, that's fine
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new Error(`Failed to clear shared cache: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * Gets information about the shared cache directory.
   *
   * @returns Promise that resolves to cache directory info, or null if directory doesn't exist
   */
  static async getCacheInfo(): Promise<{
    path: string;
    exists: boolean;
    size: number;
    fileCount: number;
  } | null> {
    try {
      const sharedCacheDir = await this.getSharedCacheDir();

      try {
        const files = await fs.readdir(sharedCacheDir);
        let totalSize = 0;
        let fileCount = 0;

        for (const file of files) {
          const filePath = join(sharedCacheDir, file);
          const stat = await fs.stat(filePath);

          if (stat.isFile()) {
            totalSize += stat.size;
            fileCount++;
          }
        }

        return {
          path: sharedCacheDir,
          exists: true,
          size: totalSize,
          fileCount,
        };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return {
            path: sharedCacheDir,
            exists: false,
            size: 0,
            fileCount: 0,
          };
        }
        throw error;
      }
    } catch (error) {
      return null;
    }
  }

  /**
   * Validates that a cache directory is writable.
   *
   * @param cacheDir - Directory path to validate
   * @returns Promise that resolves to true if directory is writable
   */
  static async validateCacheDirectory(cacheDir: string): Promise<boolean> {
    try {
      // Try to create the directory if it doesn't exist
      await fs.mkdir(cacheDir, { recursive: true });

      // Test write access by creating and removing a temporary file
      const testFile = join(cacheDir, '.write-test');
      await fs.writeFile(testFile, 'test', 'utf-8');
      await fs.unlink(testFile);

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Resets the cached shared cache directory path.
   * Useful for testing or when the cache directory needs to be recalculated.
   */
  static resetCachedPath(): void {
    this._sharedCacheDir = null;
  }
}
