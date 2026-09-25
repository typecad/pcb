import { ComponentRecord, ComponentScore, ParsedParameters } from '../types/index.js';

/**
 * Interface for the intelligent fuzzy scoring system that evaluates how well components match search criteria.
 *
 * The FuzzyScorer implements sophisticated algorithms to score components based on multiple parameters
 * including electrical values, packages, tolerances, and keywords. It uses different weighting strategies
 * for different component types and provides detailed explanations of match quality.
 *
 * @interface FuzzyScorer
 * @example
 * ```typescript
 * const scorer: FuzzyScorer = new ComponentFuzzyScorer();
 * const parameters = parser.parseQuery("10k resistor 0603");
 *
 * // Score individual component
 * const score = scorer.scoreComponent(component, parameters);
 * console.log(`Score: ${score.score}, Matches: ${score.matchDetails.length}`);
 *
 * // Rank all components
 * const ranked = scorer.rankComponents(allComponents, parameters);
 * const topResults = scorer.filterTopResults(ranked, 5);
 * ```
 */
export interface FuzzyScorer {
  /**
   * Calculates a comprehensive match score for a single component against search parameters.
   *
   * The scoring algorithm considers:
   * - Exact parameter matches (100 points each)
   * - Close value matches (50-90 points based on proximity)
   * - Package and type matches (40-80 points)
   * - Keyword relevance (20-50 points)
   * - Component-specific weighting strategies
   *
   * @param component - The component record to evaluate
   * @param parameters - Parsed search parameters to match against
   * @returns Component with calculated total score and detailed match breakdown
   *
   * @example
   * ```typescript
   * const component: ComponentRecord = {
   *   lcsc: "C25804",
   *   description: "10kΩ ±1% 0603 Thick Film Resistor",
   *   package: "0603",
   *   // ... other fields
   * };
   *
   * const parameters: ParsedParameters = {
   *   value: { value: 10000, unit: "Ω", originalText: "10k" },
   *   package: "0603",
   *   tolerance: "±1%"
   * };
   *
   * const result = scorer.scoreComponent(component, parameters);
   * // result.score might be 250 (100 + 80 + 70 for exact matches)
   * // result.matchDetails explains each match
   * ```
   */
  scoreComponent(component: ComponentRecord, parameters: ParsedParameters): ComponentScore;

  /**
   * Scores and ranks multiple components, returning them sorted by match quality.
   *
   * This method efficiently processes large arrays of components, applying the scoring
   * algorithm to each one and sorting the results by total score in descending order.
   *
   * @param components - Array of component records to evaluate
   * @param parameters - Parsed search parameters to match against
   * @returns Array of scored components sorted by score (highest first)
   *
   * @example
   * ```typescript
   * const allComponents: ComponentRecord[] = await dataManager.loadComponents();
   * const parameters = parser.parseQuery("100nF capacitor 0603");
   *
   * const rankedResults = scorer.rankComponents(allComponents, parameters);
   * console.log(`Best match: ${rankedResults[0].component.description} (${rankedResults[0].score})`);
   * ```
   */
  rankComponents(components: ComponentRecord[], parameters: ParsedParameters): ComponentScore[];

  /**
   * Filters scored components to return only the top N results with highest scores.
   *
   * This method is used to limit the number of results returned to the user,
   * focusing on the most relevant matches. Components with very low scores
   * may be filtered out entirely.
   *
   * @param scoredComponents - Array of components with calculated scores
   * @param limit - Maximum number of results to return (default: 5)
   * @returns Array of top N components with highest scores
   *
   * @example
   * ```typescript
   * const allScored = scorer.rankComponents(components, parameters);
   * const topFive = scorer.filterTopResults(allScored, 5);
   * const topTen = scorer.filterTopResults(allScored, 10);
   * ```
   */
  filterTopResults(scoredComponents: ComponentScore[], limit?: number): ComponentScore[];

  /**
   * Creates a human-readable explanation of why a component matched the search criteria.
   *
   * This method analyzes the match details and generates a concise summary that helps
   * users understand why a particular component was selected and how well it matches
   * their requirements.
   *
   * @param componentScore - Component with score and detailed match information
   * @returns Human-readable string explaining the match quality and reasons
   *
   * @example
   * ```typescript
   * const score = scorer.scoreComponent(component, parameters);
   * const summary = scorer.generateMatchSummary(score);
   * // Returns: "Exact resistance match (100 pts), Package match (80 pts), Tolerance match (70 pts)"
   *
   * console.log(`${component.lcsc}: ${summary}`);
   * ```
   */
  generateMatchSummary(componentScore: ComponentScore): string;
}
