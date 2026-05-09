"use strict";
/**
 * Local data processor for KiCad symbol files
 * Orchestrates the complete pipeline from symbol discovery to data extraction
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
exports.KiCadLocalDataProcessor = void 0;
var kicad_js_1 = require("../../kicad.js");
var KiCadSymbolFileScanner_js_1 = require("./KiCadSymbolFileScanner.js");
var KiCadSymbolExtractor_js_1 = require("./KiCadSymbolExtractor.js");
/**
 * Default processing configuration
 */
var DEFAULT_PROCESSING_CONFIG = {
    scanOptions: {
        recursive: true,
        maxDepth: 10,
        followSymlinks: false,
        excludePatterns: ['.git', '.svn', '__pycache__', 'backup', 'cache']
    },
    extractionOptions: {
        includeWithoutDescription: true,
        includeWithoutKeywords: true,
        continueOnError: true,
        strictValidation: false
    },
    enableProgress: true,
    progressInterval: 1000
};
/**
 * Local data processor for KiCad symbols
 */
var KiCadLocalDataProcessor = /** @class */ (function () {
    function KiCadLocalDataProcessor(config) {
        if (config === void 0) { config = {}; }
        this.startTime = 0;
        this.kicad = new kicad_js_1.KiCAD();
        this.config = __assign(__assign({}, DEFAULT_PROCESSING_CONFIG), config);
        this.statistics = this.initializeStatistics();
    }
    /**
     * Process all local KiCad symbol files and extract symbol data
     * @param progressCallback - Optional callback for progress updates
     * @returns Promise resolving to array of extracted symbols
     */
    KiCadLocalDataProcessor.prototype.processLocalSymbols = function (progressCallback) {
        return __awaiter(this, void 0, void 0, function () {
            var symbolsPath, symbolFiles, extractedSymbols, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.startTime = Date.now();
                        this.progressCallback = progressCallback;
                        this.statistics = this.initializeStatistics();
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 5, , 6]);
                        // Phase 1: Initialize and check KiCad installation
                        this.reportProgress({
                            phase: 'initializing',
                            step: 'Checking KiCad installation',
                            percentage: 5,
                            filesProcessed: 0,
                            totalFiles: 0,
                            symbolsExtracted: 0
                        });
                        return [4 /*yield*/, this.findSymbolsPath()];
                    case 2:
                        symbolsPath = _a.sent();
                        this.statistics.symbolsPath = symbolsPath;
                        // Phase 2: Scan for symbol files
                        this.reportProgress({
                            phase: 'scanning',
                            step: 'Scanning for symbol files',
                            percentage: 10,
                            filesProcessed: 0,
                            totalFiles: 0,
                            symbolsExtracted: 0
                        });
                        return [4 /*yield*/, this.scanForSymbolFiles(symbolsPath)];
                    case 3:
                        symbolFiles = _a.sent();
                        this.updateScanStatistics(symbolFiles);
                        // Phase 3: Extract symbols from files
                        this.reportProgress({
                            phase: 'extracting',
                            step: 'Extracting symbol definitions',
                            percentage: 20,
                            filesProcessed: 0,
                            totalFiles: symbolFiles.length,
                            symbolsExtracted: 0
                        });
                        return [4 /*yield*/, this.extractSymbols(symbolFiles)];
                    case 4:
                        extractedSymbols = _a.sent();
                        this.updateExtractionStatistics();
                        // Phase 4: Complete
                        this.reportProgress({
                            phase: 'completed',
                            step: 'Processing completed successfully',
                            percentage: 100,
                            filesProcessed: symbolFiles.length,
                            totalFiles: symbolFiles.length,
                            symbolsExtracted: extractedSymbols.length
                        });
                        this.statistics.totalProcessingTime = Date.now() - this.startTime;
                        return [2 /*return*/, extractedSymbols];
                    case 5:
                        error_1 = _a.sent();
                        this.reportProgress({
                            phase: 'error',
                            step: "Error: ".concat(error_1 instanceof Error ? error_1.message : String(error_1)),
                            percentage: 0,
                            filesProcessed: 0,
                            totalFiles: 0,
                            symbolsExtracted: 0
                        });
                        this.statistics.totalProcessingTime = Date.now() - this.startTime;
                        throw error_1;
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get processing statistics from the last operation
     * @returns Processing statistics
     */
    KiCadLocalDataProcessor.prototype.getStatistics = function () {
        return __assign({}, this.statistics);
    };
    /**
     * Check if local KiCad symbols are available
     * @returns Promise resolving to true if symbols are available
     */
    KiCadLocalDataProcessor.prototype.areLocalSymbolsAvailable = function () {
        return __awaiter(this, void 0, void 0, function () {
            var symbolsPath, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, , 4]);
                        return [4 /*yield*/, this.findSymbolsPath()];
                    case 1:
                        symbolsPath = _a.sent();
                        return [4 /*yield*/, this.kicad.hasLocalSymbols()];
                    case 2: return [2 /*return*/, _a.sent()];
                    case 3:
                        error_2 = _a.sent();
                        return [2 /*return*/, false];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get the path to KiCad symbols directory
     * @returns Promise resolving to symbols path
     */
    KiCadLocalDataProcessor.prototype.getSymbolsPath = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.findSymbolsPath()];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    /**
     * Find the KiCad symbols directory path
     * @returns Promise resolving to symbols directory path
     * @private
     */
    KiCadLocalDataProcessor.prototype.findSymbolsPath = function () {
        return __awaiter(this, void 0, void 0, function () {
            var symbolsPath;
            return __generator(this, function (_a) {
                // Use custom path if provided
                if (this.config.customSymbolsPath) {
                    return [2 /*return*/, this.config.customSymbolsPath];
                }
                symbolsPath = this.kicad.getSymbolsPath();
                if (!symbolsPath) {
                    throw new Error('KiCad installation not found or symbols directory not accessible');
                }
                this.statistics.kicadPath = symbolsPath;
                return [2 /*return*/, symbolsPath];
            });
        });
    };
    /**
     * Scan for symbol files in the symbols directory
     * @param symbolsPath - Path to symbols directory
     * @returns Promise resolving to array of symbol file information
     * @private
     */
    KiCadLocalDataProcessor.prototype.scanForSymbolFiles = function (symbolsPath) {
        return __awaiter(this, void 0, void 0, function () {
            var scanner, scanStartTime, symbolFiles, scanStats;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        scanner = new KiCadSymbolFileScanner_js_1.KiCadSymbolFileScanner(symbolsPath, this.config.scanOptions);
                        scanStartTime = Date.now();
                        return [4 /*yield*/, scanner.scanForSymbolFiles()];
                    case 1:
                        symbolFiles = _a.sent();
                        scanStats = scanner.getStatistics();
                        this.reportProgress({
                            phase: 'scanning',
                            step: "Found ".concat(symbolFiles.length, " symbol files"),
                            percentage: 15,
                            filesProcessed: 0,
                            totalFiles: symbolFiles.length,
                            symbolsExtracted: 0
                        });
                        this.statistics.scanStats = {
                            filesFound: scanStats.totalFiles,
                            directoriesScanned: scanStats.directoriesScanned,
                            scanTime: Date.now() - scanStartTime,
                            errors: scanStats.errors
                        };
                        return [2 /*return*/, symbolFiles];
                }
            });
        });
    };
    /**
     * Extract symbols from symbol files with progress reporting
     * @param symbolFiles - Array of symbol files to process
     * @returns Promise resolving to array of extracted symbols
     * @private
     */
    KiCadLocalDataProcessor.prototype.extractSymbols = function (symbolFiles) {
        return __awaiter(this, void 0, void 0, function () {
            var extractor, extractedSymbols, progressInterval, lastProgressTime, batchSize, i, batch, batchSymbols, progress;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        extractor = new KiCadSymbolExtractor_js_1.KiCadSymbolExtractor(this.config.extractionOptions);
                        extractedSymbols = [];
                        lastProgressTime = Date.now();
                        // Set up progress reporting for extraction
                        if (this.config.enableProgress && this.progressCallback) {
                            progressInterval = setInterval(function () {
                                var progress = _this.calculateExtractionProgress(extractedSymbols.length, symbolFiles.length);
                                _this.reportProgress(progress);
                            }, this.config.progressInterval);
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, , 6, 7]);
                        batchSize = Math.max(1, Math.floor(symbolFiles.length / 20));
                        i = 0;
                        _a.label = 2;
                    case 2:
                        if (!(i < symbolFiles.length)) return [3 /*break*/, 5];
                        batch = symbolFiles.slice(i, i + batchSize);
                        return [4 /*yield*/, extractor.extractSymbolsFromFiles(batch)];
                    case 3:
                        batchSymbols = _a.sent();
                        extractedSymbols.push.apply(extractedSymbols, batchSymbols);
                        // Report progress
                        if (this.config.enableProgress && Date.now() - lastProgressTime > 500) {
                            progress = this.calculateExtractionProgress(i + batch.length, symbolFiles.length, extractedSymbols.length);
                            this.reportProgress(progress);
                            lastProgressTime = Date.now();
                        }
                        _a.label = 4;
                    case 4:
                        i += batchSize;
                        return [3 /*break*/, 2];
                    case 5: return [2 /*return*/, extractedSymbols];
                    case 6:
                        if (progressInterval) {
                            clearInterval(progressInterval);
                        }
                        return [7 /*endfinally*/];
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Calculate extraction progress information
     * @param filesProcessed - Number of files processed
     * @param totalFiles - Total number of files
     * @param symbolsExtracted - Number of symbols extracted
     * @returns Progress information
     * @private
     */
    KiCadLocalDataProcessor.prototype.calculateExtractionProgress = function (filesProcessed, totalFiles, symbolsExtracted) {
        if (symbolsExtracted === void 0) { symbolsExtracted = 0; }
        var percentage = Math.min(95, 20 + (filesProcessed / totalFiles) * 75);
        var elapsedTime = Date.now() - this.startTime;
        var estimatedTotal = totalFiles > 0 ? (elapsedTime / filesProcessed) * totalFiles : 0;
        var estimatedTimeRemaining = Math.max(0, estimatedTotal - elapsedTime);
        return {
            phase: 'extracting',
            step: "Processing file ".concat(filesProcessed, " of ").concat(totalFiles),
            percentage: percentage,
            filesProcessed: filesProcessed,
            totalFiles: totalFiles,
            symbolsExtracted: symbolsExtracted,
            estimatedTimeRemaining: estimatedTimeRemaining
        };
    };
    /**
     * Report progress to callback if available
     * @param progress - Progress information
     * @private
     */
    KiCadLocalDataProcessor.prototype.reportProgress = function (progress) {
        if (this.progressCallback) {
            this.progressCallback(progress);
        }
    };
    /**
     * Update scan statistics from scanner results
     * @param symbolFiles - Symbol files found
     * @private
     */
    KiCadLocalDataProcessor.prototype.updateScanStatistics = function (symbolFiles) {
        // Statistics are updated in scanForSymbolFiles method
    };
    /**
     * Update extraction statistics from extractor results
     * @private
     */
    KiCadLocalDataProcessor.prototype.updateExtractionStatistics = function () {
        // Statistics are updated during extraction process
    };
    /**
     * Initialize processing statistics
     * @returns Initial statistics object
     * @private
     */
    KiCadLocalDataProcessor.prototype.initializeStatistics = function () {
        return {
            totalProcessingTime: 0,
            scanStats: {
                filesFound: 0,
                directoriesScanned: 0,
                scanTime: 0,
                errors: []
            },
            extractionStats: {
                filesProcessed: 0,
                filesWithErrors: 0,
                symbolsExtracted: 0,
                symbolsWithDescriptions: 0,
                symbolsWithKeywords: 0,
                extractionTime: 0,
                errors: []
            }
        };
    };
    /**
     * Get a human-readable summary of the processing results
     * @returns Formatted summary string
     */
    KiCadLocalDataProcessor.prototype.getProcessingSummary = function () {
        var stats = this.statistics;
        var totalTimeSeconds = (stats.totalProcessingTime / 1000).toFixed(2);
        var scanTimeSeconds = (stats.scanStats.scanTime / 1000).toFixed(2);
        var extractionTimeSeconds = (stats.extractionStats.extractionTime / 1000).toFixed(2);
        var summary = "KiCad Local Processing Summary:\n";
        summary += "  Total processing time: ".concat(totalTimeSeconds, " seconds\n");
        summary += "  KiCad path: ".concat(stats.kicadPath || 'Not detected', "\n");
        summary += "  Symbols path: ".concat(stats.symbolsPath || 'Not found', "\n\n");
        summary += "Scanning Results:\n";
        summary += "  Files found: ".concat(stats.scanStats.filesFound, "\n");
        summary += "  Directories scanned: ".concat(stats.scanStats.directoriesScanned, "\n");
        summary += "  Scan time: ".concat(scanTimeSeconds, " seconds\n");
        summary += "  Scan errors: ".concat(stats.scanStats.errors.length, "\n\n");
        summary += "Extraction Results:\n";
        summary += "  Files processed: ".concat(stats.extractionStats.filesProcessed, "\n");
        summary += "  Files with errors: ".concat(stats.extractionStats.filesWithErrors, "\n");
        summary += "  Symbols extracted: ".concat(stats.extractionStats.symbolsExtracted, "\n");
        summary += "  Symbols with descriptions: ".concat(stats.extractionStats.symbolsWithDescriptions, "\n");
        summary += "  Symbols with keywords: ".concat(stats.extractionStats.symbolsWithKeywords, "\n");
        summary += "  Extraction time: ".concat(extractionTimeSeconds, " seconds\n");
        var totalErrors = stats.scanStats.errors.length + stats.extractionStats.errors.length;
        if (totalErrors > 0) {
            summary += "\nTotal errors encountered: ".concat(totalErrors, "\n");
        }
        return summary;
    };
    return KiCadLocalDataProcessor;
}());
exports.KiCadLocalDataProcessor = KiCadLocalDataProcessor;
