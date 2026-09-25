import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { CsvDownloader } from '../CsvDownloader.js';
import { NetworkError } from '../../types/index.js';

// Mock fetch API
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('CsvDownloader', () => {
  const testOutputFileName = 'test-output.csv';
  const testCacheDir = './test-cache-csv';
  let csvDownloader: CsvDownloader;
  let testOutputPath: string;

  beforeEach(async () => {
    // Create test cache directory
    await fs.mkdir(testCacheDir, { recursive: true });

    // Use isolated cache for tests
    csvDownloader = new CsvDownloader(3, 100, false, testCacheDir); // Use shorter backoff for tests
    testOutputPath = join(testCacheDir, testOutputFileName);

    // Reset mock
    mockFetch.mockReset();

    // Mock console.warn to avoid cluttering test output
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    // Clean up test files and cache directory
    try {
      const files = await fs.readdir(testCacheDir);
      for (const file of files) {
        await fs.unlink(join(testCacheDir, file));
      }
      await fs.rmdir(testCacheDir);
    } catch (error) {
      // Directory might not exist or be empty
    }

    // Restore console.warn
    vi.restoreAllMocks();
  });

  describe('downloadCsv', () => {
    it('should download CSV file successfully on first attempt', async () => {
      // Mock successful response
      const mockCsvContent = 'header1,header2,header3\nvalue1,value2,value3';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => mockCsvContent,
      });

      await expect(
        csvDownloader.downloadCsv('https://example.com/test.csv', testOutputFileName),
      ).resolves.not.toThrow();

      // Verify file was created with correct content
      const fileContent = await fs.readFile(`${testCacheDir}/${testOutputFileName}`, 'utf-8');
      expect(fileContent).toBe(mockCsvContent);

      // Verify fetch was called once with correct URL
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith('https://example.com/test.csv');
    });

    it('should retry on network failure and succeed on second attempt', async () => {
      // First attempt fails
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      // Second attempt succeeds
      const mockCsvContent = 'header1,header2,header3\nvalue1,value2,value3';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => mockCsvContent,
      });

      await expect(
        csvDownloader.downloadCsv('https://example.com/test.csv', testOutputFileName),
      ).resolves.not.toThrow();

      // Verify fetch was called twice
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Verify file was created with correct content
      const fileContent = await fs.readFile(`${testCacheDir}/${testOutputFileName}`, 'utf-8');
      expect(fileContent).toBe(mockCsvContent);
    });

    it('should retry on HTTP error and succeed on third attempt', async () => {
      // First attempt - HTTP 500 error
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      // Second attempt - HTTP 503 error
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      });

      // Third attempt succeeds
      const mockCsvContent = 'header1,header2,header3\nvalue1,value2,value3';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => mockCsvContent,
      });

      await expect(
        csvDownloader.downloadCsv('https://example.com/test.csv', testOutputFileName),
      ).resolves.not.toThrow();

      // Verify fetch was called three times
      expect(mockFetch).toHaveBeenCalledTimes(3);

      // Verify file was created with correct content
      const fileContent = await fs.readFile(testOutputPath, 'utf-8');
      expect(fileContent).toBe(mockCsvContent);
    });

    it('should fail after maximum retries', async () => {
      // All attempts fail
      mockFetch.mockRejectedValueOnce(new Error('Network error 1'));
      mockFetch.mockRejectedValueOnce(new Error('Network error 2'));
      mockFetch.mockRejectedValueOnce(new Error('Network error 3'));

      await expect(csvDownloader.downloadCsv('https://example.com/test.csv', testOutputFileName)).rejects.toThrow(
        /Failed to download CSV after 3 attempts/,
      );

      // Verify fetch was called three times
      expect(mockFetch).toHaveBeenCalledTimes(3);

      // Verify file was not created
      await expect(fs.access(testOutputPath)).rejects.toThrow();
    });

    it('should validate CSV content and reject if invalid', async () => {
      // Mock successful response but with invalid CSV content (no commas)
      const invalidContent = 'This is not a CSV file';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => invalidContent,
      });

      await expect(csvDownloader.downloadCsv('https://example.com/test.csv', testOutputFileName)).rejects.toThrow(
        /CSV validation failed/,
      );

      // Verify fetch was called once
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Verify file was deleted after validation failure
      await expect(fs.access(testOutputPath)).rejects.toThrow();
    });

    it('should handle empty response', async () => {
      // Mock successful response but with empty content
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => '',
      });

      await expect(csvDownloader.downloadCsv('https://example.com/test.csv', testOutputFileName)).rejects.toThrow(
        /CSV validation failed/,
      );

      // Verify fetch was called once
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should respect custom retry and backoff settings', async () => {
      // Create downloader with custom settings
      const customDownloader = new CsvDownloader(2, 50); // 2 retries, 50ms initial backoff

      // Both attempts fail
      mockFetch.mockRejectedValueOnce(new Error('Network error 1'));
      mockFetch.mockRejectedValueOnce(new Error('Network error 2'));

      const startTime = Date.now();

      await expect(customDownloader.downloadCsv('https://example.com/test.csv', testOutputFileName)).rejects.toThrow(
        /Failed to download CSV after 2 attempts/,
      );

      const duration = Date.now() - startTime;

      // Verify fetch was called twice
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Verify backoff timing (should be at least 50ms for first retry)
      // We're not testing exact timing as it can be flaky in test environments
      expect(duration).toBeGreaterThanOrEqual(50);
    });
  });
});
