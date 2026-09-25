import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { TimestampManager } from '../TimestampManager.js';

describe('TimestampManager', () => {
  const testCacheDir = './test-cache-timestamp';
  const timestampFile = join(testCacheDir, '.jlcpcb-cache-timestamp');
  let timestampManager: TimestampManager;

  beforeEach(async () => {
    // Create test directory with recursive option to ensure parent directories exist
    await fs.mkdir(testCacheDir, { recursive: true });

    timestampManager = new TimestampManager(testCacheDir, 24, false); // Disable shared cache for tests
  });

  afterEach(async () => {
    // Clean up test files and directory
    try {
      await fs.unlink(timestampFile);
    } catch (error) {
      // File might not exist
    }

    try {
      await fs.rmdir(testCacheDir);
    } catch (error) {
      // Directory might not be empty or not exist
    }
  });

  describe('readTimestamp', () => {
    it('should return null when timestamp file does not exist', async () => {
      const timestamp = await timestampManager.readTimestamp();
      expect(timestamp).toBeNull();
    });

    it('should return valid timestamp when file exists with valid date', async () => {
      const testDate = new Date('2024-01-15T10:30:00.000Z');
      await fs.writeFile(timestampFile, testDate.toISOString(), 'utf-8');

      const timestamp = await timestampManager.readTimestamp();
      expect(timestamp).toEqual(testDate);
    });

    it('should return null when file contains invalid date', async () => {
      await fs.writeFile(timestampFile, 'invalid-date', 'utf-8');

      const timestamp = await timestampManager.readTimestamp();
      expect(timestamp).toBeNull();
    });

    it('should handle whitespace in timestamp file', async () => {
      const testDate = new Date('2024-01-15T10:30:00.000Z');
      await fs.writeFile(timestampFile, `  ${testDate.toISOString()}  \n`, 'utf-8');

      const timestamp = await timestampManager.readTimestamp();
      expect(timestamp).toEqual(testDate);
    });
  });

  describe('writeTimestamp', () => {
    it('should write current timestamp when no parameter provided', async () => {
      const beforeWrite = new Date();
      await timestampManager.writeTimestamp();
      const afterWrite = new Date();

      const writtenTimestamp = await timestampManager.readTimestamp();
      expect(writtenTimestamp).not.toBeNull();
      expect(writtenTimestamp!.getTime()).toBeGreaterThanOrEqual(beforeWrite.getTime());
      expect(writtenTimestamp!.getTime()).toBeLessThanOrEqual(afterWrite.getTime());
    });

    it('should write specific timestamp when provided', async () => {
      const testDate = new Date('2024-01-15T10:30:00.000Z');
      await timestampManager.writeTimestamp(testDate);

      const writtenTimestamp = await timestampManager.readTimestamp();
      expect(writtenTimestamp).toEqual(testDate);
    });

    it('should overwrite existing timestamp', async () => {
      const firstDate = new Date('2024-01-15T10:30:00.000Z');
      const secondDate = new Date('2024-01-16T15:45:00.000Z');

      await timestampManager.writeTimestamp(firstDate);
      await timestampManager.writeTimestamp(secondDate);

      const finalTimestamp = await timestampManager.readTimestamp();
      expect(finalTimestamp).toEqual(secondDate);
    });
  });

  describe('isCacheStale', () => {
    it('should return true when no timestamp file exists', async () => {
      const isStale = await timestampManager.isCacheStale();
      expect(isStale).toBe(true);
    });

    it('should return false when timestamp is recent', async () => {
      const recentDate = new Date(Date.now() - 12 * 60 * 60 * 1000); // 12 hours ago
      await timestampManager.writeTimestamp(recentDate);

      const isStale = await timestampManager.isCacheStale();
      expect(isStale).toBe(false);
    });

    it('should return true when timestamp is old', async () => {
      const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      await timestampManager.writeTimestamp(oldDate);

      const isStale = await timestampManager.isCacheStale();
      expect(isStale).toBe(true);
    });

    it('should return true when timestamp is exactly at expiration time', async () => {
      const exactExpirationDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // exactly 24 hours ago
      await timestampManager.writeTimestamp(exactExpirationDate);

      const isStale = await timestampManager.isCacheStale();
      expect(isStale).toBe(true);
    });

    it('should respect custom expiration time', async () => {
      const customManager = new TimestampManager(testCacheDir, 12, false); // 12 hour expiration, isolated cache
      const testDate = new Date(Date.now() - 18 * 60 * 60 * 1000); // 18 hours ago
      await customManager.writeTimestamp(testDate);

      const isStale = await customManager.isCacheStale();
      expect(isStale).toBe(true);
    });
  });

  describe('getCacheAgeHours', () => {
    it('should return null when no timestamp exists', async () => {
      const age = await timestampManager.getCacheAgeHours();
      expect(age).toBeNull();
    });

    it('should return correct age in hours', async () => {
      const hoursAgo = 6;
      const testDate = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
      await timestampManager.writeTimestamp(testDate);

      const age = await timestampManager.getCacheAgeHours();
      expect(age).not.toBeNull();
      expect(age!).toBeCloseTo(hoursAgo, 1); // Within 1 hour precision
    });

    it('should handle fractional hours', async () => {
      const minutesAgo = 90; // 1.5 hours
      const testDate = new Date(Date.now() - minutesAgo * 60 * 1000);
      await timestampManager.writeTimestamp(testDate);

      const age = await timestampManager.getCacheAgeHours();
      expect(age).not.toBeNull();
      expect(age!).toBeCloseTo(1.5, 0.1);
    });
  });

  describe('deleteTimestamp', () => {
    it('should delete existing timestamp file', async () => {
      await timestampManager.writeTimestamp();

      // Verify file exists
      let timestamp = await timestampManager.readTimestamp();
      expect(timestamp).not.toBeNull();

      await timestampManager.deleteTimestamp();

      // Verify file is deleted
      timestamp = await timestampManager.readTimestamp();
      expect(timestamp).toBeNull();
    });

    it('should not throw error when deleting non-existent file', async () => {
      await expect(timestampManager.deleteTimestamp()).resolves.not.toThrow();
    });
  });
});
