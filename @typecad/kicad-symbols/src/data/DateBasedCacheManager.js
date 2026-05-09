"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
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
exports.DateBasedCacheManager = void 0;
var fs_1 = require("fs");
var path_1 = require("path");
var TimestampManager_js_1 = require("./TimestampManager.js");
var CacheUtils_js_1 = require("../utils/CacheUtils.js");
/**
 * Manages cache validation based on remote "Last updated" dates
 * Extends TimestampManager to add date-based cache validation
 */
var DateBasedCacheManager = /** @class */ (function (_super) {
    __extends(DateBasedCacheManager, _super);
    function DateBasedCacheManager(cacheDir, cacheExpirationHours, useSharedCache) {
        if (cacheDir === void 0) { cacheDir = '.'; }
        if (cacheExpirationHours === void 0) { cacheExpirationHours = 24; }
        if (useSharedCache === void 0) { useSharedCache = true; }
        var _this = _super.call(this, cacheDir, cacheExpirationHours, useSharedCache) || this;
        _this.useSharedCacheForDates = useSharedCache;
        if (useSharedCache) {
            // Will be set asynchronously in getLastUpdatedFile()
            _this.lastUpdatedFile = '';
        }
        else {
            // Legacy behavior for backward compatibility
            _this.lastUpdatedFile = (0, path_1.join)(cacheDir, '.kicad-last-updated-date');
        }
        return _this;
    }
    /**
     * Gets the last updated file path, creating shared cache directory if needed
     */
    DateBasedCacheManager.prototype.getLastUpdatedFile = function () {
        return __awaiter(this, void 0, void 0, function () {
            var cacheDir;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.useSharedCacheForDates) return [3 /*break*/, 2];
                        return [4 /*yield*/, CacheUtils_js_1.CacheUtils.getSharedCacheDir()];
                    case 1:
                        cacheDir = _a.sent();
                        return [2 /*return*/, (0, path_1.join)(cacheDir, '.kicad-last-updated-date')];
                    case 2: return [2 /*return*/, this.lastUpdatedFile];
                }
            });
        });
    };
    /**
     * Gets the stored "Last updated" date from the cache
     * @returns The last updated date as a Date object, or null if not found or invalid
     */
    DateBasedCacheManager.prototype.getLastUpdatedDate = function () {
        return __awaiter(this, void 0, void 0, function () {
            var lastUpdatedFile, dateStr, date, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, , 4]);
                        return [4 /*yield*/, this.getLastUpdatedFile()];
                    case 1:
                        lastUpdatedFile = _a.sent();
                        return [4 /*yield*/, fs_1.promises.readFile(lastUpdatedFile, 'utf-8')];
                    case 2:
                        dateStr = _a.sent();
                        date = new Date(dateStr.trim());
                        // Validate that the date is a valid date
                        if (isNaN(date.getTime())) {
                            return [2 /*return*/, null];
                        }
                        return [2 /*return*/, date];
                    case 3:
                        error_1 = _a.sent();
                        // File doesn't exist or can't be read
                        return [2 /*return*/, null];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Stores the "Last updated" date to the cache
     * @param date The last updated date to store
     */
    DateBasedCacheManager.prototype.setLastUpdatedDate = function (date) {
        return __awaiter(this, void 0, void 0, function () {
            var lastUpdatedFile, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, , 4]);
                        return [4 /*yield*/, this.getLastUpdatedFile()];
                    case 1:
                        lastUpdatedFile = _a.sent();
                        return [4 /*yield*/, fs_1.promises.writeFile(lastUpdatedFile, date.toISOString(), 'utf-8')];
                    case 2:
                        _a.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        error_2 = _a.sent();
                        throw new Error("Failed to write last updated date file: ".concat(error_2 instanceof Error ? error_2.message : 'Unknown error'));
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Checks if the cache is stale based on comparing stored date with remote date
     * @param remoteDate The current "Last updated" date from the remote source
     * @returns true if cache is stale (dates don't match or no stored date exists)
     */
    DateBasedCacheManager.prototype.isCacheStaleByDate = function (remoteDate) {
        return __awaiter(this, void 0, void 0, function () {
            var storedDate;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getLastUpdatedDate()];
                    case 1:
                        storedDate = _a.sent();
                        if (!storedDate) {
                            // No stored date exists, cache is considered stale
                            return [2 /*return*/, true];
                        }
                        // Compare dates - if they're different, cache is stale
                        return [2 /*return*/, storedDate.getTime() !== remoteDate.getTime()];
                }
            });
        });
    };
    /**
     * Comprehensive cache validation that combines date-based and time-based checks
     * @param remoteDate The current "Last updated" date from the remote source (optional)
     * @returns true if cache is stale and needs to be refreshed
     */
    DateBasedCacheManager.prototype.isCacheStale = function (remoteDate) {
        return __awaiter(this, void 0, void 0, function () {
            var shouldCheckRemote, isStaleByDate;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.shouldCheckRemoteDate()];
                    case 1:
                        shouldCheckRemote = _a.sent();
                        if (!shouldCheckRemote && !remoteDate) {
                            // Within 24-hour window and no remote date provided, cache is fresh
                            return [2 /*return*/, false];
                        }
                        if (!remoteDate) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.isCacheStaleByDate(remoteDate)];
                    case 2:
                        isStaleByDate = _a.sent();
                        if (isStaleByDate) {
                            return [2 /*return*/, true];
                        }
                        // Dates match, update our check timestamp and consider cache fresh
                        return [4 /*yield*/, this.writeTimestamp()];
                    case 3:
                        // Dates match, update our check timestamp and consider cache fresh
                        _a.sent();
                        return [2 /*return*/, false];
                    case 4: return [4 /*yield*/, _super.prototype.isCacheStale.call(this)];
                    case 5: 
                    // Fallback to time-based caching if date parsing fails or no remote date
                    return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    /**
     * Checks if we should validate against the remote date based on 24-hour interval
     * @returns true if more than 24 hours have passed since last check
     */
    DateBasedCacheManager.prototype.shouldCheckRemoteDate = function () {
        return __awaiter(this, void 0, void 0, function () {
            var cacheAge;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getCacheAgeHours()];
                    case 1:
                        cacheAge = _a.sent();
                        if (cacheAge === null) {
                            // No timestamp exists, should check remote
                            return [2 /*return*/, true];
                        }
                        // Check if 24 hours have passed since last validation
                        return [2 /*return*/, cacheAge >= 24];
                }
            });
        });
    };
    /**
     * Deletes both timestamp and last updated date files
     */
    DateBasedCacheManager.prototype.deleteTimestamp = function () {
        return __awaiter(this, void 0, void 0, function () {
            var lastUpdatedFile, error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, _super.prototype.deleteTimestamp.call(this)];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 5, , 6]);
                        return [4 /*yield*/, this.getLastUpdatedFile()];
                    case 3:
                        lastUpdatedFile = _a.sent();
                        return [4 /*yield*/, fs_1.promises.unlink(lastUpdatedFile)];
                    case 4:
                        _a.sent();
                        return [3 /*break*/, 6];
                    case 5:
                        error_3 = _a.sent();
                        // Ignore errors if file doesn't exist
                        if (error_3.code !== 'ENOENT') {
                            throw error_3;
                        }
                        return [3 /*break*/, 6];
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    return DateBasedCacheManager;
}(TimestampManager_js_1.TimestampManager));
exports.DateBasedCacheManager = DateBasedCacheManager;
