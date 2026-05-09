"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GlobalErrorHandler = void 0;
var ErrorHandler_js_1 = require("./ErrorHandler.js");
/**
 * Class for handling global unhandled exceptions and rejections
 */
var GlobalErrorHandler = /** @class */ (function () {
    function GlobalErrorHandler() {
    }
    /**
     * Initializes the global error handler
     */
    GlobalErrorHandler.initialize = function () {
        var _this = this;
        if (this.isInitialized) {
            return;
        }
        // Handle uncaught exceptions
        process.on('uncaughtException', function (error) {
            _this.handleUncaughtException(error);
        });
        // Handle unhandled rejections
        process.on('unhandledRejection', function (reason) {
            _this.handleUnhandledRejection(reason);
        });
        this.isInitialized = true;
    };
    /**
     * Handles an uncaught exception
     * @param error - The uncaught exception
     */
    GlobalErrorHandler.handleUncaughtException = function (error) {
        // Use ErrorHandler to get a user-friendly error message
        var errorMessage = ErrorHandler_js_1.ErrorHandler.handleError(error);
        console.error("\nFatal error: ".concat(errorMessage));
        // Exit with error code
        process.exit(1);
    };
    /**
     * Handles an unhandled rejection
     * @param reason - The reason for the rejection
     */
    GlobalErrorHandler.handleUnhandledRejection = function (reason) {
        var error;
        if (reason instanceof Error) {
            error = reason;
        }
        else {
            error = new Error("Unhandled rejection: ".concat(String(reason)));
        }
        // Use ErrorHandler to get a user-friendly error message
        var errorMessage = ErrorHandler_js_1.ErrorHandler.handleError(error);
        console.error("\nFatal error: ".concat(errorMessage));
        // Exit with error code
        process.exit(1);
    };
    GlobalErrorHandler.isInitialized = false;
    return GlobalErrorHandler;
}());
exports.GlobalErrorHandler = GlobalErrorHandler;
