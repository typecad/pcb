"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorHandler = void 0;
var chalk_1 = require("chalk");
/**
 * Class for handling errors and providing user-friendly messages
 */
var ErrorHandler = /** @class */ (function () {
    function ErrorHandler() {
    }
    /**
     * Handles an error and returns a user-friendly message
     * @param error - The error to handle
     * @returns User-friendly error message with suggestions
     */
    ErrorHandler.handleError = function (error) {
        if (error instanceof Error) {
            // Handle specific error types
            if (this.isNetworkError(error)) {
                return this.handleNetworkError(error);
            }
            else if (this.isFileSystemError(error)) {
                return this.handleFileSystemError(error);
            }
            else if (this.isParsingError(error)) {
                return this.handleParsingError(error);
            }
            else if (error.message.includes('timed out')) {
                return this.handleTimeoutError(error);
            }
            // Generic error handling
            return "".concat(error.message, "\n").concat(chalk_1.default.yellow('This is an unexpected error. Please report it to the developers.'));
        }
        // Unknown error type
        return "An unknown error occurred: ".concat(String(error));
    };
    /**
     * Checks if an error is a network error
     * @param error - Error to check
     * @returns True if the error is a network error
     */
    ErrorHandler.isNetworkError = function (error) {
        return 'code' in error && (error.code === 'ENOTFOUND' ||
            error.code === 'ETIMEDOUT' ||
            error.code === 'ECONNREFUSED' ||
            error.statusCode !== undefined);
    };
    /**
     * Checks if an error is a file system error
     * @param error - Error to check
     * @returns True if the error is a file system error
     */
    ErrorHandler.isFileSystemError = function (error) {
        return 'code' in error && (error.code === 'ENOENT' ||
            error.code === 'EACCES' ||
            error.code === 'EISDIR' ||
            error.path !== undefined);
    };
    /**
     * Checks if an error is a parsing error
     * @param error - Error to check
     * @returns True if the error is a parsing error
     */
    ErrorHandler.isParsingError = function (error) {
        return 'line' in error || 'column' in error || error.message.includes('parse');
    };
    /**
     * Handles a network error
     * @param error - Network error to handle
     * @returns User-friendly error message with suggestions
     */
    ErrorHandler.handleNetworkError = function (error) {
        var message = "Network error: ".concat(error.message);
        var suggestion = '';
        // Add specific suggestions based on error code
        switch (error.code) {
            case 'ENOTFOUND':
                suggestion = 'Check your internet connection and try again.';
                break;
            case 'ETIMEDOUT':
                suggestion = 'The server took too long to respond. Try again later.';
                break;
            case 'ECONNREFUSED':
                suggestion = 'The server refused the connection. It might be down or your firewall might be blocking the connection.';
                break;
            default:
                if (error.statusCode) {
                    if (error.statusCode === 404) {
                        suggestion = 'The requested resource was not found. The KiCad data source might have changed.';
                    }
                    else if (error.statusCode === 403) {
                        suggestion = 'Access to the resource was forbidden. Check if you need to authenticate or if the resource is no longer public.';
                    }
                    else if (error.statusCode >= 500) {
                        suggestion = 'The server encountered an error. Try again later.';
                    }
                }
                else {
                    suggestion = 'Check your internet connection and try again.';
                }
        }
        return "".concat(message, "\n").concat(chalk_1.default.yellow(suggestion));
    };
    /**
     * Handles a file system error
     * @param error - File system error to handle
     * @returns User-friendly error message with suggestions
     */
    ErrorHandler.handleFileSystemError = function (error) {
        var message = "File system error: ".concat(error.message);
        var suggestion = '';
        // Add specific suggestions based on error code
        switch (error.code) {
            case 'ENOENT':
                suggestion = "The file or directory was not found: ".concat(error.path, ". Check if the path is correct.");
                break;
            case 'EACCES':
                suggestion = "Permission denied for: ".concat(error.path, ". Check if you have the necessary permissions.");
                break;
            case 'EISDIR':
                suggestion = "Expected a file but found a directory: ".concat(error.path, ".");
                break;
            default:
                suggestion = "There was an issue with the file system operation on: ".concat(error.path, ".");
        }
        return "".concat(message, "\n").concat(chalk_1.default.yellow(suggestion));
    };
    /**
     * Handles a parsing error
     * @param error - Parsing error to handle
     * @returns User-friendly error message with suggestions
     */
    ErrorHandler.handleParsingError = function (error) {
        var message = "Parsing error: ".concat(error.message);
        var suggestion = '';
        if (error.line !== undefined && error.column !== undefined) {
            suggestion = "Error occurred at line ".concat(error.line, ", column ").concat(error.column, ". The data format might be corrupted or invalid.");
        }
        else {
            suggestion = 'The data format might be corrupted or invalid. Try refreshing the data source.';
        }
        return "".concat(message, "\n").concat(chalk_1.default.yellow(suggestion));
    };
    /**
     * Handles a timeout error
     * @param error - Timeout error to handle
     * @returns User-friendly error message with suggestions
     */
    ErrorHandler.handleTimeoutError = function (error) {
        var message = "Timeout error: ".concat(error.message);
        var suggestion = 'The operation took too long to complete. Try using more specific search terms or check your internet connection.';
        return "".concat(message, "\n").concat(chalk_1.default.yellow(suggestion));
    };
    return ErrorHandler;
}());
exports.ErrorHandler = ErrorHandler;
