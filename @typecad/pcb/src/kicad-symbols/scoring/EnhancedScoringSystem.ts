import { ComponentRecord, ComponentScore, MatchDetail, ParsedParameters } from '../types/index.js';
import { FuzzyScorer } from '../interfaces/FuzzyScorer.js';
import { isFuzzyMatch, MANUFACTURER_VARIATIONS } from './scoring_utils.js';
import logger from '../../utils/logging.js';

/**
 * Enhanced scoring system with advanced matching capabilities
 * Includes parameter counting, unit-specific measures, and footprint matching
 */
export class EnhancedScoringSystem implements FuzzyScorer {
  // Enhanced scoring constants
  private readonly EXACT_MATCH_SCORE = 100;
  private readonly KEYWORD_MATCH_SCORE = 70;
  private readonly PACKAGE_MATCH_SCORE = 85;
  private readonly TYPE_MATCH_SCORE = 75;
  private readonly CATEGORY_MATCH_SCORE = 40;
  private readonly MANUFACTURER_MATCH_SCORE = 60;
  private readonly VOLTAGE_MATCH_SCORE = 80;
  private readonly FREQUENCY_MATCH_SCORE = 75;
  private readonly MEMORY_SIZE_MATCH_SCORE = 70;
  private readonly TEMPERATURE_MATCH_SCORE = 65;

  // Multi-parameter bonus scoring
  private readonly PARAMETER_COUNT_BONUS = 15; // Bonus per additional parameter match
  private readonly PERFECT_MATCH_BONUS = 50; // Bonus for matching all parameters
  private readonly FOOTPRINT_EXACT_MATCH_BONUS = 30;
  private readonly FOOTPRINT_SIMILAR_MATCH_BONUS = 15;

  // Penalty for component type mismatches
  private readonly TYPE_MISMATCH_PENALTY = -50; // Penalty for wrong component type

  // Specificity bonus for simple components over complex ones
  private readonly SIMPLICITY_BONUS = 25; // Bonus for simple components (resistors vs resistor networks)

  // Unit-specific matching patterns
  private readonly voltagePattern = /(\d+(?:\.\d+)?)\s*[Vv](?:olt)?(?:DC|AC)?/g;
  private readonly frequencyPattern = /(\d+(?:\.\d+)?)\s*(?:k|M|G)?[Hh][Zz]/g;
  private readonly memoryPattern = /(\d+(?:\.\d+)?)\s*(?:k|M|G)?[Bb]?[Ii][Tt]/g;
  private readonly temperaturePattern = /(-?\d+(?:\.\d+)?)\s*[°]?[Cc]/g;

  // Footprint patterns for different package types
  private readonly footprintPatterns = {
    // SMD packages
    QFN: /QFN|DFN|LFCSP|VQFN|MLF/i,
    SOIC: /SOIC|SOP|SSOP|TSSOP|MSOP/i,
    QFP: /QFP|TQFP|LQFP|PQFP/i,
    BGA: /BGA|FBGA|LFBGA|TFBGA/i,
    SOT: /SOT-23|SOT-223|SOT-89|SOT-363/i,
    '0603': /0603|1608/i,
    '0402': /0402|1005/i,
    '0805': /0805|2012/i,
    '1206': /1206|3216/i,

    // Through-hole packages
    DIP: /DIP|PDIP|CDIP/i,
    TO: /TO-220|TO-92|TO-18|TO-39/i,
    SIP: /SIP/i,

    // Special packages
    WSON: /WSON|SON/i,
    TSOP: /TSOP|TSOP-I|TSOP-II/i,
    PLCC: /PLCC/i,
    CSP: /CSP|WLCSP/i,
  };

  /**
   * Enhanced scoring method with advanced parameter matching
   */
  public scoreComponent(component: ComponentRecord, parameters: ParsedParameters): ComponentScore {
    const matchDetails: MatchDetail[] = [];
    let totalScore = 0;

    // 1. Enhanced keyword matching with parameter counting
    if (parameters.keywords && parameters.keywords.length > 0) {
      const keywordMatch = this.scoreEnhancedKeywordMatch(component, parameters.keywords);
      matchDetails.push(keywordMatch);
      totalScore += keywordMatch.score;
    }

    // 2. Unit-specific parameter matching
    if (parameters.keywords) {
      // Voltage matching
      const voltageMatches = this.scoreVoltageMatches(component, parameters.keywords);
      matchDetails.push(...voltageMatches);
      totalScore += voltageMatches.reduce((sum, match) => sum + match.score, 0);

      // Frequency matching
      const frequencyMatches = this.scoreFrequencyMatches(component, parameters.keywords);
      matchDetails.push(...frequencyMatches);
      totalScore += frequencyMatches.reduce((sum, match) => sum + match.score, 0);

      // Memory size matching
      const memoryMatches = this.scoreMemoryMatches(component, parameters.keywords);
      matchDetails.push(...memoryMatches);
      totalScore += memoryMatches.reduce((sum, match) => sum + match.score, 0);

      // Temperature matching
      const temperatureMatches = this.scoreTemperatureMatches(component, parameters.keywords);
      matchDetails.push(...temperatureMatches);
      totalScore += temperatureMatches.reduce((sum, match) => sum + match.score, 0);
    }

    // 3. Enhanced footprint matching
    if (parameters.package) {
      const footprintMatch = this.scoreEnhancedFootprintMatch(component, parameters.package);
      matchDetails.push(footprintMatch);
      totalScore += footprintMatch.score;
    }

    // 4. Component type matching with penalties for mismatches
    if (parameters.componentType) {
      const typeMatch = this.scoreComponentTypeMatch(component, parameters.componentType);
      matchDetails.push(typeMatch);
      totalScore += typeMatch.score;
    }

    // 5. Manufacturer matching
    const manufacturerMatch = this.scoreManufacturerMatch(component, parameters);
    if (manufacturerMatch) {
      matchDetails.push(manufacturerMatch);
      totalScore += manufacturerMatch.score;
    }

    // 6. Category matching
    const categoryMatch = this.scoreCategoryMatch(component, parameters);
    if (categoryMatch) {
      matchDetails.push(categoryMatch);
      totalScore += categoryMatch.score;
    }

    // 7. Calculate multi-parameter bonus
    const parameterBonus = this.calculateParameterBonus(matchDetails);
    if (parameterBonus > 0) {
      matchDetails.push({
        parameter: 'multi_parameter_bonus',
        score: parameterBonus,
        exact: false,
        reason: `Multi-parameter bonus: ${parameterBonus} points`,
      });
      totalScore += parameterBonus;
    }

    // 8. Calculate simplicity bonus (prioritize simple components over complex ones)
    const simplicityBonus = this.calculateSimplicityBonus(component, parameters);
    if (simplicityBonus > 0) {
      matchDetails.push({
        parameter: 'simplicity_bonus',
        score: simplicityBonus,
        exact: false,
        reason: `Simplicity bonus: ${simplicityBonus} points`,
      });
      totalScore += simplicityBonus;
    }

    return {
      component,
      score: totalScore,
      matchDetails,
    };
  }

  /**
   * Ranks multiple components based on their match scores
   */
  public rankComponents(components: ComponentRecord[], parameters: ParsedParameters): ComponentScore[] {
    return components.map((component) => this.scoreComponent(component, parameters)).sort((a, b) => b.score - a.score);
  }

  /**
   * Filters scored components to return only the top N results
   */
  public filterTopResults(scoredComponents: ComponentScore[], limit: number = 5): ComponentScore[] {
    return scoredComponents.slice(0, limit);
  }

  /**
   * Creates a human-readable explanation of why a component matched
   */
  public generateMatchSummary(componentScore: ComponentScore): string {
    const details = componentScore.matchDetails
      .filter((detail) => detail.score > 0)
      .map((detail) => `${detail.parameter}: ${detail.reason} (${detail.score} pts)`)
      .join(', ');

    return details || 'No significant matches found';
  }

  /**
   * Enhanced keyword matching with better prioritization of exact matches
   */
  private scoreEnhancedKeywordMatch(component: ComponentRecord, keywords: string[]): MatchDetail {
    const description = component.description.toLowerCase();
    const mfr = component.mfr.toLowerCase();
    const category = component.category.toLowerCase();
    const matchedKeywords: string[] = [];
    const importantMatches: string[] = [];
    const exactMatches: string[] = [];

    // Parse extra field to get searchTerms if available
    let searchTerms: string[] = [];
    try {
      const extraData = JSON.parse(component.extra);
      if (extraData.searchTerms && Array.isArray(extraData.searchTerms)) {
        searchTerms = extraData.searchTerms.map((term: string) => term.toLowerCase());
      }
    } catch (error) {
      logger.debug('EnhancedScoringSystem: searchTerms parse failed', error);
    }

    // Check each keyword for a match
    for (const keyword of keywords) {
      const lowerKeyword = keyword.toLowerCase();

      // Check for exact matches in description (highest priority)
      if (description.includes(lowerKeyword)) {
        matchedKeywords.push(keyword);
        exactMatches.push(keyword);
        importantMatches.push(keyword);
      }
      // Check for exact matches in part number (high priority)
      else if (mfr.includes(lowerKeyword)) {
        matchedKeywords.push(keyword);
        exactMatches.push(keyword);
        importantMatches.push(keyword);
      }
      // Check for exact matches in category
      else if (category.includes(lowerKeyword)) {
        matchedKeywords.push(keyword);
        exactMatches.push(keyword);
      }
      // Check for exact matches in searchTerms
      else if (searchTerms.includes(lowerKeyword)) {
        matchedKeywords.push(keyword);
        exactMatches.push(keyword);
        importantMatches.push(keyword);
      }
      // Check for fuzzy matches in searchTerms
      else if (searchTerms.length > 0) {
        for (const searchTerm of searchTerms) {
          if (isFuzzyMatch(lowerKeyword, searchTerm)) {
            matchedKeywords.push(keyword);
            break; // Only count the first fuzzy match
          }
        }
      }
    }

    // Calculate score based on number of matched keywords
    const matchCount = matchedKeywords.length;
    if (matchCount === 0) {
      return {
        parameter: 'keywords',
        score: 0,
        exact: false,
        reason: 'No keyword matches found',
      };
    }

    // Base score on percentage of keywords matched
    let matchPercentage = matchCount / keywords.length;

    // Boost score for exact matches (higher priority)
    if (exactMatches.length > 0) {
      matchPercentage += (exactMatches.length / keywords.length) * 0.4;
    }

    // Boost score for important matches
    if (importantMatches.length > 0) {
      matchPercentage += (importantMatches.length / keywords.length) * 0.3;
    }

    // Add bonus for matching multiple keywords
    let multiKeywordBonus = 0;
    if (matchCount > 1 && keywords.length > 1) {
      multiKeywordBonus = (matchCount / keywords.length) * 0.2;
    }

    const finalMatchPercentage = Math.min(2.0, matchPercentage + multiKeywordBonus);
    const score = Math.round(this.KEYWORD_MATCH_SCORE * finalMatchPercentage);

    let reason = `Matched ${matchCount}/${keywords.length} keywords: ${matchedKeywords.join(', ')}`;
    if (exactMatches.length > 0) {
      reason += ` (exact matches: ${exactMatches.join(', ')})`;
    }
    if (importantMatches.length > 0) {
      reason += ` (important matches: ${importantMatches.join(', ')})`;
    }

    return {
      parameter: 'keywords',
      score,
      exact: matchCount === keywords.length,
      reason,
    };
  }

  /**
   * Score voltage matches with range support
   */
  private scoreVoltageMatches(component: ComponentRecord, keywords: string[]): MatchDetail[] {
    const matches: MatchDetail[] = [];
    const description = component.description.toLowerCase();

    for (const keyword of keywords) {
      const voltageMatch = keyword.match(this.voltagePattern);
      if (voltageMatch) {
        const voltageValue = parseFloat(voltageMatch[1]);

        // Check for voltage range matches in description
        const rangeMatches = description.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*[Vv]/g);
        if (rangeMatches) {
          for (const range of rangeMatches) {
            const rangeValues = range.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
            if (rangeValues) {
              const minVoltage = parseFloat(rangeValues[1]);
              const maxVoltage = parseFloat(rangeValues[2]);

              if (voltageValue >= minVoltage && voltageValue <= maxVoltage) {
                matches.push({
                  parameter: 'voltage_range',
                  score: this.VOLTAGE_MATCH_SCORE,
                  exact: true,
                  reason: `Voltage ${voltageValue}V matches range ${minVoltage}-${maxVoltage}V`,
                });
                break;
              }
            }
          }
        }

        // Check for exact voltage matches
        if (description.includes(`${voltageValue}V`) || description.includes(`${voltageValue}v`)) {
          matches.push({
            parameter: 'voltage_exact',
            score: this.VOLTAGE_MATCH_SCORE,
            exact: true,
            reason: `Exact voltage match: ${voltageValue}V`,
          });
        }
      }
    }

    return matches;
  }

  /**
   * Score frequency matches (MHz, GHz, etc.)
   */
  private scoreFrequencyMatches(component: ComponentRecord, keywords: string[]): MatchDetail[] {
    const matches: MatchDetail[] = [];
    const description = component.description.toLowerCase();

    for (const keyword of keywords) {
      const freqMatch = keyword.match(this.frequencyPattern);
      if (freqMatch) {
        const freqValue = parseFloat(freqMatch[1]);
        const unit = keyword.match(/(k|M|G)?[Hh][Zz]/)?.[0] || 'Hz';

        // Check for frequency range matches
        const rangeMatches = description.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*(?:k|M|G)?[Hh][Zz]/g);
        if (rangeMatches) {
          for (const range of rangeMatches) {
            const rangeValues = range.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
            if (rangeValues) {
              const minFreq = parseFloat(rangeValues[1]);
              const maxFreq = parseFloat(rangeValues[2]);

              if (freqValue >= minFreq && freqValue <= maxFreq) {
                matches.push({
                  parameter: 'frequency_range',
                  score: this.FREQUENCY_MATCH_SCORE,
                  exact: true,
                  reason: `Frequency ${freqValue}${unit} matches range ${minFreq}-${maxFreq}${unit}`,
                });
                break;
              }
            }
          }
        }

        // Check for exact frequency matches
        if (description.includes(`${freqValue}${unit}`)) {
          matches.push({
            parameter: 'frequency_exact',
            score: this.FREQUENCY_MATCH_SCORE,
            exact: true,
            reason: `Exact frequency match: ${freqValue}${unit}`,
          });
        }
      }
    }

    return matches;
  }

  /**
   * Score memory size matches (bytes, KB, MB, GB)
   */
  private scoreMemoryMatches(component: ComponentRecord, keywords: string[]): MatchDetail[] {
    const matches: MatchDetail[] = [];
    const description = component.description.toLowerCase();

    for (const keyword of keywords) {
      const memoryMatch = keyword.match(this.memoryPattern);
      if (memoryMatch) {
        const memoryValue = parseFloat(memoryMatch[1]);
        const unit = keyword.match(/(k|M|G)?[Bb]?[Ii][Tt]/)?.[0] || 'bit';

        // Check for memory size matches in description
        if (description.includes(`${memoryValue}${unit}`) || description.includes(`${memoryValue} ${unit}`)) {
          matches.push({
            parameter: 'memory_size',
            score: this.MEMORY_SIZE_MATCH_SCORE,
            exact: true,
            reason: `Memory size match: ${memoryValue}${unit}`,
          });
        }
      }
    }

    return matches;
  }

  /**
   * Score temperature matches (°C)
   */
  private scoreTemperatureMatches(component: ComponentRecord, keywords: string[]): MatchDetail[] {
    const matches: MatchDetail[] = [];
    const description = component.description.toLowerCase();

    for (const keyword of keywords) {
      const tempMatch = keyword.match(this.temperaturePattern);
      if (tempMatch) {
        const tempValue = parseFloat(tempMatch[1]);

        // Check for temperature range matches
        const rangeMatches = description.match(/(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)\s*[°]?[Cc]/g);
        if (rangeMatches) {
          for (const range of rangeMatches) {
            const rangeValues = range.match(/(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)/);
            if (rangeValues) {
              const minTemp = parseFloat(rangeValues[1]);
              const maxTemp = parseFloat(rangeValues[2]);

              if (tempValue >= minTemp && tempValue <= maxTemp) {
                matches.push({
                  parameter: 'temperature_range',
                  score: this.TEMPERATURE_MATCH_SCORE,
                  exact: true,
                  reason: `Temperature ${tempValue}°C matches range ${minTemp}-${maxTemp}°C`,
                });
                break;
              }
            }
          }
        }

        // Check for exact temperature matches
        if (description.includes(`${tempValue}°C`) || description.includes(`${tempValue}C`)) {
          matches.push({
            parameter: 'temperature_exact',
            score: this.TEMPERATURE_MATCH_SCORE,
            exact: true,
            reason: `Exact temperature match: ${tempValue}°C`,
          });
        }
      }
    }

    return matches;
  }

  /**
   * Enhanced footprint matching with package type recognition
   */
  private scoreEnhancedFootprintMatch(component: ComponentRecord, packageType: string): MatchDetail {
    const description = component.description.toLowerCase();
    const packageLower = packageType.toLowerCase();

    // Check for exact footprint matches
    for (const [footprintType, pattern] of Object.entries(this.footprintPatterns)) {
      if (pattern.test(packageLower) || pattern.test(description)) {
        // Check if this is an exact match
        if (packageLower.includes(footprintType.toLowerCase()) || description.includes(footprintType.toLowerCase())) {
          return {
            parameter: 'footprint_exact',
            score: this.PACKAGE_MATCH_SCORE + this.FOOTPRINT_EXACT_MATCH_BONUS,
            exact: true,
            reason: `Exact footprint match: ${footprintType}`,
          };
        } else {
          return {
            parameter: 'footprint_similar',
            score: this.PACKAGE_MATCH_SCORE + this.FOOTPRINT_SIMILAR_MATCH_BONUS,
            exact: false,
            reason: `Similar footprint match: ${footprintType}`,
          };
        }
      }
    }

    // Check for generic package type matches
    if (description.includes(packageLower) || packageLower.includes('symbol')) {
      return {
        parameter: 'package_generic',
        score: this.PACKAGE_MATCH_SCORE,
        exact: false,
        reason: `Generic package match: ${packageType}`,
      };
    }

    return {
      parameter: 'footprint',
      score: 0,
      exact: false,
      reason: 'No footprint match found',
    };
  }

  /**
   * Enhanced manufacturer matching
   */
  private scoreManufacturerMatch(component: ComponentRecord, parameters: ParsedParameters): MatchDetail | null {
    if (!parameters.keywords) return null;

    const mfr = component.mfr.toLowerCase();
    const manufacturer = component.manufacturer.toLowerCase();

    for (const keyword of parameters.keywords) {
      const lowerKeyword = keyword.toLowerCase();

      // Check for exact manufacturer name matches (not part number)
      if (manufacturer.includes(lowerKeyword)) {
        return {
          parameter: 'manufacturer',
          score: this.MANUFACTURER_MATCH_SCORE,
          exact: true,
          reason: `Manufacturer match: ${keyword}`,
        };
      }

      // Check for manufacturer variations
      for (const [manufacturerName, variations] of Object.entries(MANUFACTURER_VARIATIONS)) {
        if (variations.includes(lowerKeyword) || lowerKeyword.includes(manufacturerName)) {
          return {
            parameter: 'manufacturer_variation',
            score: this.MANUFACTURER_MATCH_SCORE,
            exact: false,
            reason: `Manufacturer variation match: ${keyword} → ${manufacturerName}`,
          };
        }
      }

      // Check for part number matches (separate from manufacturer)
      if (mfr.includes(lowerKeyword)) {
        return {
          parameter: 'part_number',
          score: this.MANUFACTURER_MATCH_SCORE,
          exact: true,
          reason: `Part number match: ${keyword}`,
        };
      }
    }

    return null;
  }

  /**
   * Enhanced category matching
   */
  private scoreCategoryMatch(component: ComponentRecord, parameters: ParsedParameters): MatchDetail | null {
    if (!parameters.keywords) return null;

    const category = component.category.toLowerCase();

    for (const keyword of parameters.keywords) {
      const lowerKeyword = keyword.toLowerCase();

      if (category.includes(lowerKeyword)) {
        return {
          parameter: 'category',
          score: this.CATEGORY_MATCH_SCORE,
          exact: true,
          reason: `Category match: ${keyword} in ${component.category}`,
        };
      }
    }

    return null;
  }

  /**
   * Score component type matching with penalties for mismatches
   */
  private scoreComponentTypeMatch(component: ComponentRecord, targetType: string): MatchDetail {
    const description = component.description.toLowerCase();
    const mfr = component.mfr.toLowerCase();
    const targetTypeLower = targetType.toLowerCase();

    // Parse extra field to get library information
    let library = '';
    try {
      const extraData = JSON.parse(component.extra);
      if (extraData.library) {
        library = extraData.library.toLowerCase();
      }
    } catch (error) {
      logger.debug('EnhancedScoringSystem: library info parse failed in type scoring', error);
    }

    // First, check for negative matches (components that contain the word but are NOT that type)
    const negativeMatches: Record<string, string[]> = {
      inductor: ['inductor-less', 'inductorless', 'without inductor', 'no inductor'],
      resistor: ['potentiometer', 'variable resistor', 'rheostat', 'pot'],
      capacitor: ['varactor', 'variable capacitor'],
      diode: ['led', 'light emitting diode'],
      transistor: ['thyristor', 'triac', 'scr'],
    };

    if (negativeMatches[targetTypeLower]) {
      for (const negativeMatch of negativeMatches[targetTypeLower]) {
        if (description.includes(negativeMatch) || mfr.includes(negativeMatch)) {
          return {
            parameter: 'component_type',
            score: this.TYPE_MISMATCH_PENALTY,
            exact: false,
            reason: `Component type mismatch: searching for ${targetType} but found ${negativeMatch}`,
          };
        }
      }
    }

    // Additional check for potentiometer in part number or description
    if (targetTypeLower === 'resistor') {
      if (mfr.includes('pot') || description.includes('potentiometer') || description.includes('variable')) {
        return {
          parameter: 'component_type',
          score: this.TYPE_MISMATCH_PENALTY,
          exact: false,
          reason: `Component type mismatch: searching for resistor but found potentiometer/variable component`,
        };
      }
    }

    // Check for exact description match (highest priority)
    if (description === targetTypeLower) {
      let bonus = 0;
      // Extra bonus for Device library (basic components)
      if (library === 'device') {
        bonus = 50;
      }
      return {
        parameter: 'component_type',
        score: this.TYPE_MATCH_SCORE + bonus,
        exact: true,
        reason: `Perfect component type match: ${targetType}${bonus > 0 ? ' (Device library bonus)' : ''}`,
      };
    }

    // Check if the component description starts with the target type (high priority)
    if (description.startsWith(targetTypeLower)) {
      let bonus = 0;
      // Extra bonus for Device library (basic components)
      if (library === 'device') {
        bonus = 30;
      }
      return {
        parameter: 'component_type',
        score: this.TYPE_MATCH_SCORE + bonus,
        exact: true,
        reason: `Component type starts with match: ${targetType}${bonus > 0 ? ' (Device library bonus)' : ''}`,
      };
    }

    // Check if the component description contains the target type (medium priority)
    if (description.includes(targetTypeLower)) {
      let bonus = 0;
      // Extra bonus for Device library (basic components)
      if (library === 'device') {
        bonus = 20;
      }
      return {
        parameter: 'component_type',
        score: this.TYPE_MATCH_SCORE + bonus,
        exact: false,
        reason: `Component type contains match: ${targetType}${bonus > 0 ? ' (Device library bonus)' : ''}`,
      };
    }

    // Check for common variations
    const typeVariations: Record<string, string[]> = {
      resistor: ['resistor', 'r_', 'resistance'],
      capacitor: ['capacitor', 'c_', 'capacitance'],
      inductor: ['inductor', 'l_', 'inductance'],
      diode: ['diode', 'd_'],
      transistor: ['transistor', 'q_', 'bjt', 'mosfet'],
      ic: ['ic', 'integrated circuit', 'u_'],
      connector: ['connector', 'j_', 'header', 'socket'],
      switch: ['switch', 'sw_', 'button'],
      crystal: ['crystal', 'oscillator', 'xtal'],
      fuse: ['fuse', 'f_'],
    };

    // Check for type variations
    if (typeVariations[targetTypeLower]) {
      for (const variation of typeVariations[targetTypeLower]) {
        if (description.includes(variation) || mfr.includes(variation)) {
          let bonus = 0;
          // Extra bonus for Device library (basic components)
          if (library === 'device') {
            bonus = 15;
          }
          return {
            parameter: 'component_type',
            score: this.TYPE_MATCH_SCORE + bonus,
            exact: false,
            reason: `Component type variation match: ${targetType} (${variation})${bonus > 0 ? ' (Device library bonus)' : ''}`,
          };
        }
      }
    }

    return {
      parameter: 'component_type',
      score: 0,
      exact: false,
      reason: `No component type match for: ${targetType}`,
    };
  }

  /**
   * Calculate multi-parameter bonus
   */
  private calculateParameterBonus(matchDetails: MatchDetail[]): number {
    const validMatches = matchDetails.filter((match) => match.score > 0);

    if (validMatches.length === 0) return 0;

    // Bonus for multiple parameter matches
    let bonus = (validMatches.length - 1) * this.PARAMETER_COUNT_BONUS;

    // Perfect match bonus (all parameters matched)
    const exactMatches = validMatches.filter((match) => match.exact);
    if (exactMatches.length === validMatches.length && validMatches.length > 1) {
      bonus += this.PERFECT_MATCH_BONUS;
    }

    return bonus;
  }

  /**
   * Calculate simplicity bonus (prioritize simple components over complex ones)
   */
  private calculateSimplicityBonus(component: ComponentRecord, parameters: ParsedParameters): number {
    const description = component.description.toLowerCase();
    const mfr = component.mfr.toLowerCase();

    // Parse extra field to get library information
    let library = '';
    try {
      const extraData = JSON.parse(component.extra);
      if (extraData.library) {
        library = extraData.library.toLowerCase();
      }
    } catch (error) {
      logger.debug('EnhancedScoringSystem: library info parse failed in package scoring', error);
    }

    // Bonus for Device library components (basic components)
    let deviceLibraryBonus = 0;
    if (library === 'device') {
      deviceLibraryBonus = this.SIMPLICITY_BONUS;
    }

    // Check if we're searching for a resistor
    if (parameters.componentType && parameters.componentType.toLowerCase() === 'resistor') {
      // Penalize resistor networks when searching for simple resistors
      if (description.includes('network') || mfr.includes('network')) {
        return -this.SIMPLICITY_BONUS; // Penalty for complex components
      }

      // Bonus for simple resistors
      if (description.includes('resistor') && !description.includes('network')) {
        return this.SIMPLICITY_BONUS + deviceLibraryBonus;
      }
    }

    // Check if we're searching for a capacitor
    if (parameters.componentType && parameters.componentType.toLowerCase() === 'capacitor') {
      // Penalize capacitor networks when searching for simple capacitors
      if (description.includes('network') || mfr.includes('network')) {
        return -this.SIMPLICITY_BONUS;
      }

      // Bonus for simple capacitors
      if (description.includes('capacitor') && !description.includes('network')) {
        return this.SIMPLICITY_BONUS + deviceLibraryBonus;
      }
    }

    // Check if we're searching for an inductor
    if (parameters.componentType && parameters.componentType.toLowerCase() === 'inductor') {
      // Penalize complex components that mention inductor but aren't inductors
      const complexIndicators = [
        'amplifier',
        'converter',
        'regulator',
        'controller',
        'processor',
        'driver',
        'switch',
        'multiplexer',
        'buffer',
        'interface',
        'transceiver',
        'modem',
      ];

      for (const indicator of complexIndicators) {
        if (description.includes(indicator)) {
          return -this.SIMPLICITY_BONUS * 2; // Heavy penalty for complex ICs
        }
      }

      // Bonus for simple inductors
      if (description === 'inductor' || description.startsWith('inductor')) {
        return this.SIMPLICITY_BONUS + deviceLibraryBonus;
      }
    }

    return deviceLibraryBonus;
  }
}
