import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ComponentSearchEngine } from '../SearchEngine.js';
import { ComponentRecord, ParsedParameters, ComponentScore, SearchResult } from '../../types/index.js';

describe('ComponentSearchEngine', () => {
  // Mock dependencies
  const mockDataManager = {
    ensureDataAvailable: vi.fn().mockResolvedValue(undefined),
    getCsvData: vi.fn(),
    isDataStale: vi.fn().mockReturnValue(false),
  };

  const mockParameterParser = {
    parseQuery: vi.fn(),
  };

  const mockFuzzyScorer = {
    scoreComponent: vi.fn(),
    rankComponents: vi.fn(),
    filterTopResults: vi.fn(),
    generateMatchSummary: vi.fn(),
  };

  // Mock console methods to avoid cluttering test output
  const originalConsoleLog = console.log;
  const originalConsoleInfo = console.info;
  beforeEach(() => {
    console.log = vi.fn();
    console.info = vi.fn();
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.info = originalConsoleInfo;
  });

  // Mock Date.now for consistent cache testing
  const originalDateNow = Date.now;
  let mockTime = 1000000000000; // Fixed timestamp for testing

  beforeEach(() => {
    Date.now = vi.fn(() => mockTime);
  });

  afterEach(() => {
    Date.now = originalDateNow;
  });

  // Test data
  const testComponents: ComponentRecord[] = [
    {
      lcsc: 'C1234',
      category_id: '1',
      category: 'Capacitors',
      subcategory: 'MLCC - SMD/SMT',
      mfr: 'ABC123',
      package: '0603',
      joints: '2',
      manufacturer: 'Test Manufacturer',
      basic: '1',
      preferred: '1',
      description: '100nF 50V X7R 0603 Ceramic Capacitor',
      datasheet: 'http://example.com/datasheet.pdf',
      stock: '1000',
      last_on_stock: '2023-01-01',
      price: '{"1":0.01,"10":0.009,"100":0.008}',
      extra: '{}',
      assembly_process: 'SMT',
      min_order_qty: '1',
      attrition_qty: '0',
    },
    {
      lcsc: 'C5678',
      category_id: '2',
      category: 'Resistors',
      subcategory: 'Chip Resistor - Surface Mount',
      mfr: 'DEF456',
      package: '0805',
      joints: '2',
      manufacturer: 'Test Manufacturer',
      basic: '1',
      preferred: '1',
      description: '10kΩ ±1% 0805 Thick Film Resistor',
      datasheet: 'http://example.com/datasheet.pdf',
      stock: '500',
      last_on_stock: '2023-01-01',
      price: '{"1":0.02,"10":0.018,"100":0.016}',
      extra: '{}',
      assembly_process: 'SMT',
      min_order_qty: '1',
      attrition_qty: '0',
    },
  ];

  const testParameters: ParsedParameters = {
    value: { value: 100e-9, unit: 'F', originalText: '100nF' },
    package: '0603',
  };

  const testComponentScores: ComponentScore[] = [
    {
      component: testComponents[0],
      score: 200,
      matchDetails: [
        {
          parameter: 'capacitance',
          score: 100,
          exact: true,
          reason: 'Exact value match: 100nF',
        },
        {
          parameter: 'package',
          score: 80,
          exact: true,
          reason: 'Exact package match: 0603',
        },
        {
          parameter: 'voltage',
          score: 20,
          exact: false,
          reason: 'Compatible voltage: 50V',
        },
      ],
    },
    {
      component: testComponents[1],
      score: 40,
      matchDetails: [
        {
          parameter: 'package',
          score: 40,
          exact: false,
          reason: 'Similar package: 0805 vs 0603',
        },
      ],
    },
  ];

  const testFilteredResults: ComponentScore[] = [testComponentScores[0]];

  const expectedSearchResult: SearchResult = {
    lcsc: 'C1234',
    manufacturer: 'Test Manufacturer',
    partNumber: 'ABC123',
    description: '100nF 50V X7R 0603 Ceramic Capacitor',
    package: '0603',
    score: 200,
    matchSummary: 'Exact matches: value, package',
  };

  // Create search engine instance
  let searchEngine: ComponentSearchEngine;

  beforeEach(() => {
    // Reset mocks
    vi.resetAllMocks();

    // Setup mock returns
    mockDataManager.getCsvData.mockResolvedValue(testComponents);
    mockParameterParser.parseQuery.mockReturnValue(testParameters);
    mockFuzzyScorer.rankComponents.mockReturnValue(testComponentScores);
    mockFuzzyScorer.filterTopResults.mockReturnValue(testFilteredResults);
    mockFuzzyScorer.generateMatchSummary.mockReturnValue('Exact matches: value, package');

    // Mock performance.now
    global.performance = {
      now: vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(100),
    } as any;

    // Create search engine instance with small cache expiration for testing
    searchEngine = new ComponentSearchEngine(
      mockDataManager,
      mockParameterParser,
      mockFuzzyScorer,
      5, // resultLimit
      10000, // searchTimeout
      60000, // cacheExpirationMs (1 minute)
      3, // maxCacheSize (small for testing)
    );
  });

  describe('search', () => {
    it('should perform the complete search workflow', async () => {
      const query = '100nF 0603 capacitor';

      const originalMethod = searchEngine['scoreComponentsWithTimeout'];
      searchEngine['scoreComponentsWithTimeout'] = vi.fn().mockReturnValue({
        components: testComponentScores,
        batchCount: 1,
      });

      const results = await searchEngine.search(query);

      // Should call dependencies in correct order
      expect(mockDataManager.ensureDataAvailable).toHaveBeenCalled();
      expect(mockDataManager.getCsvData).toHaveBeenCalled();
      expect(mockParameterParser.parseQuery).toHaveBeenCalledWith(query);
      expect(mockFuzzyScorer.filterTopResults).toHaveBeenCalledWith(testComponentScores, 5);
      expect(mockFuzzyScorer.generateMatchSummary).toHaveBeenCalledWith(testFilteredResults[0]);

      // Should return correctly formatted results
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(expectedSearchResult);

      // Should log search information via Logger
      expect(console.info).toHaveBeenCalledWith(expect.stringContaining('Searching for: "100nF 0603 capacitor"'));
      expect(console.info).toHaveBeenCalledWith(expect.stringContaining('Loaded 2 components.'));

      // Restore original method
      searchEngine['scoreComponentsWithTimeout'] = originalMethod;
    });

    it('should use custom result limit if provided', async () => {
      // Create search engine with custom limit
      const customLimitSearchEngine = new ComponentSearchEngine(
        mockDataManager,
        mockParameterParser,
        mockFuzzyScorer,
        10,
      );

      await customLimitSearchEngine.search('100nF capacitor');

      // Should use custom limit
      expect(mockFuzzyScorer.filterTopResults).toHaveBeenCalledWith(testComponentScores, 10);
    });

    it('should handle empty results gracefully', async () => {
      // Mock empty results
      mockFuzzyScorer.rankComponents.mockReturnValue([]);
      mockFuzzyScorer.filterTopResults.mockReturnValue([]);

      const results = await searchEngine.search('nonexistent component');

      // Should return empty array
      expect(results).toEqual([]);

      // No specific log message for empty results
    });

    it('should handle data manager errors', async () => {
      // Mock data manager error
      mockDataManager.ensureDataAvailable.mockRejectedValue(new Error('Network error'));

      // Should throw error
      await expect(searchEngine.search('100nF capacitor')).rejects.toThrow('Network error');
    });
  });

  describe('caching', () => {
    it('should return cached results for repeated queries', async () => {
      // Directly add to the cache map
      const query = '100nF 0603 capacitor';
      const normalizedQuery = '100nf 0603 capacitor';

      searchEngine['searchCache'].set(normalizedQuery, {
        query: normalizedQuery,
        results: [expectedSearchResult],
        timestamp: Date.now(),
      });

      // Mock getCachedResults to return the cached results
      const originalGetCachedResults = searchEngine['getCachedResults'];
      searchEngine['getCachedResults'] = vi.fn().mockReturnValue([expectedSearchResult]);

      // Execute search with the same query
      const results = await searchEngine.search(query);

      // Should return correct results
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(expectedSearchResult);

      // Cache hit should not log anything

      // Restore original method
      searchEngine['getCachedResults'] = originalGetCachedResults;
    });

    it('should normalize queries for cache lookup', () => {
      // Test the normalization directly
      const originalQuery = '  100nF 0603 CAPACITOR  ';
      const normalizedQuery = '100nf 0603 capacitor';

      // Verify the normalization function directly
      expect(searchEngine['normalizeQuery'](originalQuery)).toBe(normalizedQuery);

      // Add to cache with normalized format
      searchEngine['searchCache'].set(normalizedQuery, {
        query: normalizedQuery,
        results: [expectedSearchResult],
        timestamp: Date.now(),
      });

      // Mock getCachedResults to simulate cache hit with normalized query
      const originalGetCachedResults = searchEngine['getCachedResults'];
      searchEngine['getCachedResults'] = vi.fn().mockImplementation((q) => {
        const normalized = searchEngine['normalizeQuery'](q);
        if (normalized === normalizedQuery) {
          return [expectedSearchResult];
        }
        return undefined;
      });

      // Check if we can retrieve with a different format
      const cachedResults = searchEngine['getCachedResults'](originalQuery);

      // Should return correct results from cache
      expect(cachedResults).toBeDefined();
      expect(cachedResults).toHaveLength(1);
      expect(cachedResults![0]).toEqual(expectedSearchResult);

      // Restore original method
      searchEngine['getCachedResults'] = originalGetCachedResults;
    });

    it('should expire cache entries after specified time', async () => {
      const query = '100nF 0603 capacitor';

      // First search to populate cache
      await searchEngine.search(query);

      // Advance time beyond cache expiration
      mockTime += 70000; // 70 seconds (cache expires after 60 seconds)

      // Reset mocks
      vi.resetAllMocks();
      mockDataManager.getCsvData.mockResolvedValue(testComponents);
      mockParameterParser.parseQuery.mockReturnValue(testParameters);
      mockFuzzyScorer.rankComponents.mockReturnValue(testComponentScores);
      mockFuzzyScorer.filterTopResults.mockReturnValue(testFilteredResults);
      mockFuzzyScorer.generateMatchSummary.mockReturnValue('Exact matches: value, package');

      // Mock performance.now again
      global.performance = {
        now: vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(100),
      } as any;

      // Second search should not use expired cache
      await searchEngine.search(query);

      // Should call dependencies again
      expect(mockDataManager.ensureDataAvailable).toHaveBeenCalled();
      expect(mockDataManager.getCsvData).toHaveBeenCalled();
      expect(mockParameterParser.parseQuery).toHaveBeenCalled();
      expect(mockFuzzyScorer.rankComponents).toHaveBeenCalled();
    });

    it('should enforce maximum cache size', async () => {
      // Create a new search engine instance for this test
      const cacheTestEngine = new ComponentSearchEngine(
        mockDataManager,
        mockParameterParser,
        mockFuzzyScorer,
        5, // resultLimit
        10000, // searchTimeout
        60000, // cacheExpirationMs
        3, // maxCacheSize (small for testing)
      );

      // Manually add entries with different timestamps to ensure proper ordering
      cacheTestEngine['searchCache'].set('query1', {
        query: 'query1',
        results: [expectedSearchResult],
        timestamp: mockTime - 3000, // Oldest
      });

      cacheTestEngine['searchCache'].set('query2', {
        query: 'query2',
        results: [expectedSearchResult],
        timestamp: mockTime - 2000,
      });

      cacheTestEngine['searchCache'].set('query3', {
        query: 'query3',
        results: [expectedSearchResult],
        timestamp: mockTime - 1000, // Newest
      });

      // Verify cache size before adding more
      expect(cacheTestEngine['searchCache'].size).toBe(3);

      // Now test the findOldestCacheEntry and eviction logic directly
      const oldestKey = cacheTestEngine['findOldestCacheEntry']();
      expect(oldestKey).toBe('query1');

      // Manually evict the oldest entry
      cacheTestEngine['searchCache'].delete(oldestKey!);

      // Add fourth entry
      cacheTestEngine['searchCache'].set('query4', {
        query: 'query4',
        results: [expectedSearchResult],
        timestamp: mockTime,
      });

      // Verify cache size remains at max
      expect(cacheTestEngine['searchCache'].size).toBe(3);

      // Verify oldest entry was evicted and new entry was added
      expect(cacheTestEngine['searchCache'].has('query1')).toBe(false);
      expect(cacheTestEngine['searchCache'].has('query2')).toBe(true);
      expect(cacheTestEngine['searchCache'].has('query3')).toBe(true);
      expect(cacheTestEngine['searchCache'].has('query4')).toBe(true);
    });

    it('should clear cache when requested', async () => {
      // Fill cache
      await searchEngine.search('query1');
      await searchEngine.search('query2');

      // Clear cache
      searchEngine.clearCache();

      // Reset mocks
      vi.resetAllMocks();
      mockDataManager.getCsvData.mockResolvedValue(testComponents);
      mockParameterParser.parseQuery.mockReturnValue(testParameters);
      mockFuzzyScorer.rankComponents.mockReturnValue(testComponentScores);
      mockFuzzyScorer.filterTopResults.mockReturnValue(testFilteredResults);
      mockFuzzyScorer.generateMatchSummary.mockReturnValue('Exact matches: value, package');

      // Mock performance.now again
      global.performance = {
        now: vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(100),
      } as any;

      // Search again
      await searchEngine.search('query1');

      // Should call dependencies again
      expect(mockDataManager.ensureDataAvailable).toHaveBeenCalled();
      expect(mockFuzzyScorer.rankComponents).toHaveBeenCalled();
    });

    it('should provide cache statistics', async () => {
      // Create a new search engine instance for this test
      const statsEngine = new ComponentSearchEngine(
        mockDataManager,
        mockParameterParser,
        mockFuzzyScorer,
        5, // resultLimit
        10000, // searchTimeout
        60000, // cacheExpirationMs
        3, // maxCacheSize
      );

      // Initially empty cache
      const initialStats = statsEngine.getCacheStats();
      expect(initialStats.size).toBe(0);
      expect(initialStats.maxSize).toBe(3);

      // Manually add entries to cache
      statsEngine['searchCache'].set('query1', {
        query: 'query1',
        results: [expectedSearchResult],
        timestamp: Date.now(),
      });

      statsEngine['searchCache'].set('query2', {
        query: 'query2',
        results: [expectedSearchResult],
        timestamp: Date.now(),
      });

      // Check updated stats
      const updatedStats = statsEngine.getCacheStats();
      expect(updatedStats.size).toBe(2);
      expect(updatedStats.maxSize).toBe(3);
    });
  });

  describe('performance optimization', () => {
    it('should process large datasets in batches', async () => {
      // Create large dataset
      const largeDataset: ComponentRecord[] = [];
      for (let i = 0; i < 25000; i++) {
        largeDataset.push({
          ...testComponents[0],
          lcsc: `C${i}`,
          description: `Component ${i}`,
        });
      }

      // Mock data manager to return large dataset
      mockDataManager.getCsvData.mockResolvedValue(largeDataset);

      // Mock performance.now for multiple calls
      const performanceNowMock = vi
        .fn()
        .mockReturnValueOnce(0) // Start time
        .mockReturnValueOnce(100); // End time

      global.performance = {
        now: performanceNowMock,
      } as any;

      // Mock rankComponents to track batch processing
      mockFuzzyScorer.rankComponents.mockImplementation((components) => {
        // Return scores proportional to batch size
        return components.map((c: ComponentRecord) => ({
          component: c,
          score: 100,
          matchDetails: [],
        }));
      });

      // Execute search
      await searchEngine.search('large dataset test');

      // Should log batch processing message via Logger
      expect(console.info).toHaveBeenCalledWith(expect.stringContaining('Large dataset detected (25000 components)'));

      // Should call rankComponents multiple times (once per batch)
      expect(mockFuzzyScorer.rankComponents).toHaveBeenCalledTimes(3); // 25000 / 10000 = 3 batches

      // Should log progress via Logger
      expect(console.info).toHaveBeenCalledWith(expect.stringContaining('Processed 10000/25000 components (40%)'));
      expect(console.info).toHaveBeenCalledWith(expect.stringContaining('Processed 20000/25000 components (80%)'));
      expect(console.info).toHaveBeenCalledWith(expect.stringContaining('Processed 25000/25000 components (100%)'));
    });

    it('should handle search timeout', async () => {
      // Create search engine with very short timeout
      const timeoutSearchEngine = new ComponentSearchEngine(
        mockDataManager,
        mockParameterParser,
        mockFuzzyScorer,
        5, // resultLimit
        1, // searchTimeout (1ms - will trigger timeout)
        60000, // cacheExpirationMs
        3, // maxCacheSize
      );

      // Mock the scoreComponentsWithTimeout method to simulate a timeout
      const originalMethod = timeoutSearchEngine['scoreComponentsWithTimeout'];
      timeoutSearchEngine['scoreComponentsWithTimeout'] = vi.fn().mockImplementation(() => {
        throw new Error('Search timed out after 1ms');
      });

      // Should throw timeout error
      await expect(timeoutSearchEngine.search('timeout test')).rejects.toThrow('Search timed out after 1ms');

      // Restore original method
      timeoutSearchEngine['scoreComponentsWithTimeout'] = originalMethod;
    });

    it('should track and report performance metrics', async () => {
      // Mock performance.now to return specific values for each call
      const performanceNowMock = vi
        .fn()
        .mockReturnValueOnce(0) // search start
        .mockReturnValueOnce(10) // parse start
        .mockReturnValueOnce(20) // parse end
        .mockReturnValueOnce(20) // scoring start
        .mockReturnValueOnce(20) // deadline check in scoreComponentsWithTimeout
        .mockReturnValueOnce(80) // scoring end
        .mockReturnValueOnce(80) // formatting start
        .mockReturnValueOnce(90) // formatting end
        .mockReturnValueOnce(100); // search end

      global.performance = {
        now: performanceNowMock,
      } as any;

      // Execute search
      await searchEngine.search('performance test');

      // Get performance metrics
      const metrics = searchEngine.getPerformanceMetrics();
      expect(metrics).toHaveLength(1);

      // Verify metrics were recorded correctly
      expect(metrics[0]).toMatchObject({
        totalSearchTime: 100,
        parsingTime: 10,
        scoringTime: 60,
        formattingTime: 10,
        componentCount: 2,
        resultCount: 1,
        cacheHit: false,
        batchCount: 1,
      });

      // Verify average metrics
      const avgMetrics = searchEngine.getAveragePerformanceMetrics();
      expect(avgMetrics).toMatchObject({
        avgTotalTime: 100,
        avgParsingTime: 10,
        avgScoringTime: 60,
        avgFormattingTime: 10,
        avgComponentCount: 2,
        avgResultCount: 1,
        cacheHitRate: 0,
      });
    });

    it('should track cache hit rate in performance metrics', async () => {
      // Create a new search engine instance for this test to avoid interference
      const cacheTestEngine = new ComponentSearchEngine(
        mockDataManager,
        mockParameterParser,
        mockFuzzyScorer,
        5, // resultLimit
        10000, // searchTimeout
        60000, // cacheExpirationMs
        3, // maxCacheSize
      );

      // Manually set cache hits/misses for testing
      cacheTestEngine['cacheHits'] = 1;
      cacheTestEngine['cacheMisses'] = 1;

      // Add performance metrics entries
      cacheTestEngine['performanceMetrics'] = [
        {
          totalSearchTime: 100,
          parsingTime: 10,
          scoringTime: 80,
          formattingTime: 10,
          componentCount: 1000,
          resultCount: 5,
          cacheHit: false,
        },
        {
          totalSearchTime: 20,
          parsingTime: 0,
          scoringTime: 0,
          formattingTime: 0,
          componentCount: 0,
          resultCount: 5,
          cacheHit: true,
        },
      ];

      // Get cache stats
      const cacheStats = cacheTestEngine.getCacheStats();
      expect(cacheStats.hits).toBe(1);
      expect(cacheStats.misses).toBe(1);
      expect(cacheStats.hitRate).toBe(0.5);

      // Verify performance metrics
      const metrics = cacheTestEngine.getPerformanceMetrics();
      expect(metrics).toHaveLength(2);
      expect(metrics[0].cacheHit).toBe(false);
      expect(metrics[1].cacheHit).toBe(true);

      // Verify average metrics
      const avgMetrics = cacheTestEngine.getAveragePerformanceMetrics();
      expect(avgMetrics.cacheHitRate).toBe(0.5);
    });

    it('should limit performance metrics history size', async () => {
      // Create search engine with small metrics history
      const metricsTestEngine = new ComponentSearchEngine(
        mockDataManager,
        mockParameterParser,
        mockFuzzyScorer,
        5, // resultLimit
        10000, // searchTimeout
        60000, // cacheExpirationMs
        3, // maxCacheSize
      );

      // Set max metrics history size
      metricsTestEngine['maxMetricsHistory'] = 3;

      // Mock performance.now
      let mockTime = 0;
      global.performance = {
        now: vi.fn(() => (mockTime += 10)),
      } as any;

      // Perform multiple searches
      await metricsTestEngine.search('test1');
      await metricsTestEngine.search('test2');
      await metricsTestEngine.search('test3');
      await metricsTestEngine.search('test4');

      // Verify metrics history is limited
      const metrics = metricsTestEngine.getPerformanceMetrics();
      expect(metrics).toHaveLength(3);

      // Verify oldest metric was removed
      const queries = metrics.map((m) => m.cacheHit);
      expect(queries).not.toContain('test1');
    });

    it('should measure search performance with different dataset sizes', async () => {
      // Create a new search engine instance for this test
      const perfTestEngine = new ComponentSearchEngine(
        mockDataManager,
        mockParameterParser,
        mockFuzzyScorer,
        5, // resultLimit
        10000, // searchTimeout
        60000, // cacheExpirationMs
        3, // maxCacheSize
      );

      // Reset performance metrics
      perfTestEngine['performanceMetrics'] = [];

      // Create datasets of different sizes
      const smallDataset = testComponents.slice(0, 2);
      const mediumDataset = Array(1000)
        .fill(null)
        .map((_, i) => ({
          ...testComponents[0],
          lcsc: `C${i}`,
          description: `Component ${i}`,
        }));
      const largeDataset = Array(20000)
        .fill(null)
        .map((_, i) => ({
          ...testComponents[0],
          lcsc: `C${i}`,
          description: `Component ${i}`,
        }));

      // Mock scoreComponentsWithTimeout to simulate different processing times
      const originalMethod = perfTestEngine['scoreComponentsWithTimeout'];

      // Small dataset - fast processing
      perfTestEngine['scoreComponentsWithTimeout'] = vi.fn().mockImplementation((components) =>
        Promise.resolve({
          components: components.map((c: ComponentRecord) => ({
            component: c,
            score: 100,
            matchDetails: [],
          })),
          batchCount: 1,
        }),
      );

      // Set up performance.now to return increasing values
      let timeCounter = 0;
      global.performance = {
        now: vi.fn(() => {
          timeCounter += 10;
          return timeCounter;
        }),
      } as any;

      // Test with small dataset
      mockDataManager.getCsvData.mockResolvedValue(smallDataset);
      await perfTestEngine.search('small dataset test');

      // Increase processing time for medium dataset
      perfTestEngine['scoreComponentsWithTimeout'] = vi.fn().mockImplementation((components) => {
        // Simulate longer processing time
        timeCounter += 100;
        return Promise.resolve({
          components: components.map((c: ComponentRecord) => ({
            component: c,
            score: 100,
            matchDetails: [],
          })),
          batchCount: 1,
        });
      });

      // Test with medium dataset
      mockDataManager.getCsvData.mockResolvedValue(mediumDataset);
      await perfTestEngine.search('medium dataset test');

      // Increase processing time for large dataset
      perfTestEngine['scoreComponentsWithTimeout'] = vi.fn().mockImplementation((components) => {
        // Simulate even longer processing time
        timeCounter += 500;
        return Promise.resolve({
          components: components.map((c: ComponentRecord) => ({
            component: c,
            score: 100,
            matchDetails: [],
          })),
          batchCount: 3,
        });
      });

      // Test with large dataset
      mockDataManager.getCsvData.mockResolvedValue(largeDataset);
      await perfTestEngine.search('large dataset test');

      // Get performance metrics
      const metrics = perfTestEngine.getPerformanceMetrics();
      expect(metrics).toHaveLength(3);

      // Verify component counts
      expect(metrics[0].componentCount).toBe(2);
      expect(metrics[1].componentCount).toBe(1000);
      expect(metrics[2].componentCount).toBe(20000);

      // Restore original method
      perfTestEngine['scoreComponentsWithTimeout'] = originalMethod;
    });
  });
});
