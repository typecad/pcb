"use strict";
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
exports.Application = void 0;
exports.runApplication = runApplication;
var DataManager_js_1 = require("../data/DataManager.js");
var EnhancedScoringSystem_js_1 = require("../scoring/EnhancedScoringSystem.js");
var SearchEngine_js_1 = require("../scoring/SearchEngine.js");
var ParameterParser_js_1 = require("../parsers/ParameterParser.js");
var CommandLineInterface_js_1 = require("../cli/CommandLineInterface.js");
var ErrorHandler_js_1 = require("../cli/ErrorHandler.js");
/**
 * Main application class that orchestrates all components
 *
 * The Application class serves as the central coordinator for the KiCad symbols search system.
 * It manages the initialization and coordination of all major components including data management,
 * parameter parsing, search engine, and command-line interface.
 *
 * Key responsibilities:
 * - Initialize and configure all system components
 * - Manage data loading and caching
 * - Coordinate search operations
 * - Handle application lifecycle (startup, shutdown)
 * - Provide error handling and logging
 *
 * @class Application
 * @example
 * ```typescript
 * // Create and run application
 * const app = new Application();
 * await app.run(process.argv);
 *
 * // Or use the convenience function
 * await runApplication(process.argv, {
 *   logLevel: LogLevel.INFO,
 *   cacheExpirationHours: 12
 * });
 * ```
 */
var Application = /** @class */ (function () {
    /**
     * Creates a new Application instance
     * @param localCachePath - Path to local cache file (ignored when using shared cache)
     * @param cacheDir - Directory for cache files (ignored when using shared cache)
     * @param cacheExpirationHours - Cache expiration time in hours
     * @param programName - Name of the program for CLI
     * @param useSharedCache - Whether to use shared temp directory for cache files (default: true)
     */
    function Application(localCachePath, cacheDir, cacheExpirationHours, programName, useSharedCache) {
        if (localCachePath === void 0) { localCachePath = 'kicad-symbols-cache.json'; }
        if (cacheDir === void 0) { cacheDir = '.'; }
        if (cacheExpirationHours === void 0) { cacheExpirationHours = 24; }
        if (programName === void 0) { programName = 'kicad-symbols'; }
        if (useSharedCache === void 0) { useSharedCache = true; }
        try {
            // Create data manager with progress tracking
            this.dataManager = new DataManager_js_1.DataManager(localCachePath, cacheDir, cacheExpirationHours, {
                mode: DataManager_js_1.DataSourceMode.LOCAL_FILES,
                enableProgress: true,
                progressCallback: function (progress) {
                    if (progress.phase === 'scanning' || progress.phase === 'extracting') {
                        console.log("".concat(progress.phase, ": ").concat(progress.step, " (").concat(progress.percentage.toFixed(1), "%)"));
                    }
                }
            }, useSharedCache);
            // Determine data source type and create appropriate parameter parser
            var dataSourceType = this.determineDataSourceType();
            this.parameterParser = new ParameterParser_js_1.ElectricalParameterParser(dataSourceType);
            this.fuzzyScorer = new EnhancedScoringSystem_js_1.EnhancedScoringSystem();
            // Create search engine
            this.searchEngine = new SearchEngine_js_1.ComponentSearchEngine(this.dataManager, this.parameterParser, this.fuzzyScorer);
            // Create CLI
            this.cli = new CommandLineInterface_js_1.CommandLineInterface(this.searchEngine, programName);
        }
        catch (error) {
            throw error;
        }
    }
    /**
     * Runs the application with the provided command-line arguments
     * @param args - Command-line arguments (process.argv)
     * @returns Promise that resolves when the application completes
     */
    Application.prototype.run = function (args) {
        return __awaiter(this, void 0, void 0, function () {
            var error_1, errorMessage;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        // Run the CLI with the provided arguments
                        return [4 /*yield*/, this.cli.run(args)];
                    case 1:
                        // Run the CLI with the provided arguments
                        _a.sent();
                        return [3 /*break*/, 3];
                    case 2:
                        error_1 = _a.sent();
                        errorMessage = ErrorHandler_js_1.ErrorHandler.handleError(error_1);
                        console.error(errorMessage);
                        // Exit with error code
                        process.exit(1);
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Performs cleanup operations before shutdown
     */
    Application.prototype.shutdown = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                try {
                    // Add any cleanup operations here
                    // For example, closing database connections, saving state, etc.
                    // Clear search engine cache if available
                    if (this.searchEngine && typeof this.searchEngine.clearCache === 'function') {
                        this.searchEngine.clearCache();
                    }
                }
                catch (error) {
                    // Silently handle shutdown errors
                }
                return [2 /*return*/];
            });
        });
    };
    /**
     * Gets the search engine instance
     * @returns The search engine instance
     */
    Application.prototype.getSearchEngine = function () {
        return this.searchEngine;
    };
    /**
     * Gets the data manager instance
     * @returns The data manager instance
     */
    /**
     * Determines the data source type based on the data manager's current mode
     * @returns DataSourceType for parameter parsing
     * @private
     */
    Application.prototype.determineDataSourceType = function () {
        // For now, assume KiCad symbols since that's what this application is designed for
        // In the future, this could be made more dynamic based on actual data source detection
        return ParameterParser_js_1.DataSourceType.KICAD;
    };
    Application.prototype.getDataManager = function () {
        return this.dataManager;
    };
    return Application;
}());
exports.Application = Application;
/**
 * Creates and runs the application
 * @param args - Command-line arguments (process.argv)
 * @param options - Application options
 * @returns Promise that resolves when the application completes
 */
function runApplication(args_1) {
    return __awaiter(this, arguments, void 0, function (args, options) {
        var _a, localCachePath, _b, cacheDir, _c, cacheExpirationHours, _d, programName, _e, useSharedCache, app, error_2, errorMessage;
        if (options === void 0) { options = {}; }
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    _a = options.localCachePath, localCachePath = _a === void 0 ? 'kicad-symbols-cache.json' : _a, _b = options.cacheDir, cacheDir = _b === void 0 ? '.' : _b, _c = options.cacheExpirationHours, cacheExpirationHours = _c === void 0 ? 24 : _c, _d = options.programName, programName = _d === void 0 ? 'kicad-symbols' : _d, _e = options.useSharedCache, useSharedCache = _e === void 0 ? true : _e;
                    app = null;
                    _f.label = 1;
                case 1:
                    _f.trys.push([1, 3, 4, 7]);
                    // Create application with provided options
                    app = new Application(localCachePath, cacheDir, cacheExpirationHours, programName, useSharedCache);
                    // Run the application
                    return [4 /*yield*/, app.run(args)];
                case 2:
                    // Run the application
                    _f.sent();
                    return [3 /*break*/, 7];
                case 3:
                    error_2 = _f.sent();
                    errorMessage = ErrorHandler_js_1.ErrorHandler.handleError(error_2);
                    console.error(errorMessage);
                    // Exit with error code
                    process.exit(1);
                    return [3 /*break*/, 7];
                case 4:
                    if (!app) return [3 /*break*/, 6];
                    return [4 /*yield*/, app.shutdown()];
                case 5:
                    _f.sent();
                    _f.label = 6;
                case 6: return [7 /*endfinally*/];
                case 7: return [2 /*return*/];
            }
        });
    });
}
