import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DateBasedCacheManager } from '../src/kicad-symbols/data/DateBasedCacheManager.js';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('DateBasedCacheManager', () => {
  let cacheManager: DateBasedCacheManager;
  let tempDir: string;

  beforeEach(async () => {
    // Create a temporary directory for each test
    tempDir = await fs.mkdtemp(join(tmpdir(), 'cache-test-'));
    cacheManager = new DateBasedCacheManager(tempDir, 24, false);
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('getLastUpdatedDate and setLastUpdatedDate', () => {
    it('should return null when no date is stored', async () => {
      const date = await cacheManager.getLastUpdatedDate();
      expect(date).toBeNull();
    });

    it('should store and retrieve a date correctly', async () => {
      const testDate = new Date('2023-12-01T10:00:00Z');
      await cacheManager.setLastUpdatedDate(testDate);

      const retrievedDate = await cacheManager.getLastUpdatedDate();
      expect(retrievedDate).toEqual(testDate);
    });

    it('should handle invalid date strings gracefully', async () => {
      const lastUpdatedFile = join(tempDir, '.kicad-last-updated-date');
      await fs.writeFile(lastUpdatedFile, 'invalid-date', 'utf-8');

      const date = await cacheManager.getLastUpdatedDate();
      expect(date).toBeNull();
    });
  });

  describe('isCacheStaleByDate', () => {
    it('should return true when no stored date exists', async () => {
      const remoteDate = new Date('2023-12-01T10:00:00Z');
      const isStale = await cacheManager.isCacheStaleByDate(remoteDate);
      expect(isStale).toBe(true);
    });

    it('should return false when dates match exactly', async () => {
      const testDate = new Date('2023-12-01T10:00:00Z');
      await cacheManager.setLastUpdatedDate(testDate);

      const isStale = await cacheManager.isCacheStaleByDate(testDate);
      expect(isStale).toBe(false);
    });

    it('should return true when dates are different', async () => {
      const storedDate = new Date('2023-12-01T10:00:00Z');
      const remoteDate = new Date('2023-12-02T10:00:00Z');

      await cacheManager.setLastUpdatedDate(storedDate);

      const isStale = await cacheManager.isCacheStaleByDate(remoteDate);
      expect(isStale).toBe(true);
    });
  });

  describe('isCacheStale (comprehensive validation)', () => {
    it('should return true when no timestamp exists and no remote date provided', async () => {
      const isStale = await cacheManager.isCacheStale();
      expect(isStale).toBe(true);
    });

    it('should use date-based validation when remote date is provided', async () => {
      const testDate = new Date('2023-12-01T10:00:00Z');
      const remoteDate = new Date('2023-12-02T10:00:00Z');

      await cacheManager.setLastUpdatedDate(testDate);

      const isStale = await cacheManager.isCacheStale(remoteDate);
      expect(isStale).toBe(true);
    });

    it('should return false when dates match and update timestamp', async () => {
      const testDate = new Date('2023-12-01T10:00:00Z');

      await cacheManager.setLastUpdatedDate(testDate);

      const isStale = await cacheManager.isCacheStale(testDate);
      expect(isStale).toBe(false);

      // Verify timestamp was updated
      const timestamp = await cacheManager.readTimestamp();
      expect(timestamp).not.toBeNull();
    });
  });

  describe('deleteTimestamp', () => {
    it('should delete both timestamp and last updated date files', async () => {
      const testDate = new Date('2023-12-01T10:00:00Z');

      await cacheManager.setLastUpdatedDate(testDate);
      await cacheManager.writeTimestamp();

      // Verify files exist
      expect(await cacheManager.getLastUpdatedDate()).not.toBeNull();
      expect(await cacheManager.readTimestamp()).not.toBeNull();

      await cacheManager.deleteTimestamp();

      // Verify files are deleted
      expect(await cacheManager.getLastUpdatedDate()).toBeNull();
      expect(await cacheManager.readTimestamp()).toBeNull();
    });
  });
});
