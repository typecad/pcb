import { SearchEngine } from '../interfaces/SearchEngine.js';
import { FuzzyScorer } from '../interfaces/FuzzyScorer.js';
import { DataManager } from '../interfaces/DataManager.js';
import { ParameterParser } from '../interfaces/ParameterParser.js';
import { ComponentRecord, ComponentScore, ParsedParameters, SearchResult } from '../types/index.js';
import { Logger } from '../cli/Logger.js';

/**
 * Cache entry for storing search results with timestamp for expiration.
 * @internal
 */
interface SearchCacheEntry {
  /** Normalized search query used as cache key */
  query: string;
  /** Cached search results */
  results: SearchResult[];
  /** Timestamp when this entry was created */
  timestamp: number;
}

/**
 * Performance metrics collected during search operations for monitoring and optimization.
 * @internal
 */
interface SearchPerformanceMetrics {
  /** Total time for complete search operation in milliseconds */
  totalSearchTime: number;
  /** Time spent parsing the query in milliseconds */
  parsingTime: number;
  /** Time spent scoring components in milliseconds */
  scoringTime: number;
  /** Time spent formatting results in milliseconds */
  formattingTime: number;
  /** Number of components evaluated */
  componentCount: number;
  /** Number of results returned */
  resultCount: number;
  /** Whether this search was served from cache */
  cacheHit: boolean;
  /** Number of batches processed (for large datasets) */
  batchCount?: number;
}

/**
 * Main implementation of the SearchEngine interface that orchestrates the complete search workflow.
 *
 * The ComponentSearchEngine coordinates between data management, parameter parsing, and fuzzy scoring
 * to provide intelligent component search capabilities. It includes performance optimizations like
 * result caching, batch processing for large datasets, and comprehensive error handling.
 *
 * Key features:
 * - Intelligent result caching with configurable expiration
 * - Performance monitoring and metrics collection
 * - Batch processing for large component databases
 * - Comprehensive error handling and recovery
 * - Search timeout protection
 *
 * @class ComponentSearchEngine
 * @implements {SearchEngine}
 * @example
 * ```typescript
 * // Create search engine with dependencies
 * const dataManager = new DataManager();
 * const parser = new ElectricalParameterParser();
 * const scorer = new ComponentFuzzyScorer();
 *
 * const searchEngine = new ComponentSearchEngine(dataManager, parser, scorer, {
 *   resultLimit: 10,
 *   searchTimeout: 30000,
 *   cacheExpiration: 300000 // 5 minutes
 * });
 *
 * // Perform searches
 * const results = await searchEngine.search("10k resistor 0603");
 * console.log(`Found ${results.length} components`);
 *
 * // Get performance metrics
 * const metrics = searchEngine.getPerformanceMetrics();
 * console.log(`Average search time: ${metrics.averageSearchTime}ms`);
 * ```
 */
export class ComponentSearchEngine implements SearchEngine {
  private readonly dataManager: DataManager;
  private readonly parameterParser: ParameterParser;
  private readonly fuzzyScorer: FuzzyScorer;
  private readonly resultLimit: number;
  private readonly searchTimeout: number;
  private readonly cacheExpirationMs: number;
  private readonly searchCache: Map<string, SearchCacheEntry>;
  private readonly maxCacheSize: number;

  // Performance metrics tracking
  private performanceMetrics: SearchPerformanceMetrics[] = [];
  private readonly maxMetricsHistory: number = 20;
  private cacheHits: number = 0;
  private cacheMisses: number = 0;
  private readonly logger: Logger;

  /**
   * Creates a new ComponentSearchEngine
   * @param dataManager - Data manager for accessing component data
   * @param parameterParser - Parser for extracting parameters from queries
   * @param fuzzyScorer - Scorer for ranking components
   * @param resultLimit - Maximum number of results to return (default: 5)
   * @param searchTimeout - Maximum time in ms to spend on search (default: 10000)
   * @param cacheExpirationMs - Time in ms before cache entries expire (default: 3600000 = 1 hour)
   * @param maxCacheSize - Maximum number of queries to cache (default: 100)
   */
  constructor(
    dataManager: DataManager,
    parameterParser: ParameterParser,
    fuzzyScorer: FuzzyScorer,
    resultLimit: number = 5,
    searchTimeout: number = 10000,
    cacheExpirationMs: number = 3600000,
    maxCacheSize: number = 100,
  ) {
    this.dataManager = dataManager;
    this.parameterParser = parameterParser;
    this.fuzzyScorer = fuzzyScorer;
    this.resultLimit = resultLimit;
    this.searchTimeout = searchTimeout;
    this.cacheExpirationMs = cacheExpirationMs;
    this.searchCache = new Map<string, SearchCacheEntry>();
    this.maxCacheSize = maxCacheSize;
    this.logger = Logger.getInstance();
  }

  /**
   * Performs a complete search operation from query to ranked results
   * @param query - Natural language search query
   * @returns Array of top matching components formatted for display
   */
  public async search(query: string): Promise<SearchResult[]> {
    this.logger.info(`Searching for: "${query}"`);
    const searchStartTime = performance.now();

    // Initialize performance metrics
    const metrics: SearchPerformanceMetrics = {
      totalSearchTime: 0,
      parsingTime: 0,
      scoringTime: 0,
      formattingTime: 0,
      componentCount: 0,
      resultCount: 0,
      cacheHit: false,
    };

    // Check cache first
    const cachedResults = this.getCachedResults(query);
    if (cachedResults) {
      // Record cache hit metrics
      const searchEndTime = performance.now();
      metrics.totalSearchTime = searchEndTime - searchStartTime;
      metrics.cacheHit = true;
      metrics.resultCount = cachedResults.length;
      this.recordPerformanceMetrics(metrics);

      return cachedResults;
    }

    try {
      // Ensure data is available
      await this.dataManager.ensureDataAvailable();

      // Get component data
      const components = await this.dataManager.getCsvData();
      metrics.componentCount = components.length;
      this.logger.info(`Loaded ${components.length} components.`);

      // Parse query parameters
      const parseStartTime = performance.now();
      const parameters = this.parameterParser.parseQuery(query);
      metrics.parsingTime = performance.now() - parseStartTime;
      this.logger.debug('Parsed parameters:', JSON.stringify(parameters));

      // Score and rank components with timeout protection
      const scoringStartTime = performance.now();

      let rankedComponents: ComponentScore[];
      let batchCount = 0;
      try {
        const scoringResult = this.scoreComponentsWithTimeout(components, parameters);
        rankedComponents = scoringResult.components;
        batchCount = scoringResult.batchCount;
      } catch (error) {
        if (error instanceof Error && error.message.includes('timed out')) {
          this.logger.error(error.message);
          throw error;
        }
        this.logger.error('Error during scoring:', error);
        rankedComponents = [];
      }

      metrics.scoringTime = performance.now() - scoringStartTime;
      metrics.batchCount = batchCount;

      // Filter to top results
      const topResults = this.fuzzyScorer.filterTopResults(rankedComponents, this.resultLimit);

      // Format results for display
      const formattingStartTime = performance.now();
      const formattedResults = this.formatResults(topResults);
      metrics.formattingTime = performance.now() - formattingStartTime;
      metrics.resultCount = formattedResults.length;

      // Log search summary (removed top match display - will be shown at end by CLI)

      // Cache the results
      this.cacheResults(query, formattedResults);

      // Record total search time
      const searchEndTime = performance.now();
      metrics.totalSearchTime = searchEndTime - searchStartTime;
      this.recordPerformanceMetrics(metrics);

      return formattedResults;
    } catch (error) {
      // Record error metrics
      const searchEndTime = performance.now();
      metrics.totalSearchTime = searchEndTime - searchStartTime;
      this.recordPerformanceMetrics(metrics);

      this.logger.error(`Error during search: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Scores components with a timeout to prevent long-running searches
   * @param components - Components to score
   * @param parameters - Parameters to match against
   * @returns Promise that resolves to ranked components and batch count or rejects on timeout
   */
  private scoreComponentsWithTimeout(
    components: ComponentRecord[],
    parameters: ParsedParameters,
  ): { components: ComponentScore[]; batchCount: number } {
    const batchSize = 10000;
    const deadline = performance.now() + this.searchTimeout;
    let rankedComponents: ComponentScore[] = [];
    let batchCount = 1;

    if (components.length > batchSize) {
      this.logger.info(`Large dataset detected (${components.length} components). Processing in batches...`);

      const batches: ComponentRecord[][] = [];
      for (let i = 0; i < components.length; i += batchSize) {
        batches.push(components.slice(i, i + batchSize));
      }

      batchCount = batches.length;
      this.logger.info(`Created ${batchCount} batches of up to ${batchSize} components each`);

      let processedCount = 0;
      for (const batch of batches) {
        if (performance.now() > deadline) {
          throw new Error(`Search timed out after ${this.searchTimeout}ms`);
        }

        const batchScores = this.fuzzyScorer.rankComponents(batch, parameters);
        rankedComponents = this.mergeRankedComponents(rankedComponents, batchScores);

        processedCount += batch.length;
        this.logger.info(
          `Processed ${processedCount}/${components.length} components (${Math.round((processedCount / components.length) * 100)}%)`,
        );
      }
    } else {
      rankedComponents = this.fuzzyScorer.rankComponents(components, parameters);
    }

    return { components: rankedComponents, batchCount };
  }

  /**
   * Merges two arrays of ranked components, maintaining sort order
   * @param a - First array of ranked components
   * @param b - Second array of ranked components
   * @returns Merged array of ranked components
   */
  private mergeRankedComponents(a: ComponentScore[], b: ComponentScore[]): ComponentScore[] {
    // Combine arrays and sort by score (highest first)
    return [...a, ...b].sort((x, y) => y.score - x.score);
  }

  /**
   * Gets cached results for a query if available and not expired
   * @param query - The search query
   * @returns Cached results or undefined if not found or expired
   */
  private getCachedResults(query: string): SearchResult[] | undefined {
    const normalizedQuery = this.normalizeQuery(query);
    const cacheEntry = this.searchCache.get(normalizedQuery);

    if (cacheEntry) {
      const now = Date.now();
      const age = now - cacheEntry.timestamp;

      // Check if cache entry is still valid
      if (age < this.cacheExpirationMs) {
        this.cacheHits++;
        return cacheEntry.results;
      } else {
        // Remove expired entry
        this.searchCache.delete(normalizedQuery);
        this.cacheMisses++;
      }
    } else {
      this.cacheMisses++;
    }

    return undefined;
  }

  /**
   * Caches search results for a query
   * @param query - The search query
   * @param results - The search results
   */
  private cacheResults(query: string, results: SearchResult[]): void {
    const normalizedQuery = this.normalizeQuery(query);

    // Enforce cache size limit
    if (this.searchCache.size >= this.maxCacheSize) {
      // Remove oldest entry
      const oldestKey = this.findOldestCacheEntry();
      if (oldestKey) {
        this.searchCache.delete(oldestKey);
      }
    }

    // Add new entry
    this.searchCache.set(normalizedQuery, {
      query: normalizedQuery,
      results,
      timestamp: Date.now(),
    });
  }

  /**
   * Finds the oldest cache entry key
   * @returns The key of the oldest cache entry or undefined if cache is empty
   */
  private findOldestCacheEntry(): string | undefined {
    let oldestKey: string | undefined;
    let oldestTimestamp = Infinity;

    for (const [key, entry] of this.searchCache.entries()) {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
        oldestKey = key;
      }
    }

    return oldestKey;
  }

  /**
   * Normalizes a query for cache lookup
   * @param query - The search query
   * @returns Normalized query
   */
  private normalizeQuery(query: string): string {
    // Normalize whitespace and case
    return query.trim().toLowerCase();
  }

  /**
   * Formats component scores into search results for display
   * @param componentScores - Scored components
   * @returns Formatted search results
   */
  private formatResults(componentScores: ComponentScore[]): SearchResult[] {
    return componentScores.map((componentScore) => {
      const { component, score } = componentScore;

      const matchSummary = this.fuzzyScorer.generateMatchSummary(componentScore);

      let footprint: string | undefined;
      let fpFilters: string[] | undefined;

      try {
        if (component.extra) {
          const extraData = JSON.parse(component.extra);
          if (extraData.package && typeof extraData.package === 'string') {
            footprint = extraData.package;
          }
          if (Array.isArray(extraData.fpFilters)) {
            fpFilters = extraData.fpFilters;
          }
        }
      } catch {
        // extra field is not valid JSON, skip footprint extraction
      }

      return {
        lcsc: component.lcsc,
        manufacturer: component.manufacturer,
        partNumber: component.mfr,
        description: component.description,
        package: component.package,
        score,
        matchSummary,
        ...(footprint !== undefined && { footprint }),
        ...(fpFilters !== undefined && { fpFilters }),
      };
    });
  }

  /**
   * Clears the search cache
   */
  public clearCache(): void {
    const cacheSize = this.searchCache.size;
    this.searchCache.clear();
    this.logger.info(`Cleared search cache (${cacheSize} entries)`);
  }

  /**
   * Records performance metrics for a search operation
   * @param metrics - Performance metrics to record
   */
  private recordPerformanceMetrics(metrics: SearchPerformanceMetrics): void {
    // Add metrics to history
    this.performanceMetrics.push(metrics);

    // Limit history size
    if (this.performanceMetrics.length > this.maxMetricsHistory) {
      this.performanceMetrics.shift(); // Remove oldest entry
    }
  }

  /**
   * Gets performance metrics for recent searches
   * @returns Array of performance metrics
   */
  public getPerformanceMetrics(): SearchPerformanceMetrics[] {
    return [...this.performanceMetrics];
  }

  /**
   * Gets average performance metrics across all recorded searches
   * @returns Object with average metrics
   */
  public getAveragePerformanceMetrics(): {
    avgTotalTime: number;
    avgParsingTime: number;
    avgScoringTime: number;
    avgFormattingTime: number;
    avgComponentCount: number;
    avgResultCount: number;
    cacheHitRate: number;
  } {
    if (this.performanceMetrics.length === 0) {
      return {
        avgTotalTime: 0,
        avgParsingTime: 0,
        avgScoringTime: 0,
        avgFormattingTime: 0,
        avgComponentCount: 0,
        avgResultCount: 0,
        cacheHitRate: 0,
      };
    }

    // Calculate averages
    const totalMetrics = this.performanceMetrics.reduce(
      (acc, metrics) => {
        acc.totalTime += metrics.totalSearchTime;
        acc.parsingTime += metrics.parsingTime;
        acc.scoringTime += metrics.scoringTime;
        acc.formattingTime += metrics.formattingTime;
        acc.componentCount += metrics.componentCount;
        acc.resultCount += metrics.resultCount;
        acc.cacheHits += metrics.cacheHit ? 1 : 0;
        return acc;
      },
      {
        totalTime: 0,
        parsingTime: 0,
        scoringTime: 0,
        formattingTime: 0,
        componentCount: 0,
        resultCount: 0,
        cacheHits: 0,
      },
    );

    const count = this.performanceMetrics.length;

    return {
      avgTotalTime: totalMetrics.totalTime / count,
      avgParsingTime: totalMetrics.parsingTime / count,
      avgScoringTime: totalMetrics.scoringTime / count,
      avgFormattingTime: totalMetrics.formattingTime / count,
      avgComponentCount: totalMetrics.componentCount / count,
      avgResultCount: totalMetrics.resultCount / count,
      cacheHitRate: totalMetrics.cacheHits / count,
    };
  }

  /**
   * Gets statistics about the search cache
   * @returns Object with cache statistics
   */
  public getCacheStats(): { size: number; maxSize: number; hitRate?: number; hits?: number; misses?: number } {
    // Basic stats that are always included
    const stats: {
      size: number;
      maxSize: number;
      hitRate?: number;
      hits?: number;
      misses?: number;
    } = {
      size: this.searchCache.size,
      maxSize: this.maxCacheSize,
    };

    // Add hit rate statistics if there have been any requests
    const totalRequests = this.cacheHits + this.cacheMisses;
    if (totalRequests > 0) {
      stats.hitRate = this.cacheHits / totalRequests;
      stats.hits = this.cacheHits;
      stats.misses = this.cacheMisses;
    }

    return stats;
  }
}
