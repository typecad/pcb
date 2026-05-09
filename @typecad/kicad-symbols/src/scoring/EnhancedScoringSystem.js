"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnhancedScoringSystem = void 0;
/**
 * Enhanced scoring system with advanced matching capabilities
 * Includes parameter counting, unit-specific measures, and footprint matching
 */
var EnhancedScoringSystem = /** @class */ (function () {
    function EnhancedScoringSystem() {
        // Enhanced scoring constants
        this.EXACT_MATCH_SCORE = 100;
        this.KEYWORD_MATCH_SCORE = 70; // Increased for better visibility
        this.PACKAGE_MATCH_SCORE = 85; // Increased for footprint importance
        this.TYPE_MATCH_SCORE = 75;
        this.CATEGORY_MATCH_SCORE = 40;
        this.MANUFACTURER_MATCH_SCORE = 60;
        this.VOLTAGE_MATCH_SCORE = 80;
        this.FREQUENCY_MATCH_SCORE = 75;
        this.MEMORY_SIZE_MATCH_SCORE = 70;
        this.TEMPERATURE_MATCH_SCORE = 65;
        // Multi-parameter bonus scoring
        this.PARAMETER_COUNT_BONUS = 15; // Bonus per additional parameter match
        this.PERFECT_MATCH_BONUS = 50; // Bonus for matching all parameters
        this.FOOTPRINT_EXACT_MATCH_BONUS = 30;
        this.FOOTPRINT_SIMILAR_MATCH_BONUS = 15;
        // Penalty for component type mismatches
        this.TYPE_MISMATCH_PENALTY = -50; // Penalty for wrong component type
        // Specificity bonus for simple components over complex ones
        this.SIMPLICITY_BONUS = 25; // Bonus for simple components (resistors vs resistor networks)
        // Unit-specific matching patterns
        this.voltagePattern = /(\d+(?:\.\d+)?)\s*[Vv](?:olt)?(?:DC|AC)?/g;
        this.frequencyPattern = /(\d+(?:\.\d+)?)\s*(?:k|M|G)?[Hh][Zz]/g;
        this.memoryPattern = /(\d+(?:\.\d+)?)\s*(?:k|M|G)?[Bb]?[Ii][Tt]/g;
        this.temperaturePattern = /(-?\d+(?:\.\d+)?)\s*[°]?[Cc]/g;
        // Footprint patterns for different package types
        this.footprintPatterns = {
            // SMD packages
            'QFN': /QFN|DFN|LFCSP|VQFN|MLF/i,
            'SOIC': /SOIC|SOP|SSOP|TSSOP|MSOP/i,
            'QFP': /QFP|TQFP|LQFP|PQFP/i,
            'BGA': /BGA|FBGA|LFBGA|TFBGA/i,
            'SOT': /SOT-23|SOT-223|SOT-89|SOT-363/i,
            '0603': /0603|1608/i,
            '0402': /0402|1005/i,
            '0805': /0805|2012/i,
            '1206': /1206|3216/i,
            // Through-hole packages
            'DIP': /DIP|PDIP|CDIP/i,
            'TO': /TO-220|TO-92|TO-18|TO-39/i,
            'SIP': /SIP/i,
            // Special packages
            'WSON': /WSON|SON/i,
            'TSOP': /TSOP|TSOP-I|TSOP-II/i,
            'PLCC': /PLCC/i,
            'CSP': /CSP|WLCSP/i
        };
    }
    /**
     * Enhanced scoring method with advanced parameter matching
     */
    EnhancedScoringSystem.prototype.scoreComponent = function (component, parameters) {
        var matchDetails = [];
        var totalScore = 0;
        // 1. Enhanced keyword matching with parameter counting
        if (parameters.keywords && parameters.keywords.length > 0) {
            var keywordMatch = this.scoreEnhancedKeywordMatch(component, parameters.keywords);
            matchDetails.push(keywordMatch);
            totalScore += keywordMatch.score;
        }
        // 2. Unit-specific parameter matching
        if (parameters.keywords) {
            // Voltage matching
            var voltageMatches = this.scoreVoltageMatches(component, parameters.keywords);
            matchDetails.push.apply(matchDetails, voltageMatches);
            totalScore += voltageMatches.reduce(function (sum, match) { return sum + match.score; }, 0);
            // Frequency matching
            var frequencyMatches = this.scoreFrequencyMatches(component, parameters.keywords);
            matchDetails.push.apply(matchDetails, frequencyMatches);
            totalScore += frequencyMatches.reduce(function (sum, match) { return sum + match.score; }, 0);
            // Memory size matching
            var memoryMatches = this.scoreMemoryMatches(component, parameters.keywords);
            matchDetails.push.apply(matchDetails, memoryMatches);
            totalScore += memoryMatches.reduce(function (sum, match) { return sum + match.score; }, 0);
            // Temperature matching
            var temperatureMatches = this.scoreTemperatureMatches(component, parameters.keywords);
            matchDetails.push.apply(matchDetails, temperatureMatches);
            totalScore += temperatureMatches.reduce(function (sum, match) { return sum + match.score; }, 0);
        }
        // 3. Enhanced footprint matching
        if (parameters.package) {
            var footprintMatch = this.scoreEnhancedFootprintMatch(component, parameters.package);
            matchDetails.push(footprintMatch);
            totalScore += footprintMatch.score;
        }
        // 4. Component type matching with penalties for mismatches
        if (parameters.componentType) {
            var typeMatch = this.scoreComponentTypeMatch(component, parameters.componentType);
            matchDetails.push(typeMatch);
            totalScore += typeMatch.score;
        }
        // 5. Manufacturer matching
        var manufacturerMatch = this.scoreManufacturerMatch(component, parameters);
        if (manufacturerMatch) {
            matchDetails.push(manufacturerMatch);
            totalScore += manufacturerMatch.score;
        }
        // 6. Category matching
        var categoryMatch = this.scoreCategoryMatch(component, parameters);
        if (categoryMatch) {
            matchDetails.push(categoryMatch);
            totalScore += categoryMatch.score;
        }
        // 7. Calculate multi-parameter bonus
        var parameterBonus = this.calculateParameterBonus(matchDetails);
        if (parameterBonus > 0) {
            matchDetails.push({
                parameter: 'multi_parameter_bonus',
                score: parameterBonus,
                exact: false,
                reason: "Multi-parameter bonus: ".concat(parameterBonus, " points")
            });
            totalScore += parameterBonus;
        }
        // 8. Calculate simplicity bonus (prioritize simple components over complex ones)
        var simplicityBonus = this.calculateSimplicityBonus(component, parameters);
        if (simplicityBonus > 0) {
            matchDetails.push({
                parameter: 'simplicity_bonus',
                score: simplicityBonus,
                exact: false,
                reason: "Simplicity bonus: ".concat(simplicityBonus, " points")
            });
            totalScore += simplicityBonus;
        }
        return {
            component: component,
            score: totalScore,
            matchDetails: matchDetails
        };
    };
    /**
     * Ranks multiple components based on their match scores
     */
    EnhancedScoringSystem.prototype.rankComponents = function (components, parameters) {
        var _this = this;
        return components
            .map(function (component) { return _this.scoreComponent(component, parameters); })
            .sort(function (a, b) { return b.score - a.score; });
    };
    /**
     * Filters scored components to return only the top N results
     */
    EnhancedScoringSystem.prototype.filterTopResults = function (scoredComponents, limit) {
        if (limit === void 0) { limit = 5; }
        return scoredComponents.slice(0, limit);
    };
    /**
     * Creates a human-readable explanation of why a component matched
     */
    EnhancedScoringSystem.prototype.generateMatchSummary = function (componentScore) {
        var details = componentScore.matchDetails
            .filter(function (detail) { return detail.score > 0; })
            .map(function (detail) { return "".concat(detail.parameter, ": ").concat(detail.reason, " (").concat(detail.score, " pts)"); })
            .join(', ');
        return details || 'No significant matches found';
    };
    /**
     * Enhanced keyword matching with better prioritization of exact matches
     */
    EnhancedScoringSystem.prototype.scoreEnhancedKeywordMatch = function (component, keywords) {
        var description = component.description.toLowerCase();
        var mfr = component.mfr.toLowerCase();
        var category = component.category.toLowerCase();
        var matchedKeywords = [];
        var importantMatches = [];
        var exactMatches = [];
        // Parse extra field to get searchTerms if available
        var searchTerms = [];
        try {
            var extraData = JSON.parse(component.extra);
            if (extraData.searchTerms && Array.isArray(extraData.searchTerms)) {
                searchTerms = extraData.searchTerms.map(function (term) { return term.toLowerCase(); });
            }
        }
        catch (error) {
            // If parsing fails, continue without searchTerms
        }
        // Check each keyword for a match
        for (var _i = 0, keywords_1 = keywords; _i < keywords_1.length; _i++) {
            var keyword = keywords_1[_i];
            var lowerKeyword = keyword.toLowerCase();
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
                for (var _a = 0, searchTerms_1 = searchTerms; _a < searchTerms_1.length; _a++) {
                    var searchTerm = searchTerms_1[_a];
                    if (this.isFuzzyMatch(lowerKeyword, searchTerm)) {
                        matchedKeywords.push(keyword);
                        break; // Only count the first fuzzy match
                    }
                }
            }
        }
        // Calculate score based on number of matched keywords
        var matchCount = matchedKeywords.length;
        if (matchCount === 0) {
            return {
                parameter: 'keywords',
                score: 0,
                exact: false,
                reason: 'No keyword matches found'
            };
        }
        // Base score on percentage of keywords matched
        var matchPercentage = matchCount / keywords.length;
        // Boost score for exact matches (higher priority)
        if (exactMatches.length > 0) {
            matchPercentage += (exactMatches.length / keywords.length) * 0.4;
        }
        // Boost score for important matches
        if (importantMatches.length > 0) {
            matchPercentage += (importantMatches.length / keywords.length) * 0.3;
        }
        // Add bonus for matching multiple keywords
        var multiKeywordBonus = 0;
        if (matchCount > 1 && keywords.length > 1) {
            multiKeywordBonus = (matchCount / keywords.length) * 0.2;
        }
        var finalMatchPercentage = Math.min(2.0, matchPercentage + multiKeywordBonus);
        var score = Math.round(this.KEYWORD_MATCH_SCORE * finalMatchPercentage);
        var reason = "Matched ".concat(matchCount, "/").concat(keywords.length, " keywords: ").concat(matchedKeywords.join(', '));
        if (exactMatches.length > 0) {
            reason += " (exact matches: ".concat(exactMatches.join(', '), ")");
        }
        if (importantMatches.length > 0) {
            reason += " (important matches: ".concat(importantMatches.join(', '), ")");
        }
        return {
            parameter: 'keywords',
            score: score,
            exact: matchCount === keywords.length,
            reason: reason
        };
    };
    /**
     * Score voltage matches with range support
     */
    EnhancedScoringSystem.prototype.scoreVoltageMatches = function (component, keywords) {
        var matches = [];
        var description = component.description.toLowerCase();
        for (var _i = 0, keywords_2 = keywords; _i < keywords_2.length; _i++) {
            var keyword = keywords_2[_i];
            var voltageMatch = keyword.match(this.voltagePattern);
            if (voltageMatch) {
                var voltageValue = parseFloat(voltageMatch[1]);
                // Check for voltage range matches in description
                var rangeMatches = description.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*[Vv]/g);
                if (rangeMatches) {
                    for (var _a = 0, rangeMatches_1 = rangeMatches; _a < rangeMatches_1.length; _a++) {
                        var range = rangeMatches_1[_a];
                        var rangeValues = range.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
                        if (rangeValues) {
                            var minVoltage = parseFloat(rangeValues[1]);
                            var maxVoltage = parseFloat(rangeValues[2]);
                            if (voltageValue >= minVoltage && voltageValue <= maxVoltage) {
                                matches.push({
                                    parameter: 'voltage_range',
                                    score: this.VOLTAGE_MATCH_SCORE,
                                    exact: true,
                                    reason: "Voltage ".concat(voltageValue, "V matches range ").concat(minVoltage, "-").concat(maxVoltage, "V")
                                });
                                break;
                            }
                        }
                    }
                }
                // Check for exact voltage matches
                if (description.includes("".concat(voltageValue, "V")) || description.includes("".concat(voltageValue, "v"))) {
                    matches.push({
                        parameter: 'voltage_exact',
                        score: this.VOLTAGE_MATCH_SCORE,
                        exact: true,
                        reason: "Exact voltage match: ".concat(voltageValue, "V")
                    });
                }
            }
        }
        return matches;
    };
    /**
     * Score frequency matches (MHz, GHz, etc.)
     */
    EnhancedScoringSystem.prototype.scoreFrequencyMatches = function (component, keywords) {
        var _a;
        var matches = [];
        var description = component.description.toLowerCase();
        for (var _i = 0, keywords_3 = keywords; _i < keywords_3.length; _i++) {
            var keyword = keywords_3[_i];
            var freqMatch = keyword.match(this.frequencyPattern);
            if (freqMatch) {
                var freqValue = parseFloat(freqMatch[1]);
                var unit = ((_a = keyword.match(/(k|M|G)?[Hh][Zz]/)) === null || _a === void 0 ? void 0 : _a[0]) || 'Hz';
                // Check for frequency range matches
                var rangeMatches = description.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*(?:k|M|G)?[Hh][Zz]/g);
                if (rangeMatches) {
                    for (var _b = 0, rangeMatches_2 = rangeMatches; _b < rangeMatches_2.length; _b++) {
                        var range = rangeMatches_2[_b];
                        var rangeValues = range.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
                        if (rangeValues) {
                            var minFreq = parseFloat(rangeValues[1]);
                            var maxFreq = parseFloat(rangeValues[2]);
                            if (freqValue >= minFreq && freqValue <= maxFreq) {
                                matches.push({
                                    parameter: 'frequency_range',
                                    score: this.FREQUENCY_MATCH_SCORE,
                                    exact: true,
                                    reason: "Frequency ".concat(freqValue).concat(unit, " matches range ").concat(minFreq, "-").concat(maxFreq).concat(unit)
                                });
                                break;
                            }
                        }
                    }
                }
                // Check for exact frequency matches
                if (description.includes("".concat(freqValue).concat(unit))) {
                    matches.push({
                        parameter: 'frequency_exact',
                        score: this.FREQUENCY_MATCH_SCORE,
                        exact: true,
                        reason: "Exact frequency match: ".concat(freqValue).concat(unit)
                    });
                }
            }
        }
        return matches;
    };
    /**
     * Score memory size matches (bytes, KB, MB, GB)
     */
    EnhancedScoringSystem.prototype.scoreMemoryMatches = function (component, keywords) {
        var _a;
        var matches = [];
        var description = component.description.toLowerCase();
        for (var _i = 0, keywords_4 = keywords; _i < keywords_4.length; _i++) {
            var keyword = keywords_4[_i];
            var memoryMatch = keyword.match(this.memoryPattern);
            if (memoryMatch) {
                var memoryValue = parseFloat(memoryMatch[1]);
                var unit = ((_a = keyword.match(/(k|M|G)?[Bb]?[Ii][Tt]/)) === null || _a === void 0 ? void 0 : _a[0]) || 'bit';
                // Check for memory size matches in description
                if (description.includes("".concat(memoryValue).concat(unit)) || description.includes("".concat(memoryValue, " ").concat(unit))) {
                    matches.push({
                        parameter: 'memory_size',
                        score: this.MEMORY_SIZE_MATCH_SCORE,
                        exact: true,
                        reason: "Memory size match: ".concat(memoryValue).concat(unit)
                    });
                }
            }
        }
        return matches;
    };
    /**
     * Score temperature matches (°C)
     */
    EnhancedScoringSystem.prototype.scoreTemperatureMatches = function (component, keywords) {
        var matches = [];
        var description = component.description.toLowerCase();
        for (var _i = 0, keywords_5 = keywords; _i < keywords_5.length; _i++) {
            var keyword = keywords_5[_i];
            var tempMatch = keyword.match(this.temperaturePattern);
            if (tempMatch) {
                var tempValue = parseFloat(tempMatch[1]);
                // Check for temperature range matches
                var rangeMatches = description.match(/(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)\s*[°]?[Cc]/g);
                if (rangeMatches) {
                    for (var _a = 0, rangeMatches_3 = rangeMatches; _a < rangeMatches_3.length; _a++) {
                        var range = rangeMatches_3[_a];
                        var rangeValues = range.match(/(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)/);
                        if (rangeValues) {
                            var minTemp = parseFloat(rangeValues[1]);
                            var maxTemp = parseFloat(rangeValues[2]);
                            if (tempValue >= minTemp && tempValue <= maxTemp) {
                                matches.push({
                                    parameter: 'temperature_range',
                                    score: this.TEMPERATURE_MATCH_SCORE,
                                    exact: true,
                                    reason: "Temperature ".concat(tempValue, "\u00B0C matches range ").concat(minTemp, "-").concat(maxTemp, "\u00B0C")
                                });
                                break;
                            }
                        }
                    }
                }
                // Check for exact temperature matches
                if (description.includes("".concat(tempValue, "\u00B0C")) || description.includes("".concat(tempValue, "C"))) {
                    matches.push({
                        parameter: 'temperature_exact',
                        score: this.TEMPERATURE_MATCH_SCORE,
                        exact: true,
                        reason: "Exact temperature match: ".concat(tempValue, "\u00B0C")
                    });
                }
            }
        }
        return matches;
    };
    /**
     * Enhanced footprint matching with package type recognition
     */
    EnhancedScoringSystem.prototype.scoreEnhancedFootprintMatch = function (component, packageType) {
        var description = component.description.toLowerCase();
        var packageLower = packageType.toLowerCase();
        // Check for exact footprint matches
        for (var _i = 0, _a = Object.entries(this.footprintPatterns); _i < _a.length; _i++) {
            var _b = _a[_i], footprintType = _b[0], pattern = _b[1];
            if (pattern.test(packageLower) || pattern.test(description)) {
                // Check if this is an exact match
                if (packageLower.includes(footprintType.toLowerCase()) || description.includes(footprintType.toLowerCase())) {
                    return {
                        parameter: 'footprint_exact',
                        score: this.PACKAGE_MATCH_SCORE + this.FOOTPRINT_EXACT_MATCH_BONUS,
                        exact: true,
                        reason: "Exact footprint match: ".concat(footprintType)
                    };
                }
                else {
                    return {
                        parameter: 'footprint_similar',
                        score: this.PACKAGE_MATCH_SCORE + this.FOOTPRINT_SIMILAR_MATCH_BONUS,
                        exact: false,
                        reason: "Similar footprint match: ".concat(footprintType)
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
                reason: "Generic package match: ".concat(packageType)
            };
        }
        return {
            parameter: 'footprint',
            score: 0,
            exact: false,
            reason: 'No footprint match found'
        };
    };
    /**
     * Enhanced manufacturer matching
     */
    EnhancedScoringSystem.prototype.scoreManufacturerMatch = function (component, parameters) {
        if (!parameters.keywords)
            return null;
        var mfr = component.mfr.toLowerCase();
        var manufacturer = component.manufacturer.toLowerCase();
        // Common manufacturer variations
        var manufacturerVariations = {
            'sensirion': ['sensiron', 'sensirion'],
            'stmicro': ['st', 'stmicroelectronics'],
            'ti': ['texas instruments', 'texas'],
            'analog devices': ['adi', 'analog'],
            'maxim': ['maxim integrated'],
            'microchip': ['microchip technology'],
            'nxp': ['nxp semiconductors'],
            'infineon': ['infineon technologies']
        };
        for (var _i = 0, _a = parameters.keywords; _i < _a.length; _i++) {
            var keyword = _a[_i];
            var lowerKeyword = keyword.toLowerCase();
            // Check for exact manufacturer name matches (not part number)
            if (manufacturer.includes(lowerKeyword)) {
                return {
                    parameter: 'manufacturer',
                    score: this.MANUFACTURER_MATCH_SCORE,
                    exact: true,
                    reason: "Manufacturer match: ".concat(keyword)
                };
            }
            // Check for manufacturer variations
            for (var _b = 0, _c = Object.entries(manufacturerVariations); _b < _c.length; _b++) {
                var _d = _c[_b], manufacturerName = _d[0], variations = _d[1];
                if (variations.includes(lowerKeyword) || lowerKeyword.includes(manufacturerName)) {
                    return {
                        parameter: 'manufacturer_variation',
                        score: this.MANUFACTURER_MATCH_SCORE,
                        exact: false,
                        reason: "Manufacturer variation match: ".concat(keyword, " \u2192 ").concat(manufacturerName)
                    };
                }
            }
            // Check for part number matches (separate from manufacturer)
            if (mfr.includes(lowerKeyword)) {
                return {
                    parameter: 'part_number',
                    score: this.MANUFACTURER_MATCH_SCORE,
                    exact: true,
                    reason: "Part number match: ".concat(keyword)
                };
            }
        }
        return null;
    };
    /**
     * Enhanced category matching
     */
    EnhancedScoringSystem.prototype.scoreCategoryMatch = function (component, parameters) {
        if (!parameters.keywords)
            return null;
        var category = component.category.toLowerCase();
        for (var _i = 0, _a = parameters.keywords; _i < _a.length; _i++) {
            var keyword = _a[_i];
            var lowerKeyword = keyword.toLowerCase();
            if (category.includes(lowerKeyword)) {
                return {
                    parameter: 'category',
                    score: this.CATEGORY_MATCH_SCORE,
                    exact: true,
                    reason: "Category match: ".concat(keyword, " in ").concat(component.category)
                };
            }
        }
        return null;
    };
    /**
     * Score component type matching with penalties for mismatches
     */
    EnhancedScoringSystem.prototype.scoreComponentTypeMatch = function (component, targetType) {
        var description = component.description.toLowerCase();
        var mfr = component.mfr.toLowerCase();
        var targetTypeLower = targetType.toLowerCase();
        // Parse extra field to get library information
        var library = '';
        try {
            var extraData = JSON.parse(component.extra);
            if (extraData.library) {
                library = extraData.library.toLowerCase();
            }
        }
        catch (error) {
            // If parsing fails, continue without library info
        }
        // First, check for negative matches (components that contain the word but are NOT that type)
        var negativeMatches = {
            'inductor': ['inductor-less', 'inductorless', 'without inductor', 'no inductor'],
            'resistor': ['potentiometer', 'variable resistor', 'rheostat', 'pot'],
            'capacitor': ['varactor', 'variable capacitor'],
            'diode': ['led', 'light emitting diode'],
            'transistor': ['thyristor', 'triac', 'scr']
        };
        if (negativeMatches[targetTypeLower]) {
            for (var _i = 0, _a = negativeMatches[targetTypeLower]; _i < _a.length; _i++) {
                var negativeMatch = _a[_i];
                if (description.includes(negativeMatch) || mfr.includes(negativeMatch)) {
                    return {
                        parameter: 'component_type',
                        score: this.TYPE_MISMATCH_PENALTY,
                        exact: false,
                        reason: "Component type mismatch: searching for ".concat(targetType, " but found ").concat(negativeMatch)
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
                    reason: "Component type mismatch: searching for resistor but found potentiometer/variable component"
                };
            }
        }
        // Check for exact description match (highest priority)
        if (description === targetTypeLower) {
            var bonus = 0;
            // Extra bonus for Device library (basic components)
            if (library === 'device') {
                bonus = 50;
            }
            return {
                parameter: 'component_type',
                score: this.TYPE_MATCH_SCORE + bonus,
                exact: true,
                reason: "Perfect component type match: ".concat(targetType).concat(bonus > 0 ? ' (Device library bonus)' : '')
            };
        }
        // Check if the component description starts with the target type (high priority)
        if (description.startsWith(targetTypeLower)) {
            var bonus = 0;
            // Extra bonus for Device library (basic components)
            if (library === 'device') {
                bonus = 30;
            }
            return {
                parameter: 'component_type',
                score: this.TYPE_MATCH_SCORE + bonus,
                exact: true,
                reason: "Component type starts with match: ".concat(targetType).concat(bonus > 0 ? ' (Device library bonus)' : '')
            };
        }
        // Check if the component description contains the target type (medium priority)
        if (description.includes(targetTypeLower)) {
            var bonus = 0;
            // Extra bonus for Device library (basic components)
            if (library === 'device') {
                bonus = 20;
            }
            return {
                parameter: 'component_type',
                score: this.TYPE_MATCH_SCORE + bonus,
                exact: false,
                reason: "Component type contains match: ".concat(targetType).concat(bonus > 0 ? ' (Device library bonus)' : '')
            };
        }
        // Check for common variations
        var typeVariations = {
            'resistor': ['resistor', 'r_', 'resistance'],
            'capacitor': ['capacitor', 'c_', 'capacitance'],
            'inductor': ['inductor', 'l_', 'inductance'],
            'diode': ['diode', 'd_'],
            'transistor': ['transistor', 'q_', 'bjt', 'mosfet'],
            'ic': ['ic', 'integrated circuit', 'u_'],
            'connector': ['connector', 'j_', 'header', 'socket'],
            'switch': ['switch', 'sw_', 'button'],
            'crystal': ['crystal', 'oscillator', 'xtal'],
            'fuse': ['fuse', 'f_']
        };
        // Check for type variations
        if (typeVariations[targetTypeLower]) {
            for (var _b = 0, _c = typeVariations[targetTypeLower]; _b < _c.length; _b++) {
                var variation = _c[_b];
                if (description.includes(variation) || mfr.includes(variation)) {
                    var bonus = 0;
                    // Extra bonus for Device library (basic components)
                    if (library === 'device') {
                        bonus = 15;
                    }
                    return {
                        parameter: 'component_type',
                        score: this.TYPE_MATCH_SCORE + bonus,
                        exact: false,
                        reason: "Component type variation match: ".concat(targetType, " (").concat(variation, ")").concat(bonus > 0 ? ' (Device library bonus)' : '')
                    };
                }
            }
        }
        return {
            parameter: 'component_type',
            score: 0,
            exact: false,
            reason: "No component type match for: ".concat(targetType)
        };
    };
    /**
     * Calculate multi-parameter bonus
     */
    EnhancedScoringSystem.prototype.calculateParameterBonus = function (matchDetails) {
        var validMatches = matchDetails.filter(function (match) { return match.score > 0; });
        if (validMatches.length === 0)
            return 0;
        // Bonus for multiple parameter matches
        var bonus = (validMatches.length - 1) * this.PARAMETER_COUNT_BONUS;
        // Perfect match bonus (all parameters matched)
        var exactMatches = validMatches.filter(function (match) { return match.exact; });
        if (exactMatches.length === validMatches.length && validMatches.length > 1) {
            bonus += this.PERFECT_MATCH_BONUS;
        }
        return bonus;
    };
    /**
     * Calculate simplicity bonus (prioritize simple components over complex ones)
     */
    EnhancedScoringSystem.prototype.calculateSimplicityBonus = function (component, parameters) {
        var description = component.description.toLowerCase();
        var mfr = component.mfr.toLowerCase();
        // Parse extra field to get library information
        var library = '';
        try {
            var extraData = JSON.parse(component.extra);
            if (extraData.library) {
                library = extraData.library.toLowerCase();
            }
        }
        catch (error) {
            // If parsing fails, continue without library info
        }
        // Bonus for Device library components (basic components)
        var deviceLibraryBonus = 0;
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
            var complexIndicators = [
                'amplifier', 'converter', 'regulator', 'controller', 'processor', 'driver',
                'switch', 'multiplexer', 'buffer', 'interface', 'transceiver', 'modem'
            ];
            for (var _i = 0, complexIndicators_1 = complexIndicators; _i < complexIndicators_1.length; _i++) {
                var indicator = complexIndicators_1[_i];
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
    };
    /**
     * Fuzzy matching using Levenshtein distance
     */
    EnhancedScoringSystem.prototype.isFuzzyMatch = function (query, target) {
        var distance = this.levenshteinDistance(query, target);
        var maxLength = Math.max(query.length, target.length);
        var similarity = 1 - (distance / maxLength);
        return similarity >= 0.8; // 80% similarity threshold
    };
    /**
     * Calculate Levenshtein distance between two strings
     */
    EnhancedScoringSystem.prototype.levenshteinDistance = function (str1, str2) {
        var matrix = Array(str2.length + 1).fill(null).map(function () { return Array(str1.length + 1).fill(null); });
        for (var i = 0; i <= str1.length; i++)
            matrix[0][i] = i;
        for (var j = 0; j <= str2.length; j++)
            matrix[j][0] = j;
        for (var j = 1; j <= str2.length; j++) {
            for (var i = 1; i <= str1.length; i++) {
                var indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
                matrix[j][i] = Math.min(matrix[j][i - 1] + 1, // deletion
                matrix[j - 1][i] + 1, // insertion
                matrix[j - 1][i - 1] + indicator // substitution
                );
            }
        }
        return matrix[str2.length][str1.length];
    };
    return EnhancedScoringSystem;
}());
exports.EnhancedScoringSystem = EnhancedScoringSystem;
