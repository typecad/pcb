import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import { join, basename } from 'path';
import { DataManager } from '../DataManager.js';
import { TimestampManager } from '../TimestampManager.js';
import { CsvDownloader } from '../CsvDownloader.js';
import { CsvParser } from '../CsvParser.js';
import { ComponentRecord } from '../../types/index.js';

// Mock dependencies
vi.mock('../TimestampManager.js');
vi.mock('../CsvDownloader.js');
vi.mock('../CsvParser.js');

describe('DataManager', () => {
  const testCsvUrl = 'https://example.com/test.csv';
  const testCsvPath = './test-components.csv';
  const testCacheDir = './test-cache-datamanager';
  const testTimestampFile = join(testCacheDir, '.jlcpcb-cache-timestamp');

  let dataManager: DataManager;
  let mockTimestampManager: any;
  let mockCsvDownloader: any;
  let mockCsvParser: any;

  // Sample component data
  const sampleComponents: ComponentRecord[] = [
    {
      lcsc: 'C1234',
      category_id: '123',
      category: 'Capacitors',
      subcategory: 'MLCC',
      mfr: 'ABC123',
      package: '0402',
      joints: '2',
      manufacturer: 'Vendor Inc',
      basic: '1',
      preferred: '0',
      description: '10nF 50V X7R',
      datasheet: 'http://example.com/datasheet.pdf',
      stock: '1000',
      last_on_stock: '1234567890',
      price: '[{"price":0.01}]',
      extra: '{}',
      assembly_process: 'SMT',
      min_order_qty: '10',
      attrition_qty: '0',
    },
    {
      lcsc: 'C5678',
      category_id: '456',
      category: 'Resistors',
      subcategory: 'SMD',
      mfr: 'XYZ789',
      package: '0603',
      joints: '2',
      manufacturer: 'Resistor Co',
      basic: '0',
      preferred: '1',
      description: '10K 1%',
      datasheet: 'http://example.com/datasheet2.pdf',
      stock: '2000',
      last_on_stock: '1234567891',
      price: '[{"price":0.02}]',
      extra: '{}',
      assembly_process: 'SMT',
      min_order_qty: '10',
      attrition_qty: '0',
    },
  ];

  beforeEach(() => {
    // Create test directory
    try {
      fs.mkdir(testCacheDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }

    // Reset mocks
    vi.resetAllMocks();

    // Setup mock implementations
    mockTimestampManager = {
      isCacheStale: vi.fn(),
      writeTimestamp: vi.fn(),
      getCacheAgeHours: vi.fn(),
    };

    mockCsvDownloader = {
      downloadCsv: vi.fn(),
    };

    mockCsvParser = {
      parseFile: vi.fn(),
    };

    // Mock the constructors
    (TimestampManager as any).mockImplementation(function () {
      return mockTimestampManager;
    });
    (CsvDownloader as any).mockImplementation(function () {
      return mockCsvDownloader;
    });
    (CsvParser as any).mockImplementation(function () {
      return mockCsvParser;
    });

    // Create DataManager instance with isolated cache
    dataManager = new DataManager(
      testCsvUrl,
      basename(testCsvPath), // Use just the filename
      testCacheDir,
      24,
      false, // Disable shared cache for tests
    );

    // Mock console methods
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    // Clean up test files
    try {
      await fs.unlink(testCsvPath);
    } catch (error) {
      // File might not exist
    }

    try {
      await fs.unlink(testTimestampFile);
    } catch (error) {
      // File might not exist
    }

    // Clean up resolved cache files
    const resolvedCsvPath = join(testCacheDir, basename(testCsvPath));
    try {
      await fs.unlink(resolvedCsvPath);
    } catch (error) {
      // File might not exist
    }

    try {
      const files = await fs.readdir(testCacheDir);
      for (const file of files) {
        await fs.unlink(join(testCacheDir, file));
      }
      await fs.rmdir(testCacheDir);
    } catch (error) {
      // Directory might not be empty or not exist
    }

    // Restore console methods
    vi.restoreAllMocks();
  });

  describe('ensureDataAvailable', () => {
    it('should download data when cache is stale', async () => {
      // Setup mocks
      mockTimestampManager.isCacheStale.mockResolvedValue(true);
      mockCsvDownloader.downloadCsv.mockResolvedValue(undefined);
      mockTimestampManager.writeTimestamp.mockResolvedValue(undefined);

      await dataManager.ensureDataAvailable();

      // Verify download was called
      expect(mockCsvDownloader.downloadCsv).toHaveBeenCalledWith(testCsvUrl, basename(testCsvPath));
      expect(mockTimestampManager.writeTimestamp).toHaveBeenCalled();
    });

    it('should not download data when cache is fresh', async () => {
      // Setup mocks
      mockTimestampManager.isCacheStale.mockResolvedValue(false);
      mockTimestampManager.getCacheAgeHours.mockResolvedValue(12);

      await dataManager.ensureDataAvailable();

      // Verify download was not called
      expect(mockCsvDownloader.downloadCsv).not.toHaveBeenCalled();
      expect(mockTimestampManager.writeTimestamp).not.toHaveBeenCalled();
    });

    it('should use existing local file if download fails', async () => {
      // Setup mocks
      mockTimestampManager.isCacheStale.mockResolvedValue(true);
      mockCsvDownloader.downloadCsv.mockRejectedValue(new Error('Download failed'));

      // Create a dummy local file at the resolved cache path
      const resolvedCsvPath = join(testCacheDir, basename(testCsvPath));
      await fs.mkdir(testCacheDir, { recursive: true });
      await fs.writeFile(resolvedCsvPath, 'dummy content', 'utf-8');

      await dataManager.ensureDataAvailable();

      // Verify download was attempted
      expect(mockCsvDownloader.downloadCsv).toHaveBeenCalled();
      // Timestamp should not be updated since download failed
      expect(mockTimestampManager.writeTimestamp).not.toHaveBeenCalled();
    });

    it('should throw error if download fails and no local file exists', async () => {
      // Setup mocks
      mockTimestampManager.isCacheStale.mockResolvedValue(true);
      mockCsvDownloader.downloadCsv.mockRejectedValue(new Error('Download failed'));

      // Ensure local file doesn't exist
      try {
        await fs.unlink(testCsvPath);
      } catch (error) {
        // File might not exist
      }

      await expect(dataManager.ensureDataAvailable()).rejects.toThrow(/Failed to download component data/);
    });
  });

  describe('getCsvData', () => {
    it('should parse CSV file and return components', async () => {
      // Setup mocks
      mockTimestampManager.isCacheStale.mockResolvedValue(false);
      mockTimestampManager.getCacheAgeHours.mockResolvedValue(12);
      mockCsvParser.parseFile.mockResolvedValue(sampleComponents);

      const components = await dataManager.getCsvData();

      // Verify parser was called with resolved cache path
      expect(mockCsvParser.parseFile).toHaveBeenCalledWith(join(testCacheDir, basename(testCsvPath)));
      expect(components).toEqual(sampleComponents);
      expect(components).toHaveLength(2);
    });

    it('should return cached components on subsequent calls', async () => {
      // Setup mocks
      mockTimestampManager.isCacheStale.mockResolvedValue(false);
      mockTimestampManager.getCacheAgeHours.mockResolvedValue(12);
      mockCsvParser.parseFile.mockResolvedValue(sampleComponents);

      // First call should parse the file
      const components1 = await dataManager.getCsvData();
      expect(mockCsvParser.parseFile).toHaveBeenCalledTimes(1);

      // Reset mock to verify it's not called again
      mockCsvParser.parseFile.mockClear();

      // Second call should use cached data
      const components2 = await dataManager.getCsvData();
      expect(mockCsvParser.parseFile).not.toHaveBeenCalled();
      expect(components2).toBe(components1); // Same instance
    });

    it('should download and parse if cache is stale', async () => {
      // Setup mocks
      mockTimestampManager.isCacheStale.mockResolvedValue(true);
      mockCsvDownloader.downloadCsv.mockResolvedValue(undefined);
      mockTimestampManager.writeTimestamp.mockResolvedValue(undefined);
      mockCsvParser.parseFile.mockResolvedValue(sampleComponents);

      const components = await dataManager.getCsvData();

      // Verify download and parse were called
      expect(mockCsvDownloader.downloadCsv).toHaveBeenCalled();
      expect(mockTimestampManager.writeTimestamp).toHaveBeenCalled();
      expect(mockCsvParser.parseFile).toHaveBeenCalled();
      expect(components).toEqual(sampleComponents);
    });

    it('should throw error if parsing fails', async () => {
      // Setup mocks
      mockTimestampManager.isCacheStale.mockResolvedValue(false);
      mockTimestampManager.getCacheAgeHours.mockResolvedValue(12);
      mockCsvParser.parseFile.mockRejectedValue(new Error('Parsing failed'));

      await expect(dataManager.getCsvData()).rejects.toThrow(/Failed to parse component data/);
    });
  });

  describe('isDataStale', () => {
    it('should return true when cache is stale', async () => {
      mockTimestampManager.isCacheStale.mockResolvedValue(true);

      const isStale = await dataManager.isDataStale();

      expect(isStale).toBe(true);
      expect(mockTimestampManager.isCacheStale).toHaveBeenCalled();
    });

    it('should return false when cache is fresh', async () => {
      mockTimestampManager.isCacheStale.mockResolvedValue(false);

      const isStale = await dataManager.isDataStale();

      expect(isStale).toBe(false);
      expect(mockTimestampManager.isCacheStale).toHaveBeenCalled();
    });
  });
});
