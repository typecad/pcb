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
exports.CacheUtils = void 0;
var node_os_1 = require("node:os");
var node_path_1 = require("node:path");
var node_fs_1 = require("node:fs");
/**
 * Utility functions for cache directory management
 */
var CacheUtils = /** @class */ (function () {
    function CacheUtils() {
    }
    /**
     * Gets the shared cache directory for all instances of the application
     * Creates the directory if it doesn't exist
     * @returns Promise<string> Path to the cache directory
     */
    CacheUtils.getSharedCacheDir = function () {
        return __awaiter(this, void 0, void 0, function () {
            var tempDir, cacheDir, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        tempDir = (0, node_os_1.tmpdir)();
                        cacheDir = (0, node_path_1.join)(tempDir, this.CACHE_DIR_NAME);
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        // Ensure the cache directory exists
                        return [4 /*yield*/, node_fs_1.promises.mkdir(cacheDir, { recursive: true })];
                    case 2:
                        // Ensure the cache directory exists
                        _a.sent();
                        return [2 /*return*/, cacheDir];
                    case 3:
                        error_1 = _a.sent();
                        throw new Error("Failed to create cache directory: ".concat(error_1 instanceof Error ? error_1.message : 'Unknown error'));
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Gets the default cache file path in the shared cache directory
     * @param filename Optional filename, defaults to 'kicad-symbols-cache.json'
     * @returns Promise<string> Full path to the cache file
     */
    CacheUtils.getDefaultCacheFilePath = function () {
        return __awaiter(this, arguments, void 0, function (filename) {
            var cacheDir;
            if (filename === void 0) { filename = 'kicad-symbols-cache.json'; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getSharedCacheDir()];
                    case 1:
                        cacheDir = _a.sent();
                        return [2 /*return*/, (0, node_path_1.join)(cacheDir, filename)];
                }
            });
        });
    };
    /**
     * Gets the timestamp file path in the shared cache directory
     * @returns Promise<string> Full path to the timestamp file
     */
    CacheUtils.getTimestampFilePath = function () {
        return __awaiter(this, void 0, void 0, function () {
            var cacheDir;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getSharedCacheDir()];
                    case 1:
                        cacheDir = _a.sent();
                        return [2 /*return*/, (0, node_path_1.join)(cacheDir, '.kicad-cache-timestamp')];
                }
            });
        });
    };
    /**
     * Cleans up old cache files (optional utility for maintenance)
     * @param maxAgeHours Maximum age in hours before files are considered old
     */
    CacheUtils.cleanupOldCacheFiles = function () {
        return __awaiter(this, arguments, void 0, function (maxAgeHours) {
            var cacheDir, files, now, maxAgeMs, _i, files_1, file, filePath, stats, fileAge, error_2, error_3;
            if (maxAgeHours === void 0) { maxAgeHours = 168; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 11, , 12]);
                        return [4 /*yield*/, this.getSharedCacheDir()];
                    case 1:
                        cacheDir = _a.sent();
                        return [4 /*yield*/, node_fs_1.promises.readdir(cacheDir)];
                    case 2:
                        files = _a.sent();
                        now = Date.now();
                        maxAgeMs = maxAgeHours * 60 * 60 * 1000;
                        _i = 0, files_1 = files;
                        _a.label = 3;
                    case 3:
                        if (!(_i < files_1.length)) return [3 /*break*/, 10];
                        file = files_1[_i];
                        filePath = (0, node_path_1.join)(cacheDir, file);
                        _a.label = 4;
                    case 4:
                        _a.trys.push([4, 8, , 9]);
                        return [4 /*yield*/, node_fs_1.promises.stat(filePath)];
                    case 5:
                        stats = _a.sent();
                        fileAge = now - stats.mtime.getTime();
                        if (!(fileAge > maxAgeMs)) return [3 /*break*/, 7];
                        return [4 /*yield*/, node_fs_1.promises.unlink(filePath)];
                    case 6:
                        _a.sent();
                        console.log("Cleaned up old cache file: ".concat(file));
                        _a.label = 7;
                    case 7: return [3 /*break*/, 9];
                    case 8:
                        error_2 = _a.sent();
                        // Ignore errors for individual files
                        console.warn("Failed to clean up cache file ".concat(file, ":"), error_2);
                        return [3 /*break*/, 9];
                    case 9:
                        _i++;
                        return [3 /*break*/, 3];
                    case 10: return [3 /*break*/, 12];
                    case 11:
                        error_3 = _a.sent();
                        console.warn('Failed to cleanup cache directory:', error_3);
                        return [3 /*break*/, 12];
                    case 12: return [2 /*return*/];
                }
            });
        });
    };
    CacheUtils.CACHE_DIR_NAME = 'kicad-symbols-cache';
    return CacheUtils;
}());
exports.CacheUtils = CacheUtils;
