"use strict";
/**
 * Extractor for processing KiCad symbol files and extracting symbol definitions
 * Combines file reading with S-Expression parsing to extract structured symbol data
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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.KiCadSymbolExtractor = void 0;
var node_fs_1 = require("node:fs");
var node_path_1 = require("node:path");
var SExpressionParser_js_1 = require("./SExpressionParser.js");
/**
 * Default extraction options
 */
var DEFAULT_EXTRACTION_OPTIONS = {
    includeWithoutDescription: true,
    includeWithoutKeywords: true,
    maxFileSize: 10 * 1024 * 1024, // 10MB limit
    encoding: 'utf8',
    continueOnError: true,
    strictValidation: false
};
/**
 * KiCad symbol extractor for processing symbol files
 */
var KiCadSymbolExtractor = /** @class */ (function () {
    function KiCadSymbolExtractor(options) {
        if (options === void 0) { options = {}; }
        this.statistics = {
            filesProcessed: 0,
            filesWithErrors: 0,
            symbolsExtracted: 0,
            symbolsWithDescriptions: 0,
            symbolsWithKeywords: 0,
            processingTime: 0,
            errors: []
        };
        this.parser = new SExpressionParser_js_1.SExpressionParser();
        this.options = __assign(__assign({}, DEFAULT_EXTRACTION_OPTIONS), options);
        this.resetStatistics();
    }
    /**
     * Extract symbols from a list of symbol files
     * @param symbolFiles - Array of symbol file information
     * @returns Promise resolving to array of extracted symbols
     */
    KiCadSymbolExtractor.prototype.extractSymbolsFromFiles = function (symbolFiles) {
        return __awaiter(this, void 0, void 0, function () {
            var startTime, extractedSymbols, _i, symbolFiles_1, fileInfo, symbols, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        startTime = Date.now();
                        this.resetStatistics();
                        extractedSymbols = [];
                        _i = 0, symbolFiles_1 = symbolFiles;
                        _a.label = 1;
                    case 1:
                        if (!(_i < symbolFiles_1.length)) return [3 /*break*/, 6];
                        fileInfo = symbolFiles_1[_i];
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, this.extractSymbolsFromFile(fileInfo)];
                    case 3:
                        symbols = _a.sent();
                        extractedSymbols.push.apply(extractedSymbols, symbols);
                        this.statistics.filesProcessed++;
                        return [3 /*break*/, 5];
                    case 4:
                        error_1 = _a.sent();
                        this.handleFileError(fileInfo, error_1);
                        if (!this.options.continueOnError) {
                            throw error_1;
                        }
                        return [3 /*break*/, 5];
                    case 5:
                        _i++;
                        return [3 /*break*/, 1];
                    case 6:
                        this.statistics.processingTime = Date.now() - startTime;
                        return [2 /*return*/, extractedSymbols];
                }
            });
        });
    };
    /**
     * Extract symbols from a single file
     * @param fileInfo - Information about the symbol file
     * @returns Promise resolving to array of extracted symbols from the file
     */
    KiCadSymbolExtractor.prototype.extractSymbolsFromFile = function (fileInfo) {
        return __awaiter(this, void 0, void 0, function () {
            var content, error_2, symbolDefinitions, extractedSymbols, libraryName, _i, symbolDefinitions_1, symbolDef, extractedSymbol, extractionError;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        // Check file size limit
                        if (this.options.maxFileSize > 0 && fileInfo.size > this.options.maxFileSize) {
                            throw new Error("File size (".concat(fileInfo.size, " bytes) exceeds limit (").concat(this.options.maxFileSize, " bytes)"));
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, node_fs_1.default.promises.readFile(fileInfo.filePath, { encoding: this.options.encoding })];
                    case 2:
                        content = _a.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        error_2 = _a.sent();
                        throw new Error("Failed to read file: ".concat(error_2 instanceof Error ? error_2.message : String(error_2)));
                    case 4:
                        try {
                            symbolDefinitions = this.parser.parseSymbolFile(content);
                        }
                        catch (error) {
                            throw new Error("Failed to parse symbols: ".concat(error instanceof Error ? error.message : String(error)));
                        }
                        extractedSymbols = [];
                        libraryName = this.extractLibraryName(fileInfo);
                        for (_i = 0, symbolDefinitions_1 = symbolDefinitions; _i < symbolDefinitions_1.length; _i++) {
                            symbolDef = symbolDefinitions_1[_i];
                            try {
                                extractedSymbol = this.createExtractedSymbol(symbolDef, fileInfo, libraryName);
                                // Apply filtering based on options
                                if (this.shouldIncludeSymbol(extractedSymbol)) {
                                    extractedSymbols.push(extractedSymbol);
                                    this.statistics.symbolsExtracted++;
                                    if (extractedSymbol.hasDescription) {
                                        this.statistics.symbolsWithDescriptions++;
                                    }
                                    if (extractedSymbol.hasKeywords) {
                                        this.statistics.symbolsWithKeywords++;
                                    }
                                }
                            }
                            catch (error) {
                                extractionError = {
                                    file: fileInfo.filePath,
                                    message: error instanceof Error ? error.message : String(error),
                                    symbolName: symbolDef.name,
                                    type: 'invalid_format'
                                };
                                this.statistics.errors.push(extractionError);
                                if (!this.options.continueOnError) {
                                    throw error;
                                }
                            }
                        }
                        return [2 /*return*/, extractedSymbols];
                }
            });
        });
    };
    /**
     * Get extraction statistics from the last operation
     * @returns Extraction statistics
     */
    KiCadSymbolExtractor.prototype.getStatistics = function () {
        return __assign({}, this.statistics);
    };
    /**
     * Create an ExtractedSymbol from a SymbolDefinition
     * @param symbolDef - Symbol definition from parser
     * @param fileInfo - File information
     * @param libraryName - Library name derived from file
     * @returns Extended symbol with metadata
     * @private
     */
    KiCadSymbolExtractor.prototype.createExtractedSymbol = function (symbolDef, fileInfo, libraryName) {
        var hasDescription = Boolean(symbolDef.description && symbolDef.description.trim().length > 0);
        var hasKeywords = Boolean(symbolDef.keywords && symbolDef.keywords.trim().length > 0);
        // Create combined search text
        var searchParts = [];
        if (symbolDef.description) {
            searchParts.push(symbolDef.description);
        }
        if (symbolDef.keywords) {
            searchParts.push(symbolDef.keywords);
        }
        searchParts.push(symbolDef.name);
        searchParts.push(libraryName);
        var searchText = searchParts.join(' ').toLowerCase();
        return __assign(__assign({}, symbolDef), { library: libraryName, sourceFile: fileInfo.filePath, relativePath: fileInfo.relativePath, fileModified: fileInfo.lastModified, hasDescription: hasDescription, hasKeywords: hasKeywords, searchText: searchText });
    };
    /**
     * Extract library name from file information
     * @param fileInfo - File information
     * @returns Library name
     * @private
     */
    KiCadSymbolExtractor.prototype.extractLibraryName = function (fileInfo) {
        // Use the file name without extension as the library name
        return fileInfo.fileName;
    };
    /**
     * Check if a symbol should be included based on options
     * @param symbol - Symbol to check
     * @returns True if symbol should be included
     * @private
     */
    KiCadSymbolExtractor.prototype.shouldIncludeSymbol = function (symbol) {
        if (!this.options.includeWithoutDescription && !symbol.hasDescription) {
            return false;
        }
        if (!this.options.includeWithoutKeywords && !symbol.hasKeywords) {
            return false;
        }
        // Additional validation if strict mode is enabled
        if (this.options.strictValidation) {
            if (!symbol.name || symbol.name.trim().length === 0) {
                return false;
            }
        }
        return true;
    };
    /**
     * Handle file processing errors
     * @param fileInfo - File that caused the error
     * @param error - Error that occurred
     * @private
     */
    KiCadSymbolExtractor.prototype.handleFileError = function (fileInfo, error) {
        this.statistics.filesWithErrors++;
        var errorType = 'parse_error';
        var errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('Failed to read file')) {
            errorType = 'file_read_error';
        }
        else if (errorMessage.includes('encoding') || errorMessage.includes('decode')) {
            errorType = 'encoding_error';
        }
        else if (errorMessage.includes('Invalid KiCad symbol file')) {
            errorType = 'invalid_format';
        }
        var extractionError = {
            file: fileInfo.filePath,
            message: errorMessage,
            type: errorType
        };
        this.statistics.errors.push(extractionError);
    };
    /**
     * Reset extraction statistics
     * @private
     */
    KiCadSymbolExtractor.prototype.resetStatistics = function () {
        this.statistics = {
            filesProcessed: 0,
            filesWithErrors: 0,
            symbolsExtracted: 0,
            symbolsWithDescriptions: 0,
            symbolsWithKeywords: 0,
            processingTime: 0,
            errors: []
        };
    };
    /**
     * Get a human-readable summary of the extraction results
     * @returns Formatted summary string
     */
    KiCadSymbolExtractor.prototype.getExtractionSummary = function () {
        var stats = this.statistics;
        var processingTimeSeconds = (stats.processingTime / 1000).toFixed(2);
        var successRate = stats.filesProcessed > 0
            ? ((stats.filesProcessed - stats.filesWithErrors) / stats.filesProcessed * 100).toFixed(1)
            : '0';
        var summary = "Extraction Summary:\n";
        summary += "  Files processed: ".concat(stats.filesProcessed, "\n");
        summary += "  Files with errors: ".concat(stats.filesWithErrors, "\n");
        summary += "  Success rate: ".concat(successRate, "%\n");
        summary += "  Symbols extracted: ".concat(stats.symbolsExtracted, "\n");
        summary += "  Symbols with descriptions: ".concat(stats.symbolsWithDescriptions, "\n");
        summary += "  Symbols with keywords: ".concat(stats.symbolsWithKeywords, "\n");
        summary += "  Processing time: ".concat(processingTimeSeconds, " seconds\n");
        if (stats.errors.length > 0) {
            summary += "\nErrors encountered:\n";
            var errorsByType = this.groupErrorsByType();
            for (var _i = 0, _a = Object.entries(errorsByType); _i < _a.length; _i++) {
                var _b = _a[_i], type = _b[0], count = _b[1];
                summary += "  ".concat(type, ": ").concat(count, "\n");
            }
            if (stats.errors.length <= 3) {
                summary += "\nError details:\n";
                stats.errors.forEach(function (error) {
                    summary += "  - ".concat(node_path_1.default.basename(error.file), ": ").concat(error.message, "\n");
                });
            }
        }
        return summary;
    };
    /**
     * Group errors by type for summary reporting
     * @returns Object with error counts by type
     * @private
     */
    KiCadSymbolExtractor.prototype.groupErrorsByType = function () {
        var errorCounts = {};
        for (var _i = 0, _a = this.statistics.errors; _i < _a.length; _i++) {
            var error = _a[_i];
            errorCounts[error.type] = (errorCounts[error.type] || 0) + 1;
        }
        return errorCounts;
    };
    return KiCadSymbolExtractor;
}());
exports.KiCadSymbolExtractor = KiCadSymbolExtractor;
