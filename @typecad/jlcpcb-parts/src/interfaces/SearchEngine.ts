import { SearchResult } from '../types/index.js';

/**
 * Interface for the main search engine that orchestrates the complete search workflow.
 *
 * The SearchEngine coordinates between data management, parameter parsing, and fuzzy scoring
 * to provide intelligent component search capabilities. It handles the complete pipeline from
 * natural language query to ranked, formatted results.
 *
 * @interface SearchEngine
 * @example
 * ```typescript
 * const searchEngine: SearchEngine = new ComponentSearchEngine(dataManager, parser, scorer);
 *
 * // Search for components
 * const results = await searchEngine.search("10k resistor 0603");
 * console.log(`Found ${results.length} matching components`);
 *
 * // Display results
 * results.forEach(result => {
 *   console.log(`${result.lcsc}: ${result.description} (Score: ${result.score})`);
 * });
 * ```
 */
export interface SearchEngine {
  /**
   * Performs a complete search operation from natural language query to ranked results.
   *
   * This method:
   * 1. Ensures component database is available and up-to-date
   * 2. Parses the search query to extract electrical parameters
   * 3. Scores all components against the parsed parameters
   * 4. Ranks and filters results to return the best matches
   * 5. Formats results for display
   *
   * @param query - Natural language search query (e.g., "10k resistor 0603", "100uF 16V capacitor")
   * @returns Promise resolving to array of top matching components formatted for display
   * @throws {Error} When database cannot be loaded or search fails
   *
   * @example
   * ```typescript
   * // Basic component search
   * const results = await searchEngine.search("10k resistor 0603");
   *
   * // Complex search with multiple parameters
   * const capacitors = await searchEngine.search("100uF 16V X7R ceramic capacitor 0805");
   *
   * // IC search
   * const ics = await searchEngine.search("STM32F103 microcontroller LQFP64");
   * ```
   */
  search(query: string): Promise<SearchResult[]>;
}
