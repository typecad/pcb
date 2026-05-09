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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandLineInterface = void 0;
var chalk_1 = require("chalk");
var ProgressIndicator_js_1 = require("./ProgressIndicator.js");
var ErrorHandler_js_1 = require("./ErrorHandler.js");
var readline = require("readline");
/**
 * Command-line interface implementation for the KiCad symbols search tool
 */
var CommandLineInterface = /** @class */ (function () {
    /**
     * Command Line Interface for the KiCad symbols search application
     * @param searchEngine - The search engine to use for queries
     * @param programName - The name of the program (default: 'kicad-symbols')
     */
    function CommandLineInterface(searchEngine, programName) {
        if (programName === void 0) { programName = 'kicad-symbols'; }
        this.searchEngine = searchEngine;
        this.programName = programName;
    }
    /**
     * Prompts the user for a search query when none is provided
     * @returns Promise that resolves to the user's search query
     */
    CommandLineInterface.prototype.promptForSearchQuery = function () {
        return __awaiter(this, void 0, void 0, function () {
            var rl;
            var _this = this;
            return __generator(this, function (_a) {
                rl = readline.createInterface({
                    input: process.stdin,
                    output: process.stdout
                });
                return [2 /*return*/, new Promise(function (resolve) {
                        console.log(chalk_1.default.blue("\n".concat(_this.programName, " - KiCad Symbols Search Tool")));
                        console.log(chalk_1.default.yellow('No search query provided. Please enter a search term:'));
                        console.log(chalk_1.default.gray('Examples: "capacitor", "LM358", "4xxx:14528", "op amp"'));
                        console.log(chalk_1.default.gray('Press Ctrl+C to exit\n'));
                        rl.question(chalk_1.default.cyan('Search query: '), function (answer) {
                            rl.close();
                            resolve(answer.trim());
                        });
                    })];
            });
        });
    };
    /**
     * Main entry point for CLI execution
     * @param args - Command line arguments (process.argv)
     */
    CommandLineInterface.prototype.run = function (args) {
        return __awaiter(this, void 0, void 0, function () {
            var cliArgs, parsedArgs, _a, progress, originalConsoleLog, results, limitedResults, topMatch, searchError_1, error_1, isJsonFormat, tempParsedArgs, errorMessage;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        cliArgs = args.slice(2);
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 8, , 9]);
                        // Parse command-line arguments
                        parsedArgs = this.parseArguments(cliArgs);
                        // Handle help flag
                        if (parsedArgs.help) {
                            this.displayHelp();
                            return [2 /*return*/];
                        }
                        // Handle version flag
                        if (parsedArgs.version) {
                            this.displayVersion();
                            return [2 /*return*/];
                        }
                        if (!!parsedArgs.query) return [3 /*break*/, 3];
                        // Prompt for user input if no query provided
                        _a = parsedArgs;
                        return [4 /*yield*/, this.promptForSearchQuery()];
                    case 2:
                        // Prompt for user input if no query provided
                        _a.query = _b.sent();
                        // If user still didn't provide a query, exit gracefully
                        if (!parsedArgs.query || parsedArgs.query.trim().length === 0) {
                            if (parsedArgs.format === 'json') {
                                this.displayJsonError(new Error('No search query provided'), 'MISSING_QUERY');
                            }
                            else {
                                console.log(chalk_1.default.yellow('No search query provided. Exiting.'));
                            }
                            process.exit(0);
                        }
                        _b.label = 3;
                    case 3:
                        // Validate search query
                        if (!this.validateQuery(parsedArgs.query)) {
                            if (parsedArgs.format === 'json') {
                                this.displayJsonError(new Error("Invalid search query: \"".concat(parsedArgs.query, "\"")), 'INVALID_QUERY');
                            }
                            else {
                                console.error(chalk_1.default.red("Error: Invalid search query: \"".concat(parsedArgs.query, "\"")));
                                console.error(chalk_1.default.yellow('Search query must not be empty and should contain valid characters'));
                                console.error(chalk_1.default.yellow('Try using alphanumeric characters, spaces, and common symbols.'));
                            }
                            process.exit(1);
                        }
                        progress = parsedArgs.format === 'json' ? null : new ProgressIndicator_js_1.ProgressIndicator();
                        // Start progress indicator for search (only if not in JSON mode)
                        if (progress) {
                            progress.start("Searching for components matching: \"".concat(parsedArgs.query, "\""));
                        }
                        originalConsoleLog = null;
                        if (parsedArgs.format === 'json') {
                            originalConsoleLog = console.log;
                            console.log = function () { }; // Suppress all console.log output
                        }
                        _b.label = 4;
                    case 4:
                        _b.trys.push([4, 6, , 7]);
                        return [4 /*yield*/, this.searchEngine.search(parsedArgs.query)];
                    case 5:
                        results = _b.sent();
                        // Restore console.log if it was suppressed
                        if (originalConsoleLog) {
                            console.log = originalConsoleLog;
                        }
                        // Stop progress indicator (only if not in JSON mode)
                        if (progress) {
                            progress.stop();
                        }
                        // If no results, provide suggestions (only if not in JSON mode)
                        if (results.length === 0 && parsedArgs.format !== 'json') {
                            console.log(chalk_1.default.yellow('No components found matching your search criteria.'));
                            console.log(chalk_1.default.yellow('Suggestions:'));
                            console.log(chalk_1.default.yellow('- Try using more general terms (e.g., "capacitor" instead of "ceramic capacitor")'));
                            console.log(chalk_1.default.yellow('- Check your spelling and try alternative terms'));
                            console.log(chalk_1.default.yellow('- Remove specific parameters that might be too restrictive'));
                            console.log(chalk_1.default.yellow('- Try searching for a different package size or value'));
                            return [2 /*return*/];
                        }
                        // Sort results if needed
                        if (parsedArgs.sortBy !== 'score') {
                            this.sortResults(results, parsedArgs.sortBy);
                        }
                        limitedResults = parsedArgs.limit > 0 && parsedArgs.limit < results.length
                            ? results.slice(0, parsedArgs.limit)
                            : results;
                        // Display results
                        this.displayResults(limitedResults, parsedArgs.format);
                        // Show additional information if results were limited (only if not in JSON mode)
                        if (results.length > limitedResults.length && parsedArgs.format !== 'json') {
                            console.log(chalk_1.default.blue("Showing ".concat(limitedResults.length, " of ").concat(results.length, " matching components. Use --limit option to see more.")));
                        }
                        // Display top match summary at the end (only if not in JSON mode)
                        if (results.length > 0 && parsedArgs.format !== 'json') {
                            topMatch = results[0];
                            console.log(chalk_1.default.bold.blue("Top match: ".concat(chalk_1.default.italic(topMatch.lcsc), " - ").concat(topMatch.description, " (Score: ").concat(topMatch.score, ")")));
                        }
                        return [3 /*break*/, 7];
                    case 6:
                        searchError_1 = _b.sent();
                        // Restore console.log if it was suppressed
                        if (parsedArgs.format === 'json' && originalConsoleLog) {
                            console.log = originalConsoleLog;
                        }
                        // Stop progress indicator (only if not in JSON mode)
                        if (progress) {
                            progress.stop();
                        }
                        // Handle search errors in JSON format if needed
                        if (parsedArgs.format === 'json') {
                            this.displayJsonError(searchError_1, 'SEARCH_ERROR');
                            process.exit(1);
                        }
                        throw searchError_1;
                    case 7: return [3 /*break*/, 9];
                    case 8:
                        error_1 = _b.sent();
                        isJsonFormat = false;
                        try {
                            tempParsedArgs = this.parseArguments(cliArgs);
                            isJsonFormat = tempParsedArgs.format === 'json';
                        }
                        catch (parseError) {
                            // If parsing fails, check if JSON format was explicitly requested in args
                            isJsonFormat = cliArgs.includes('--format') && cliArgs.includes('json') ||
                                cliArgs.includes('-f') && cliArgs.includes('json');
                        }
                        if (isJsonFormat) {
                            // Output error in JSON format using dedicated method
                            this.displayJsonError(error_1, 'SYSTEM_ERROR');
                        }
                        else {
                            errorMessage = ErrorHandler_js_1.ErrorHandler.handleError(error_1);
                            console.error(chalk_1.default.red(errorMessage));
                        }
                        // Exit with error code
                        process.exit(1);
                        return [3 /*break*/, 9];
                    case 9: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Parses command-line arguments into a structured object
     * @param args - Command-line arguments
     * @returns Parsed arguments object
     */
    CommandLineInterface.prototype.parseArguments = function (args) {
        var result = {
            query: '',
            help: false,
            version: false,
            format: 'detailed',
            sortBy: 'score',
            limit: 5
        };
        // First pass: check if JSON format is requested to suppress warnings
        var isJsonFormat = false;
        for (var i = 0; i < args.length; i++) {
            if ((args[i] === '--format' || args[i] === '-f') && args[i + 1] === 'json') {
                isJsonFormat = true;
                break;
            }
        }
        // Process arguments
        for (var i = 0; i < args.length; i++) {
            var arg = args[i];
            // Handle flags
            if (arg === '--help' || arg === '-h') {
                result.help = true;
                continue;
            }
            if (arg === '--version' || arg === '-v') {
                result.version = true;
                continue;
            }
            // Handle format option
            if (arg === '--format' || arg === '-f') {
                var formatValue = args[++i];
                if (formatValue === 'detailed' || formatValue === 'compact' || formatValue === 'table' || formatValue === 'json') {
                    result.format = formatValue;
                }
                else {
                    if (!isJsonFormat) {
                        console.warn(chalk_1.default.yellow("Warning: Invalid format '".concat(formatValue, "'. Using default 'detailed' format.")));
                    }
                }
                continue;
            }
            // Handle sort option
            if (arg === '--sort' || arg === '-s') {
                var sortValue = args[++i];
                if (sortValue === 'score' || sortValue === 'id' || sortValue === 'manufacturer' || sortValue === 'package') {
                    result.sortBy = sortValue;
                }
                else {
                    if (!isJsonFormat) {
                        console.warn(chalk_1.default.yellow("Warning: Invalid sort option '".concat(sortValue, "'. Using default 'score' sort.")));
                    }
                }
                continue;
            }
            // Handle limit option
            if (arg === '--limit' || arg === '-l') {
                var limitValue = parseInt(args[++i], 10);
                if (!isNaN(limitValue) && limitValue > 0) {
                    result.limit = limitValue;
                }
                else {
                    if (!isJsonFormat) {
                        console.warn(chalk_1.default.yellow("Warning: Invalid limit '".concat(args[i], "'. Using default limit of 5.")));
                    }
                }
                continue;
            }
            // If not a flag, treat as part of the query
            if (!arg.startsWith('-')) {
                // If we already have a query, append with space
                if (result.query) {
                    result.query += ' ';
                }
                result.query += arg;
            }
        }
        return result;
    };
    /**
     * Validates a search query
     * @param query - Search query to validate
     * @returns True if the query is valid, false otherwise
     */
    CommandLineInterface.prototype.validateQuery = function (query) {
        // Query must not be empty
        if (!query || query.trim().length === 0) {
            return false;
        }
        // Query must not contain invalid characters
        var invalidCharsRegex = /[^\w\s\d.,\-+%()[\]{}:;'"\/\\&@#$^*=<>?!]/g;
        if (invalidCharsRegex.test(query)) {
            return false;
        }
        return true;
    };
    /**
     * Sorts search results based on the specified criteria
     * @param results - Array of search results to sort
     * @param sortBy - Sorting criteria
     */
    CommandLineInterface.prototype.sortResults = function (results, sortBy) {
        switch (sortBy) {
            case 'id':
                results.sort(function (a, b) { return a.lcsc.localeCompare(b.lcsc); });
                break;
            case 'manufacturer':
                results.sort(function (a, b) { return a.manufacturer.localeCompare(b.manufacturer); });
                break;
            case 'package':
                results.sort(function (a, b) { return a.package.localeCompare(b.package); });
                break;
            // 'score' is the default and already sorted by the search engine
            default:
                break;
        }
    };
    /**
     * Gets color for score based on its value
     * @param score - Score value
     * @returns Chalk color function
     */
    CommandLineInterface.prototype.getScoreColor = function (score) {
        if (score >= 90) {
            return chalk_1.default.green;
        }
        else if (score >= 75) {
            return chalk_1.default.yellow;
        }
        else if (score >= 50) {
            return chalk_1.default.hex('#FFA500'); // Orange
        }
        else {
            return chalk_1.default.red;
        }
    };
    /**
     * Displays search results in a formatted manner
     * @param results - Array of search results to display
     * @param format - Format to use for display (detailed, compact, table, or json)
     */
    CommandLineInterface.prototype.displayResults = function (results, format) {
        if (format === void 0) { format = 'detailed'; }
        // Handle JSON format separately
        if (format === 'json') {
            this.displayJsonResults(results);
            return;
        }
        if (results.length === 0) {
            console.log(chalk_1.default.yellow('No components found matching your search criteria.'));
            console.log(chalk_1.default.yellow('Try using more general terms or check your spelling.'));
            return;
        }
        console.log(chalk_1.default.green("\nFound ".concat(results.length, " matching components:\n")));
        // Display results based on format
        switch (format) {
            case 'detailed':
                this.displayDetailedResults(results);
                break;
            case 'compact':
                this.displayCompactResults(results);
                break;
            case 'table':
                this.displayTableResults(results);
                break;
            default:
                this.displayDetailedResults(results);
        }
    };
    /**
     * Displays results in detailed format
     * @param results - Array of search results to display
     */
    CommandLineInterface.prototype.displayDetailedResults = function (results) {
        var _this = this;
        results.forEach(function (result, index) {
            var scoreColor = _this.getScoreColor(result.score);
            console.log(chalk_1.default.bold("".concat(index + 1, ". ").concat(result.lcsc, " - ").concat(result.description)));
            console.log("   ".concat(chalk_1.default.cyan('Part Number:'), " ").concat(result.partNumber));
            console.log("   ".concat(chalk_1.default.cyan('Match Score:'), " ").concat(scoreColor(result.score.toFixed(1))));
            console.log("   ".concat(chalk_1.default.cyan('Match Details:'), " ").concat(result.matchSummary));
            console.log(); // Empty line between results
        });
    };
    /**
     * Displays results in compact format
     * @param results - Array of search results to display
     */
    CommandLineInterface.prototype.displayCompactResults = function (results) {
        var _this = this;
        results.forEach(function (result, index) {
            var scoreColor = _this.getScoreColor(result.score);
            console.log("".concat(index + 1, ". ").concat(chalk_1.default.bold(result.lcsc), " - ") +
                "".concat(result.description.substring(0, 40)).concat(result.description.length > 40 ? '...' : '', " - ") +
                "".concat(scoreColor(result.score.toFixed(1))));
        });
        console.log(); // Empty line at the end
    };
    /**
     * Displays results in table format
     * @param results - Array of search results to display
     */
    CommandLineInterface.prototype.displayTableResults = function (results) {
        var _this = this;
        // Calculate column widths
        var symbolWidth = Math.max.apply(Math, __spreadArray([8], results.map(function (r) { return r.lcsc.length; }), false));
        var descWidth = Math.min(60, Math.max.apply(Math, __spreadArray([11], results.map(function (r) { return r.description.length; }), false)));
        // Print table header
        console.log(chalk_1.default.bold("".concat('#'.padEnd(3), " ") +
            "".concat('ID'.padEnd(symbolWidth), " ") +
            "".concat('Score'.padEnd(6), " ") +
            "".concat('Description'.padEnd(descWidth))));
        // Print separator
        console.log("".concat(''.padEnd(3, '-'), " ") +
            "".concat(''.padEnd(symbolWidth, '-'), " ") +
            "".concat(''.padEnd(6, '-'), " ") +
            "".concat(''.padEnd(descWidth, '-')));
        // Print table rows
        results.forEach(function (result, index) {
            var scoreColor = _this.getScoreColor(result.score);
            // Truncate long text
            var description = result.description.length > descWidth
                ? result.description.substring(0, descWidth - 3) + '...'
                : result.description;
            console.log("".concat((index + 1).toString().padEnd(3), " ") +
                "".concat(chalk_1.default.cyan(result.lcsc.padEnd(symbolWidth)), " ") +
                "".concat(scoreColor(result.score.toFixed(1).padEnd(6)), " ") +
                "".concat(description));
        });
        console.log(); // Empty line at the end
    };
    /**
     * Displays results in JSON format
     * @param results - Array of search results to display
     */
    CommandLineInterface.prototype.displayJsonResults = function (results) {
        // Handle empty results by outputting empty JSON array
        if (results.length === 0) {
            console.log('[]');
            return;
        }
        // Convert SearchResult array to simplified JSON format
        var jsonResults = results.map(function (result) { return ({
            id: result.lcsc,
            description: result.description,
            score: result.score,
            matchSummary: result.matchSummary
        }); });
        // Output clean JSON with no additional formatting or colors
        console.log(JSON.stringify(jsonResults));
    };
    /**
     * Formats and outputs errors in JSON format
     * @param error - The error to format
     * @param code - Optional error code for programmatic handling
     */
    CommandLineInterface.prototype.displayJsonError = function (error, code) {
        var errorMessage;
        var errorCode = code;
        // Get clean error message without ANSI color codes for JSON output
        if (error instanceof Error) {
            errorMessage = error.message;
        }
        else {
            errorMessage = String(error);
        }
        // If no code provided, try to determine it from the error
        if (!errorCode) {
            if (error instanceof Error) {
                if (error.message.includes('No search query provided')) {
                    errorCode = 'MISSING_QUERY';
                }
                else if (error.message.includes('Invalid search query')) {
                    errorCode = 'INVALID_QUERY';
                }
                else if (error.message.includes('timed out') || error.message.includes('timeout')) {
                    errorCode = 'TIMEOUT_ERROR';
                }
                else if (error.message.includes('network') || error.message.includes('ENOTFOUND') || error.message.includes('ETIMEDOUT')) {
                    errorCode = 'NETWORK_ERROR';
                }
                else if (error.message.includes('file') || error.message.includes('ENOENT') || error.message.includes('EACCES')) {
                    errorCode = 'FILE_SYSTEM_ERROR';
                }
                else if (error.message.includes('parse') || error.message.includes('parsing') || error.message.includes('Unexpected token')) {
                    errorCode = 'PARSING_ERROR';
                }
                else {
                    errorCode = 'SYSTEM_ERROR';
                }
            }
            else {
                errorCode = 'UNKNOWN_ERROR';
            }
        }
        else {
            // If a code was provided, use it but still try to refine it based on error content
            // This allows for more specific error codes when the provided code is generic
            if (error instanceof Error) {
                if (errorCode === 'SEARCH_ERROR' || errorCode === 'SYSTEM_ERROR') {
                    // Refine the error code based on the actual error message
                    if (error.message.includes('timed out') || error.message.includes('timeout')) {
                        errorCode = 'TIMEOUT_ERROR';
                    }
                    else if (error.message.includes('network') || error.message.includes('ENOTFOUND') || error.message.includes('ETIMEDOUT')) {
                        errorCode = 'NETWORK_ERROR';
                    }
                    else if (error.message.includes('file') || error.message.includes('ENOENT') || error.message.includes('EACCES')) {
                        errorCode = 'FILE_SYSTEM_ERROR';
                    }
                    else if (error.message.includes('parse') || error.message.includes('parsing') || error.message.includes('Unexpected token')) {
                        errorCode = 'PARSING_ERROR';
                    }
                    // Keep the provided code if no more specific match is found
                }
            }
            else {
                // For non-Error objects, if a generic code was provided, use UNKNOWN_ERROR instead
                if (errorCode === 'SEARCH_ERROR' || errorCode === 'SYSTEM_ERROR') {
                    errorCode = 'UNKNOWN_ERROR';
                }
            }
        }
        // Create JSON error response
        var jsonError = {
            error: true,
            message: errorMessage,
            code: errorCode
        };
        // Output JSON error to stdout (not stderr) for consistent JSON output
        console.log(JSON.stringify(jsonError));
    };
    /**
     * Displays help text and usage information
     */
    CommandLineInterface.prototype.displayHelp = function () {
        console.log(chalk_1.default.bold("\n".concat(this.programName, " - KiCad Symbols Search Tool\n")));
        console.log('A command-line tool for searching KiCad symbols using fuzzy matching.\n');
        console.log(chalk_1.default.bold('Usage:'));
        console.log("  ".concat(this.programName, " [options] <search query>\n"));
        console.log(chalk_1.default.bold('Options:'));
        console.log('  -h, --help                Display this help message');
        console.log('  -v, --version             Display version information');
        console.log('  -f, --format <format>     Output format: detailed, compact, table, or json (default: detailed)');
        console.log('  -s, --sort <field>        Sort by: score, id, manufacturer, or package (default: score)');
        console.log('  -l, --limit <number>      Limit number of results (default: 5)\n');
        console.log(chalk_1.default.bold('Output Formats:'));
        console.log('  detailed                  Human-readable detailed output with colors and formatting');
        console.log('  compact                   Compact single-line format for each symbol');
        console.log('  table                     Tabular format with aligned columns');
        console.log('  json                      Machine-readable JSON format (suppresses all formatting and progress indicators)\n');
        console.log(chalk_1.default.bold('JSON Format:'));
        console.log('  The JSON format outputs clean, machine-readable JSON without any formatting, colors, or progress indicators.');
        console.log('  This format is ideal for programmatic integration and automated scripts.');
        console.log('  When no results are found, an empty array [] is returned.');
        console.log('  Error responses include an "error" field set to true with a "message" and optional "code".\n');
        console.log(chalk_1.default.bold('Examples:'));
        console.log("  ".concat(this.programName, " \"4xxx:14528\""));
        console.log("  ".concat(this.programName, " \"op amp\" --format table"));
        console.log("  ".concat(this.programName, " \"connector\" --sort id --limit 10"));
        console.log("  ".concat(this.programName, " \"LM358\" --format compact"));
        console.log("  ".concat(this.programName, " \"capacitor\" --format json"));
        console.log("  ".concat(this.programName, " \"resistor\" --format json --limit 3 | jq '.[0].id'"));
        console.log();
        console.log('This is part of the typeCAD project. Visit https://typecad.net to learn more about code-as-schematic.');
        console.log();
    };
    /**
     * Displays version information
     */
    CommandLineInterface.prototype.displayVersion = function () {
        // For simplicity in testing, just use a hardcoded version
        // In a real implementation, we would read from package.json
        console.log("".concat(this.programName, " version 1.0.0"));
    };
    return CommandLineInterface;
}());
exports.CommandLineInterface = CommandLineInterface;
