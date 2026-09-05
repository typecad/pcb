import { promises as fs } from 'fs';
import { NetworkError } from '../types/index.js';
import { CacheUtils } from '../utils/CacheUtils.js';

/**
 * Handles downloading CSV files from remote URLs with retry logic.
 * Supports both shared cache directory and custom path modes.
 */
export class CsvDownloader {
  private readonly maxRetries: number;
  private readonly initialBackoffMs: number;
  private readonly useSharedCache: boolean;
  private readonly customCacheDir: string;

  /**
   * Creates a new CSV downloader
   * @param maxRetries Maximum number of retry attempts (default: 3)
   * @param initialBackoffMs Initial backoff time in milliseconds (default: 1000)
   * @param useSharedCache Whether to use shared cache directory (default: true)
   * @param customCacheDir Custom cache directory (used when useSharedCache is false)
   */
  constructor(
    maxRetries: number = 3,
    initialBackoffMs: number = 1000,
    useSharedCache: boolean = true,
    customCacheDir: string = '.',
  ) {
    this.maxRetries = maxRetries;
    this.initialBackoffMs = initialBackoffMs;
    this.useSharedCache = useSharedCache;
    this.customCacheDir = customCacheDir;
  }

  /**
   * Downloads a CSV file from a URL with retry logic
   * @param url URL to download the CSV from
   * @param fileName Name of the file to save (will be resolved to appropriate cache directory)
   * @returns Promise that resolves when download is complete
   * @throws NetworkError if download fails after all retries
   */
  async downloadCsv(url: string, fileName: string): Promise<void> {
    let attempt = 0;
    let lastError: Error | null = null;

    // Resolve the actual file path based on cache configuration
    const outputPath = await CacheUtils.resolveCacheFilePath(fileName, this.useSharedCache, this.customCacheDir);

    while (attempt < this.maxRetries) {
      try {
        // Attempt to download the file
        await this.performDownload(url, outputPath);

        // If download succeeds, validate the file
        await this.validateCsvFile(outputPath);

        // If we get here, both download and validation succeeded
        return;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        // If it's a validation error, don't retry
        if (errorMessage.includes('CSV validation failed')) {
          throw error;
        }

        lastError = error instanceof Error ? error : new Error(String(error));
        attempt++;

        if (attempt < this.maxRetries) {
          // Calculate exponential backoff time
          const backoffTime = this.initialBackoffMs * Math.pow(2, attempt - 1);
          console.warn(`Download attempt ${attempt} failed. Retrying in ${backoffTime}ms...`);
          await this.delay(backoffTime);
        }
      }
    }

    const errorCode = lastError instanceof Error && 'code' in lastError ? String(lastError.code) : 'DOWNLOAD_FAILED';
    throw new NetworkError(
      `Failed to download CSV after ${this.maxRetries} attempts: ${lastError?.message || 'Unknown error'}`,
      errorCode,
    );
  }

  /**
   * Performs the actual download operation
   * @param url URL to download from
   * @param outputPath Path to save the file
   * @private
   */
  private async performDownload(url: string, outputPath: string): Promise<void> {
    // Use native fetch API for Node.js
    const response = await fetch(url);

    if (!response.ok) {
      throw new NetworkError(`HTTP error: ${response.status} ${response.statusText}`, undefined, response.status);
    }

    // Get response as text
    const text = await response.text();

    // Write to file
    await fs.writeFile(outputPath, text, 'utf-8');
  }

  /**
   * Validates that the downloaded CSV file is complete and valid
   * @param filePath Path to the CSV file
   * @private
   */
  private async validateCsvFile(filePath: string): Promise<void> {
    try {
      // Check if file exists and has content
      const stats = await fs.stat(filePath);

      if (stats.size === 0) {
        throw new Error('Downloaded CSV file is empty');
      }

      // Read the first few bytes to check if it starts with valid CSV content
      const fileHandle = await fs.open(filePath, 'r');
      const buffer = Buffer.alloc(1024); // Read first 1KB

      const { bytesRead } = await fileHandle.read(buffer, 0, 1024, 0);
      await fileHandle.close();

      if (bytesRead === 0) {
        throw new Error('Could not read from CSV file');
      }

      const fileStart = buffer.toString('utf8', 0, bytesRead);

      // Basic validation: Check if the file starts with expected CSV header format
      // This is a simple check - we're looking for comma-separated values in the first line
      if (!fileStart.includes(',')) {
        throw new Error('File does not appear to be a valid CSV (no commas found in header)');
      }

      // Additional validation could be added here, such as checking for specific column headers
    } catch (error) {
      // If validation fails, delete the invalid file
      try {
        await fs.unlink(filePath);
      } catch {
        // Ignore errors when trying to delete the file
      }

      throw new Error(`CSV validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Simple delay function for implementing backoff
   * @param ms Milliseconds to delay
   * @private
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
