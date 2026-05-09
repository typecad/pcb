"use strict";
/**
 * Converter for transforming KiCad symbol data into ComponentRecord format
 * Maintains compatibility with the existing search engine and data structures
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.KiCadSymbolConverter = void 0;
/**
 * Default conversion options
 */
var DEFAULT_CONVERSION_OPTIONS = {
    defaultManufacturer: 'KiCad',
    defaultPackage: 'Symbol',
    includeFilePath: true,
    includeMetadata: true,
    generateSearchableExtra: true
};
/**
 * Converter for KiCad symbols to ComponentRecord format
 */
var KiCadSymbolConverter = /** @class */ (function () {
    function KiCadSymbolConverter(options) {
        if (options === void 0) { options = {}; }
        this.statistics = {
            symbolsConverted: 0,
            symbolsWithDescriptions: 0,
            symbolsWithKeywords: 0,
            uniqueLibraries: 0,
            conversionTime: 0,
            libraryDistribution: {}
        };
        this.options = __assign(__assign({}, DEFAULT_CONVERSION_OPTIONS), options);
        this.resetStatistics();
    }
    /**
     * Convert array of extracted symbols to ComponentRecord format
     * @param extractedSymbols - Array of extracted symbols
     * @returns Array of component records
     */
    KiCadSymbolConverter.prototype.convertSymbolsToComponentRecords = function (extractedSymbols) {
        var startTime = Date.now();
        this.resetStatistics();
        var componentRecords = [];
        var libraryCount = {};
        for (var _i = 0, extractedSymbols_1 = extractedSymbols; _i < extractedSymbols_1.length; _i++) {
            var symbol = extractedSymbols_1[_i];
            try {
                var componentRecord = this.convertSingleSymbol(symbol);
                componentRecords.push(componentRecord);
                this.statistics.symbolsConverted++;
                if (symbol.hasDescription) {
                    this.statistics.symbolsWithDescriptions++;
                }
                if (symbol.hasKeywords) {
                    this.statistics.symbolsWithKeywords++;
                }
                // Track library distribution
                libraryCount[symbol.library] = (libraryCount[symbol.library] || 0) + 1;
            }
            catch (error) {
                console.warn("Failed to convert symbol ".concat(symbol.name, " from ").concat(symbol.library, ": ").concat(error instanceof Error ? error.message : String(error)));
                continue;
            }
        }
        this.statistics.uniqueLibraries = Object.keys(libraryCount).length;
        this.statistics.libraryDistribution = libraryCount;
        this.statistics.conversionTime = Date.now() - startTime;
        return componentRecords;
    };
    /**
     * Convert a single extracted symbol to ComponentRecord format
     * @param symbol - Extracted symbol to convert
     * @returns Component record
     * @private
     */
    KiCadSymbolConverter.prototype.convertSingleSymbol = function (symbol) {
        var _a;
        // Generate unique identifier in library:symbol format
        var lcsc = "".concat(symbol.library, ":").concat(symbol.name);
        // Use library as category, with optional mapping
        var category = ((_a = this.options.categoryMapping) === null || _a === void 0 ? void 0 : _a[symbol.library]) || symbol.library;
        // Build description with fallback
        var description = this.buildDescription(symbol);
        // Build extra data object
        var extraData = this.buildExtraData(symbol);
        // Create formatted timestamp
        var timestamp = new Date().toISOString();
        var componentRecord = {
            lcsc: lcsc,
            category_id: symbol.library,
            category: category,
            subcategory: 'Schematic Symbol',
            mfr: symbol.name,
            package: this.options.defaultPackage,
            joints: '0', // Symbols don't have physical joints
            manufacturer: this.options.defaultManufacturer,
            basic: '1', // All KiCad symbols are considered basic
            preferred: '1', // All KiCad symbols are preferred for schematic use
            description: description,
            datasheet: '', // KiCad symbols typically don't include datasheets
            stock: '∞', // Unlimited availability for symbols
            last_on_stock: timestamp,
            price: '[]', // Free symbols
            extra: JSON.stringify(extraData),
            assembly_process: 'N/A', // Not applicable for symbols
            min_order_qty: '0',
            attrition_qty: '0'
        };
        return componentRecord;
    };
    /**
     * Build description from symbol data with fallback options
     * @param symbol - Extracted symbol
     * @returns Description string
     * @private
     */
    KiCadSymbolConverter.prototype.buildDescription = function (symbol) {
        var parts = [];
        // Primary description from symbol
        if (symbol.description && symbol.description.trim()) {
            parts.push(symbol.description.trim());
        }
        // Add library context if no description
        if (parts.length === 0) {
            parts.push("Symbol from ".concat(symbol.library, " library"));
        }
        // Add keywords as additional context if available and not already in description
        if (symbol.keywords && symbol.keywords.trim()) {
            var keywords = symbol.keywords.trim();
            var description = parts[0].toLowerCase();
            // Only add keywords if they provide additional information
            if (!description.includes(keywords.toLowerCase())) {
                parts.push("Keywords: ".concat(keywords));
            }
        }
        return parts.join(' - ');
    };
    /**
     * Build extra data object with symbol metadata
     * @param symbol - Extracted symbol
     * @returns Extra data object
     * @private
     */
    KiCadSymbolConverter.prototype.buildExtraData = function (symbol) {
        var extraData = {
            symbolType: 'schematic',
            library: symbol.library,
            source: 'local_files'
        };
        // Include original description if different from processed description
        if (symbol.description) {
            extraData.originalDescription = symbol.description;
        }
        // Include keywords
        if (symbol.keywords) {
            extraData.keywords = symbol.keywords;
            // Split keywords for easier searching
            extraData.keywordList = symbol.keywords.split(/\s+/).filter(function (k) { return k.length > 0; });
        }
        // Include file metadata if enabled
        if (this.options.includeFilePath) {
            extraData.sourceFile = symbol.relativePath;
            extraData.fileModified = symbol.fileModified.toISOString();
        }
        // Include processing metadata if enabled
        if (this.options.includeMetadata) {
            extraData.hasDescription = symbol.hasDescription;
            extraData.hasKeywords = symbol.hasKeywords;
            extraData.processingDate = new Date().toISOString();
        }
        // Include searchable data if enabled
        if (this.options.generateSearchableExtra) {
            extraData.searchText = symbol.searchText;
            extraData.searchTerms = this.generateSearchTerms(symbol);
        }
        // Include all properties for advanced users
        if (symbol.properties && symbol.properties.length > 0) {
            extraData.properties = symbol.properties.map(function (prop) { return ({
                name: prop.name,
                value: prop.value
            }); });
        }
        return extraData;
    };
    /**
     * Generate search terms from symbol data
     * @param symbol - Extracted symbol
     * @returns Array of search terms
     * @private
     */
    KiCadSymbolConverter.prototype.generateSearchTerms = function (symbol) {
        var terms = new Set();
        // Add symbol name parts
        var nameParts = symbol.name.split(/[_\-\s]+/).filter(function (part) { return part.length > 1; });
        nameParts.forEach(function (part) { return terms.add(part.toLowerCase()); });
        // Add library name
        terms.add(symbol.library.toLowerCase());
        // Add description words
        if (symbol.description) {
            var descWords = symbol.description
                .split(/\s+/)
                .filter(function (word) { return word.length > 2; })
                .map(function (word) { return word.toLowerCase().replace(/[^a-z0-9]/g, ''); });
            descWords.forEach(function (word) {
                if (word.length > 2) {
                    terms.add(word);
                }
            });
        }
        // Add keywords
        if (symbol.keywords) {
            var keywords = symbol.keywords
                .split(/\s+/)
                .filter(function (keyword) { return keyword.length > 1; })
                .map(function (keyword) { return keyword.toLowerCase(); });
            keywords.forEach(function (keyword) { return terms.add(keyword); });
        }
        return Array.from(terms);
    };
    /**
     * Get conversion statistics from the last operation
     * @returns Conversion statistics
     */
    KiCadSymbolConverter.prototype.getStatistics = function () {
        return __assign({}, this.statistics);
    };
    /**
     * Reset conversion statistics
     * @private
     */
    KiCadSymbolConverter.prototype.resetStatistics = function () {
        this.statistics = {
            symbolsConverted: 0,
            symbolsWithDescriptions: 0,
            symbolsWithKeywords: 0,
            uniqueLibraries: 0,
            conversionTime: 0,
            libraryDistribution: {}
        };
    };
    /**
     * Get a human-readable summary of the conversion results
     * @returns Formatted summary string
     */
    KiCadSymbolConverter.prototype.getConversionSummary = function () {
        var stats = this.statistics;
        var conversionTimeSeconds = (stats.conversionTime / 1000).toFixed(2);
        var averagePerSymbol = stats.symbolsConverted > 0
            ? (stats.conversionTime / stats.symbolsConverted).toFixed(2)
            : '0';
        var summary = "Conversion Summary:\n";
        summary += "  Symbols converted: ".concat(stats.symbolsConverted, "\n");
        summary += "  Symbols with descriptions: ".concat(stats.symbolsWithDescriptions, "\n");
        summary += "  Symbols with keywords: ".concat(stats.symbolsWithKeywords, "\n");
        summary += "  Unique libraries: ".concat(stats.uniqueLibraries, "\n");
        summary += "  Conversion time: ".concat(conversionTimeSeconds, " seconds\n");
        summary += "  Average time per symbol: ".concat(averagePerSymbol, " ms\n");
        if (stats.uniqueLibraries > 0) {
            summary += "\nTop 10 Libraries by Symbol Count:\n";
            var sortedLibraries = Object.entries(stats.libraryDistribution)
                .sort(function (_a, _b) {
                var a = _a[1];
                var b = _b[1];
                return b - a;
            })
                .slice(0, 10);
            sortedLibraries.forEach(function (_a) {
                var library = _a[0], count = _a[1];
                summary += "  ".concat(library, ": ").concat(count, " symbols\n");
            });
        }
        return summary;
    };
    /**
     * Validate that a ComponentRecord is properly formatted
     * @param record - Component record to validate
     * @returns True if valid
     * @static
     */
    KiCadSymbolConverter.validateComponentRecord = function (record) {
        // Check required fields
        var requiredFields = ['lcsc', 'category', 'description', 'manufacturer'];
        for (var _i = 0, requiredFields_1 = requiredFields; _i < requiredFields_1.length; _i++) {
            var field = requiredFields_1[_i];
            if (!record[field] ||
                String(record[field]).trim().length === 0) {
                return false;
            }
        }
        // Validate JSON fields
        try {
            JSON.parse(record.extra);
        }
        catch (_a) {
            return false;
        }
        return true;
    };
    return KiCadSymbolConverter;
}());
exports.KiCadSymbolConverter = KiCadSymbolConverter;
