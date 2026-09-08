/**
 * Shared scoring utilities used by both scorer implementations.
 * Provides Levenshtein distance, fuzzy matching, and manufacturer alias resolution.
 */

/** Bidirectional manufacturer name aliases for fuzzy matching */
export const MANUFACTURER_VARIATIONS: Record<string, string[]> = {
  sensiron: ['sensirion'],
  sensirion: ['sensiron'],
  stmicro: ['st', 'stmicroelectronics'],
  st: ['stmicro', 'stmicroelectronics'],
  ti: ['texas instruments', 'texas'],
  'texas instruments': ['ti', 'texas'],
  'analog devices': ['adi', 'analog'],
  adi: ['analog devices', 'analog'],
  maxim: ['maxim integrated'],
  'maxim integrated': ['maxim'],
  microchip: ['microchip technology'],
  'microchip technology': ['microchip'],
  nxp: ['nxp semiconductors'],
  'nxp semiconductors': ['nxp'],
  infineon: ['infineon technologies'],
  'infineon technologies': ['infineon'],
};

/**
 * Calculate the Levenshtein distance between two strings.
 * Returns the minimum number of single-character edits (insertions, deletions,
 * substitutions) required to transform str1 into str2.
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const matrix = Array(str2.length + 1)
    .fill(null)
    .map(() => Array(str1.length + 1).fill(null));

  for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(matrix[j][i - 1] + 1, matrix[j - 1][i] + 1, matrix[j - 1][i - 1] + cost);
    }
  }

  return matrix[str2.length][str1.length];
}

/**
 * Check if two strings are fuzzy matches, handling typos, missing characters,
 * and common manufacturer name variations.
 */
export function isFuzzyMatch(query: string, target: string): boolean {
  if (query === target) return true;

  if (query.length < 4 || target.length < 4) return false;

  const queryLower = query.toLowerCase();
  const targetLower = target.toLowerCase();

  if (MANUFACTURER_VARIATIONS[queryLower]?.includes(targetLower)) return true;
  if (MANUFACTURER_VARIATIONS[targetLower]?.includes(queryLower)) return true;

  const distance = levenshteinDistance(query, target);
  const maxLength = Math.max(query.length, target.length);
  const maxDistance = maxLength > 6 ? 2 : 1;

  return distance <= maxDistance;
}
