import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import { join, sep } from 'path';
import { tmpdir } from 'os';
import { CacheUtils } from '../CacheUtils.js';

describe('CacheUtils', () => {
  let testFiles: string[] = [];

  beforeEach(() => {
    // Reset cached path before each test
    CacheUtils.resetCachedPath();
    testFiles = [];
  });

  afterEach(async () => {
    // Clean up any test files we created
    for (const file of testFiles) {
      try {
        await fs.unlink(file);
      } catch (error) {
        // Ignore errors if file doesn't exist
      }
    }

    // Try to remove shared cache directory if empty
    try {
      const sharedCacheDir = await CacheUtils.getSharedCacheDir();
      const files = await fs.readdir(sharedCacheDir);
      if (files.length === 0) {
        await fs.rmdir(sharedCacheDir);
      }
    } catch (error) {
      // Ignore errors
    }
  });

  describe('getSharedCacheDir', () => {
    it('should return a path in the OS temp directory', async () => {
      const sharedCacheDir = await CacheUtils.getSharedCacheDir();
      const expectedBase = join(tmpdir(), 'typecad-jlcpcb-parts-cache');

      expect(sharedCacheDir).toBe(expectedBase);
    });

    it('should create the directory if it does not exist', async () => {
      // Reset cached path to ensure fresh directory creation
      CacheUtils.resetCachedPath();

      const sharedCacheDir = await CacheUtils.getSharedCacheDir();

      // Check that directory exists
      const stat = await fs.stat(sharedCacheDir);
      expect(stat.isDirectory()).toBe(true);
    });

    it('should return the same path on subsequent calls', async () => {
      const firstCall = await CacheUtils.getSharedCacheDir();
      const secondCall = await CacheUtils.getSharedCacheDir();

      expect(firstCall).toBe(secondCall);
    });
  });

  describe('resolveCacheFilePath', () => {
    it('should use shared cache directory by default', async () => {
      const fileName = 'test-file.txt';
      const resolvedPath = await CacheUtils.resolveCacheFilePath(fileName);
      const sharedCacheDir = await CacheUtils.getSharedCacheDir();

      expect(resolvedPath).toBe(join(sharedCacheDir, fileName));
    });

    it('should use custom directory when useSharedCache is false', async () => {
      const fileName = 'test-file.txt';
      const customDir = './custom-cache';

      const resolvedPath = await CacheUtils.resolveCacheFilePath(fileName, false, customDir);

      expect(resolvedPath).toBe(join(customDir, fileName));
    });

    it('should use current directory as default custom directory', async () => {
      const fileName = 'test-file.txt';

      const resolvedPath = await CacheUtils.resolveCacheFilePath(fileName, false);

      expect(resolvedPath).toBe(join('.', fileName));
    });
  });

  describe('clearSharedCache', () => {
    it('should remove all files from shared cache directory', async () => {
      const sharedCacheDir = await CacheUtils.getSharedCacheDir();

      // Create some test files
      const testFile1 = join(sharedCacheDir, 'test1.txt');
      const testFile2 = join(sharedCacheDir, 'test2.txt');

      await fs.writeFile(testFile1, 'test content 1', 'utf-8');
      await fs.writeFile(testFile2, 'test content 2', 'utf-8');

      // Add to cleanup list
      testFiles.push(testFile1, testFile2);

      // Verify files exist
      await expect(fs.access(testFile1)).resolves.toBeUndefined();
      await expect(fs.access(testFile2)).resolves.toBeUndefined();

      // Clear cache
      await CacheUtils.clearSharedCache();

      // Verify files are gone
      await expect(fs.access(testFile1)).rejects.toThrow();
      await expect(fs.access(testFile2)).rejects.toThrow();

      // Remove from cleanup list since they're already deleted
      testFiles = [];
    });

    it('should not throw error if cache directory does not exist', async () => {
      // Reset cached path to ensure directory doesn't exist
      CacheUtils.resetCachedPath();

      // Try to clear non-existent cache
      await expect(CacheUtils.clearSharedCache()).resolves.not.toThrow();
    });

    it('should handle subdirectories in cache', async () => {
      const sharedCacheDir = await CacheUtils.getSharedCacheDir();

      // Create a subdirectory with files
      const subDir = join(sharedCacheDir, 'subdir');
      const subFile = join(subDir, 'subfile.txt');

      await fs.mkdir(subDir, { recursive: true });
      await fs.writeFile(subFile, 'sub content', 'utf-8');

      // Clear cache
      await CacheUtils.clearSharedCache();

      // Verify subdirectory and file are gone
      await expect(fs.access(subDir)).rejects.toThrow();
      await expect(fs.access(subFile)).rejects.toThrow();
    });
  });

  describe('getCacheInfo', () => {
    it('should return cache information when cache exists', async () => {
      const sharedCacheDir = await CacheUtils.getSharedCacheDir();

      // Create some test files
      const testFile1 = join(sharedCacheDir, 'info-test1.txt');
      const testFile2 = join(sharedCacheDir, 'info-test2.txt');
      const testContent1 = 'test content 1';
      const testContent2 = 'test content 2';

      await fs.writeFile(testFile1, testContent1, 'utf-8');
      await fs.writeFile(testFile2, testContent2, 'utf-8');

      testFiles.push(testFile1, testFile2);

      const info = await CacheUtils.getCacheInfo();

      expect(info).not.toBeNull();
      expect(info!.path).toBe(sharedCacheDir);
      expect(info!.exists).toBe(true);
      expect(info!.fileCount).toBe(2);
      expect(info!.size).toBe(testContent1.length + testContent2.length);
    });

    it('should return null when cache operations fail', async () => {
      // Mock getSharedCacheDir to throw an error
      vi.spyOn(CacheUtils, 'getSharedCacheDir').mockRejectedValue(new Error('Mock error'));

      const info = await CacheUtils.getCacheInfo();

      expect(info).toBeNull();

      // Restore the mock
      vi.restoreAllMocks();
    });
  });

  describe('validateCacheDirectory', () => {
    it('should return true for writable directory', async () => {
      const sharedCacheDir = await CacheUtils.getSharedCacheDir();

      const isValid = await CacheUtils.validateCacheDirectory(sharedCacheDir);

      expect(isValid).toBe(true);
    });

    it('should create directory if it does not exist', async () => {
      const testDir = join(tmpdir(), 'cache-validation-test');

      // Ensure directory doesn't exist
      try {
        await fs.rmdir(testDir);
      } catch (error) {
        // Directory might not exist
      }

      const isValid = await CacheUtils.validateCacheDirectory(testDir);

      expect(isValid).toBe(true);

      // Verify directory was created
      const stat = await fs.stat(testDir);
      expect(stat.isDirectory()).toBe(true);

      // Clean up
      await fs.rmdir(testDir);
    });

    it('should return false for unwritable directory', async () => {
      // Use a path with an embedded null byte which fails on all platforms
      const unwritableDir = join(tmpdir(), 'unwritable\0test-dir');

      const isValid = await CacheUtils.validateCacheDirectory(unwritableDir);

      expect(isValid).toBe(false);
    });
  });

  describe('resetCachedPath', () => {
    it('should reset internal cached path', async () => {
      // Get shared cache dir to cache the path
      const firstDir = await CacheUtils.getSharedCacheDir();

      // Reset the cached path
      CacheUtils.resetCachedPath();

      // Get it again - this should work the same way
      const secondDir = await CacheUtils.getSharedCacheDir();

      expect(firstDir).toBe(secondDir);
    });
  });
});
