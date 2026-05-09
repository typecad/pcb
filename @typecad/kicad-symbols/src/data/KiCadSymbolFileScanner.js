"use strict";
/**
 * Scanner for finding KiCad symbol files (.kicad_sym) in the local filesystem
 * Recursively searches through the KiCad symbols directory to locate all symbol files
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
exports.KiCadSymbolFileScanner = void 0;
var node_fs_1 = require("node:fs");
var node_path_1 = require("node:path");
/**
 * Default scan options
 */
var DEFAULT_SCAN_OPTIONS = {
    recursive: true,
    maxDepth: 0, // No limit
    maxFileSize: 0, // No limit
    followSymlinks: false,
    excludePatterns: ['.git', '.svn', '.hg', 'node_modules', '__pycache__']
};
/**
 * Scanner for KiCad symbol files in the local filesystem
 */
var KiCadSymbolFileScanner = /** @class */ (function () {
    function KiCadSymbolFileScanner(symbolsRootPath, options) {
        if (options === void 0) { options = {}; }
        this.symbolsRootPath = symbolsRootPath;
        this.options = __assign(__assign({}, DEFAULT_SCAN_OPTIONS), options);
        this.statistics = {
            totalFiles: 0,
            totalSize: 0,
            directoriesScanned: 0,
            scanDuration: 0,
            errors: []
        };
    }
    /**
     * Scan the symbols directory for all .kicad_sym files
     * @returns Promise resolving to array of symbol file information
     */
    KiCadSymbolFileScanner.prototype.scanForSymbolFiles = function () {
        return __awaiter(this, void 0, void 0, function () {
            var startTime, stat, symbolFiles, error_1, errorMessage;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        startTime = Date.now();
                        this.resetStatistics();
                        if (!node_fs_1.default.existsSync(this.symbolsRootPath)) {
                            throw new Error("Symbols directory does not exist: ".concat(this.symbolsRootPath));
                        }
                        return [4 /*yield*/, node_fs_1.default.promises.stat(this.symbolsRootPath)];
                    case 1:
                        stat = _a.sent();
                        if (!stat.isDirectory()) {
                            throw new Error("Symbols path is not a directory: ".concat(this.symbolsRootPath));
                        }
                        symbolFiles = [];
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, this.scanDirectory(this.symbolsRootPath, symbolFiles, 0)];
                    case 3:
                        _a.sent();
                        return [3 /*break*/, 5];
                    case 4:
                        error_1 = _a.sent();
                        errorMessage = "Error scanning symbols directory: ".concat(error_1 instanceof Error ? error_1.message : String(error_1));
                        this.statistics.errors.push(errorMessage);
                        throw new Error(errorMessage);
                    case 5:
                        this.statistics.scanDuration = Date.now() - startTime;
                        return [2 /*return*/, symbolFiles];
                }
            });
        });
    };
    /**
     * Get scanning statistics from the last scan operation
     * @returns Scan statistics
     */
    KiCadSymbolFileScanner.prototype.getStatistics = function () {
        return __assign({}, this.statistics);
    };
    /**
     * Recursively scan a directory for symbol files
     * @param dirPath - Directory path to scan
     * @param symbolFiles - Array to collect found symbol files
     * @param currentDepth - Current scanning depth
     * @private
     */
    KiCadSymbolFileScanner.prototype.scanDirectory = function (dirPath, symbolFiles, currentDepth) {
        return __awaiter(this, void 0, void 0, function () {
            var entries, _i, entries_1, entry, fullPath, fileInfo, error_2, errorMessage, error_3, errorMessage;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        // Check depth limit
                        if (this.options.maxDepth > 0 && currentDepth >= this.options.maxDepth) {
                            return [2 /*return*/];
                        }
                        this.statistics.directoriesScanned++;
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 13, , 14]);
                        return [4 /*yield*/, node_fs_1.default.promises.readdir(dirPath, { withFileTypes: true })];
                    case 2:
                        entries = _a.sent();
                        _i = 0, entries_1 = entries;
                        _a.label = 3;
                    case 3:
                        if (!(_i < entries_1.length)) return [3 /*break*/, 12];
                        entry = entries_1[_i];
                        fullPath = node_path_1.default.join(dirPath, entry.name);
                        _a.label = 4;
                    case 4:
                        _a.trys.push([4, 10, , 11]);
                        if (!entry.isDirectory()) return [3 /*break*/, 7];
                        // Skip excluded directories
                        if (this.shouldExcludeDirectory(entry.name)) {
                            return [3 /*break*/, 11];
                        }
                        if (!this.options.recursive) return [3 /*break*/, 6];
                        return [4 /*yield*/, this.scanDirectory(fullPath, symbolFiles, currentDepth + 1)];
                    case 5:
                        _a.sent();
                        _a.label = 6;
                    case 6: return [3 /*break*/, 9];
                    case 7:
                        if (!(entry.isFile() || (entry.isSymbolicLink() && this.options.followSymlinks))) return [3 /*break*/, 9];
                        if (!this.isSymbolFile(entry.name)) return [3 /*break*/, 9];
                        return [4 /*yield*/, this.createFileInfo(fullPath)];
                    case 8:
                        fileInfo = _a.sent();
                        if (fileInfo && this.isValidFileSize(fileInfo.size)) {
                            symbolFiles.push(fileInfo);
                            this.statistics.totalFiles++;
                            this.statistics.totalSize += fileInfo.size;
                        }
                        _a.label = 9;
                    case 9: return [3 /*break*/, 11];
                    case 10:
                        error_2 = _a.sent();
                        errorMessage = "Error processing ".concat(fullPath, ": ").concat(error_2 instanceof Error ? error_2.message : String(error_2));
                        this.statistics.errors.push(errorMessage);
                        // Continue scanning other files
                        return [3 /*break*/, 11];
                    case 11:
                        _i++;
                        return [3 /*break*/, 3];
                    case 12: return [3 /*break*/, 14];
                    case 13:
                        error_3 = _a.sent();
                        errorMessage = "Error reading directory ".concat(dirPath, ": ").concat(error_3 instanceof Error ? error_3.message : String(error_3));
                        this.statistics.errors.push(errorMessage);
                        throw error_3;
                    case 14: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Create file information object for a symbol file
     * @param filePath - Full path to the file
     * @returns File information or null if file cannot be accessed
     * @private
     */
    KiCadSymbolFileScanner.prototype.createFileInfo = function (filePath) {
        return __awaiter(this, void 0, void 0, function () {
            var stat, fileName, fullFileName, directory, relativePath, error_4, errorMessage;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, node_fs_1.default.promises.stat(filePath)];
                    case 1:
                        stat = _a.sent();
                        // Skip if it's not actually a file (could be a directory with .kicad_sym name)
                        if (!stat.isFile()) {
                            return [2 /*return*/, null];
                        }
                        fileName = node_path_1.default.basename(filePath, '.kicad_sym');
                        fullFileName = node_path_1.default.basename(filePath);
                        directory = node_path_1.default.dirname(filePath);
                        relativePath = node_path_1.default.relative(this.symbolsRootPath, filePath);
                        return [2 /*return*/, {
                                filePath: filePath,
                                fileName: fileName,
                                fullFileName: fullFileName,
                                directory: directory,
                                relativePath: relativePath,
                                size: stat.size,
                                lastModified: stat.mtime
                            }];
                    case 2:
                        error_4 = _a.sent();
                        errorMessage = "Cannot access file ".concat(filePath, ": ").concat(error_4 instanceof Error ? error_4.message : String(error_4));
                        this.statistics.errors.push(errorMessage);
                        return [2 /*return*/, null];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Check if a file is a KiCad symbol file
     * @param fileName - Name of the file
     * @returns True if it's a .kicad_sym file
     * @private
     */
    KiCadSymbolFileScanner.prototype.isSymbolFile = function (fileName) {
        return fileName.toLowerCase().endsWith('.kicad_sym');
    };
    /**
     * Check if a directory should be excluded from scanning
     * @param dirName - Directory name
     * @returns True if directory should be excluded
     * @private
     */
    KiCadSymbolFileScanner.prototype.shouldExcludeDirectory = function (dirName) {
        return this.options.excludePatterns.some(function (pattern) {
            if (pattern.includes('*') || pattern.includes('?')) {
                // Simple glob pattern matching
                var regexPattern = pattern
                    .replace(/\*/g, '.*')
                    .replace(/\?/g, '.');
                return new RegExp("^".concat(regexPattern, "$"), 'i').test(dirName);
            }
            else {
                // Exact match (case insensitive)
                return dirName.toLowerCase() === pattern.toLowerCase();
            }
        });
    };
    /**
     * Check if file size is within acceptable limits
     * @param fileSize - Size of the file in bytes
     * @returns True if file size is acceptable
     * @private
     */
    KiCadSymbolFileScanner.prototype.isValidFileSize = function (fileSize) {
        if (this.options.maxFileSize <= 0) {
            return true; // No size limit
        }
        return fileSize <= this.options.maxFileSize;
    };
    /**
     * Reset scanning statistics
     * @private
     */
    KiCadSymbolFileScanner.prototype.resetStatistics = function () {
        this.statistics = {
            totalFiles: 0,
            totalSize: 0,
            directoriesScanned: 0,
            scanDuration: 0,
            errors: []
        };
    };
    /**
     * Get a human-readable summary of the scan results
     * @returns Formatted summary string
     */
    KiCadSymbolFileScanner.prototype.getScanSummary = function () {
        var stats = this.statistics;
        var sizeInMB = (stats.totalSize / (1024 * 1024)).toFixed(2);
        var durationInSeconds = (stats.scanDuration / 1000).toFixed(2);
        var summary = "Scan Summary:\n";
        summary += "  Files found: ".concat(stats.totalFiles, "\n");
        summary += "  Total size: ".concat(sizeInMB, " MB\n");
        summary += "  Directories scanned: ".concat(stats.directoriesScanned, "\n");
        summary += "  Scan duration: ".concat(durationInSeconds, " seconds\n");
        if (stats.errors.length > 0) {
            summary += "  Errors encountered: ".concat(stats.errors.length, "\n");
            if (stats.errors.length <= 5) {
                summary += "  Error details:\n";
                stats.errors.forEach(function (error) {
                    summary += "    - ".concat(error, "\n");
                });
            }
            else {
                summary += "  First 5 errors:\n";
                stats.errors.slice(0, 5).forEach(function (error) {
                    summary += "    - ".concat(error, "\n");
                });
                summary += "    ... and ".concat(stats.errors.length - 5, " more errors\n");
            }
        }
        return summary;
    };
    return KiCadSymbolFileScanner;
}());
exports.KiCadSymbolFileScanner = KiCadSymbolFileScanner;
