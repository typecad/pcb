"use strict";
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
exports.DataManager = exports.DataSourceMode = void 0;
var fs_1 = require("fs");
var DateBasedCacheManager_js_1 = require("./DateBasedCacheManager.js");
var KiCadLocalDataProcessor_js_1 = require("./KiCadLocalDataProcessor.js");
var KiCadSymbolConverter_js_1 = require("./KiCadSymbolConverter.js");
var CacheUtils_js_1 = require("../utils/CacheUtils.js");
/**
 * Data source modes for the DataManager
 */
var DataSourceMode;
(function (DataSourceMode) {
    /** Process local KiCad symbol files */
    DataSourceMode["LOCAL_FILES"] = "local_files";
})(DataSourceMode || (exports.DataSourceMode = DataSourceMode = {}));
/**
 * Default DataManager configuration
 */
var DEFAULT_CONFIG = {
    mode: DataSourceMode.LOCAL_FILES,
    enableProgress: false
};
/**
 * Manages component data including caching and parsing
 * Supports local file processing mode only
 */
var DataManager = /** @class */ (function () {
    /**
     * Creates a new DataManager
     * @param localDataPath Local path to save the data file (ignored if useSharedCache is true)
     * @param cacheDir Directory to store cache files (ignored if useSharedCache is true)
     * @param cacheExpirationHours Number of hours before cache expires
     * @param config Optional configuration for data source mode and options
     * @param useSharedCache Whether to use shared temp directory for cache files
     */
    function DataManager(localDataPath, cacheDir, cacheExpirationHours, config, useSharedCache) {
        if (localDataPath === void 0) { localDataPath = 'kicad-symbols-data.json'; }
        if (cacheDir === void 0) { cacheDir = '.'; }
        if (cacheExpirationHours === void 0) { cacheExpirationHours = 24; }
        if (config === void 0) { config = {}; }
        if (useSharedCache === void 0) { useSharedCache = true; }
        this.cachedComponents = null;
        this.currentMode = DataSourceMode.LOCAL_FILES;
        this.useSharedCache = useSharedCache;
        this.localDataPath = localDataPath;
        this.config = __assign(__assign({}, DEFAULT_CONFIG), config);
        this.currentMode = DataSourceMode.LOCAL_FILES;
        this.cacheManager = new DateBasedCacheManager_js_1.DateBasedCacheManager(cacheDir, cacheExpirationHours, useSharedCache);
        this.localProcessor = new KiCadLocalDataProcessor_js_1.KiCadLocalDataProcessor({
            customSymbolsPath: this.config.customSymbolsPath,
            enableProgress: this.config.enableProgress
        });
    }
    /**
     * Gets the cache file path, using shared cache directory if enabled
     */
    DataManager.prototype.getCacheFilePath = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.useSharedCache) return [3 /*break*/, 2];
                        return [4 /*yield*/, CacheUtils_js_1.CacheUtils.getDefaultCacheFilePath()];
                    case 1: return [2 /*return*/, _a.sent()];
                    case 2: return [2 /*return*/, this.localDataPath];
                }
            });
        });
    };
    /**
     * Ensures that component data is available and up-to-date
     */
    DataManager.prototype.ensureDataAvailable = function () {
        return __awaiter(this, void 0, void 0, function () {
            var error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        // Always use local files mode
                        this.currentMode = DataSourceMode.LOCAL_FILES;
                        return [4 /*yield*/, this.ensureLocalDataAvailable()];
                    case 1:
                        _a.sent();
                        return [3 /*break*/, 3];
                    case 2:
                        error_1 = _a.sent();
                        console.error('Failed to ensure data availability:', error_1);
                        throw error_1;
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Ensures local data is available and up-to-date
     */
    DataManager.prototype.ensureLocalDataAvailable = function () {
        return __awaiter(this, void 0, void 0, function () {
            var symbolsPath, extractedSymbols, converter, components, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 6, , 7]);
                        return [4 /*yield*/, this.isLocalCacheValid()];
                    case 1:
                        // Check if we have valid cached data
                        if (_a.sent()) {
                            console.log('Using cached local KiCad symbols data.');
                            return [2 /*return*/];
                        }
                        return [4 /*yield*/, this.getLocalSymbolsPath()];
                    case 2:
                        symbolsPath = _a.sent();
                        if (!symbolsPath) {
                            throw new Error('No local KiCad symbols found. Please ensure KiCad symbols are installed.');
                        }
                        console.log('Processing local KiCad symbols...');
                        return [4 /*yield*/, this.localProcessor.processLocalSymbols()];
                    case 3:
                        extractedSymbols = _a.sent();
                        converter = new KiCadSymbolConverter_js_1.KiCadSymbolConverter();
                        components = converter.convertSymbolsToComponentRecords(extractedSymbols);
                        // Save processed data
                        return [4 /*yield*/, this.saveDataToFile(components)];
                    case 4:
                        // Save processed data
                        _a.sent();
                        // Update cache timestamp
                        return [4 /*yield*/, this.cacheManager.writeTimestamp()];
                    case 5:
                        // Update cache timestamp
                        _a.sent();
                        console.log("Successfully processed ".concat(components.length, " symbols from local files."));
                        return [3 /*break*/, 7];
                    case 6:
                        error_2 = _a.sent();
                        console.error('Failed to process local symbols:', error_2);
                        throw error_2;
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Gets component data from the cache or processes local files
     */
    DataManager.prototype.getCsvData = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _a, error_3;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (this.cachedComponents) {
                            return [2 /*return*/, this.cachedComponents];
                        }
                        return [4 /*yield*/, this.ensureDataAvailable()];
                    case 1:
                        _b.sent();
                        _b.label = 2;
                    case 2:
                        _b.trys.push([2, 4, , 5]);
                        _a = this;
                        return [4 /*yield*/, this.loadDataFromFile()];
                    case 3:
                        _a.cachedComponents = _b.sent();
                        return [2 /*return*/, this.cachedComponents];
                    case 4:
                        error_3 = _b.sent();
                        console.error('Failed to load component data:', error_3);
                        throw error_3;
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Checks if the local cache is valid
     */
    DataManager.prototype.isDataStale = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.isLocalCacheValid()];
                    case 1: return [2 /*return*/, !(_a.sent())];
                }
            });
        });
    };
    /**
     * Saves component data to a JSON file
     */
    DataManager.prototype.saveDataToFile = function (components) {
        return __awaiter(this, void 0, void 0, function () {
            var cacheFilePath, data, error_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, , 4]);
                        return [4 /*yield*/, this.getCacheFilePath()];
                    case 1:
                        cacheFilePath = _a.sent();
                        data = JSON.stringify(components, null, 2);
                        return [4 /*yield*/, fs_1.promises.writeFile(cacheFilePath, data, 'utf8')];
                    case 2:
                        _a.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        error_4 = _a.sent();
                        console.error('Failed to save data to file:', error_4);
                        throw error_4;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Loads component data from the JSON file
     */
    DataManager.prototype.loadDataFromFile = function () {
        return __awaiter(this, void 0, void 0, function () {
            var cacheFilePath, data, error_5;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, , 4]);
                        return [4 /*yield*/, this.getCacheFilePath()];
                    case 1:
                        cacheFilePath = _a.sent();
                        return [4 /*yield*/, fs_1.promises.readFile(cacheFilePath, 'utf8')];
                    case 2:
                        data = _a.sent();
                        return [2 /*return*/, JSON.parse(data)];
                    case 3:
                        error_5 = _a.sent();
                        console.error('Failed to load data from file:', error_5);
                        throw error_5;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Gets the current data source mode
     */
    DataManager.prototype.getCurrentMode = function () {
        return this.currentMode;
    };
    /**
     * Checks if local KiCad symbols are available
     */
    DataManager.prototype.areLocalSymbolsAvailable = function () {
        return __awaiter(this, void 0, void 0, function () {
            var symbolsPath;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getLocalSymbolsPath()];
                    case 1:
                        symbolsPath = _a.sent();
                        return [2 /*return*/, symbolsPath !== undefined];
                }
            });
        });
    };
    /**
     * Gets the path to local KiCad symbols
     */
    DataManager.prototype.getLocalSymbolsPath = function () {
        return __awaiter(this, void 0, void 0, function () {
            var error_6;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.localProcessor.getSymbolsPath()];
                    case 1: return [2 /*return*/, _a.sent()];
                    case 2:
                        error_6 = _a.sent();
                        return [2 /*return*/, undefined];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Forces a refresh of the data by clearing cache and reprocessing
     */
    DataManager.prototype.forceRefresh = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        console.log('Forcing data refresh...');
                        // Clear cached data
                        this.cachedComponents = null;
                        // Clear cache timestamp
                        return [4 /*yield*/, this.cacheManager.deleteTimestamp()];
                    case 1:
                        // Clear cache timestamp
                        _a.sent();
                        // Reprocess data
                        return [4 /*yield*/, this.ensureDataAvailable()];
                    case 2:
                        // Reprocess data
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Gets processing statistics from the local processor
     */
    DataManager.prototype.getProcessingStatistics = function () {
        return this.localProcessor.getStatistics();
    };
    /**
     * Gets a summary of processing results
     */
    DataManager.prototype.getProcessingSummary = function () {
        return this.localProcessor.getProcessingSummary();
    };
    /**
     * Checks if the local cache is valid
     */
    DataManager.prototype.isLocalCacheValid = function () {
        return __awaiter(this, void 0, void 0, function () {
            var cacheFilePath, symbolsPath, cacheTimestamp, error_7;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 7, , 8]);
                        return [4 /*yield*/, this.cacheManager.isCacheStale()];
                    case 1:
                        // Check if cache file exists and is not expired
                        if (_a.sent()) {
                            return [2 /*return*/, false];
                        }
                        return [4 /*yield*/, this.getCacheFilePath()];
                    case 2:
                        cacheFilePath = _a.sent();
                        return [4 /*yield*/, this.fileExists(cacheFilePath)];
                    case 3:
                        if (!(_a.sent())) {
                            return [2 /*return*/, false];
                        }
                        return [4 /*yield*/, this.getLocalSymbolsPath()];
                    case 4:
                        symbolsPath = _a.sent();
                        if (!symbolsPath) {
                            return [2 /*return*/, false];
                        }
                        return [4 /*yield*/, this.cacheManager.readTimestamp()];
                    case 5:
                        cacheTimestamp = _a.sent();
                        if (!cacheTimestamp) {
                            return [2 /*return*/, false];
                        }
                        return [4 /*yield*/, this.hasNewerSymbolFiles(symbolsPath, cacheTimestamp)];
                    case 6:
                        // Check if symbol files are newer than cache
                        if (_a.sent()) {
                            return [2 /*return*/, false];
                        }
                        return [2 /*return*/, true];
                    case 7:
                        error_7 = _a.sent();
                        console.error('Error checking cache validity:', error_7);
                        return [2 /*return*/, false];
                    case 8: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Checks if symbol files are newer than the cache timestamp
     */
    DataManager.prototype.hasNewerSymbolFiles = function (symbolsPath, cacheTimestamp) {
        return __awaiter(this, void 0, void 0, function () {
            var stats, error_8;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, fs_1.promises.stat(symbolsPath)];
                    case 1:
                        stats = _a.sent();
                        return [2 /*return*/, stats.mtime > cacheTimestamp];
                    case 2:
                        error_8 = _a.sent();
                        console.error('Error checking file timestamps:', error_8);
                        return [2 /*return*/, false];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Checks if a file exists
     */
    DataManager.prototype.fileExists = function (filePath) {
        return __awaiter(this, void 0, void 0, function () {
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, fs_1.promises.access(filePath)];
                    case 1:
                        _b.sent();
                        return [2 /*return*/, true];
                    case 2:
                        _a = _b.sent();
                        return [2 /*return*/, false];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    return DataManager;
}());
exports.DataManager = DataManager;
