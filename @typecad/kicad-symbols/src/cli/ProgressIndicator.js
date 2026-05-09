"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProgressIndicator = void 0;
var chalk_1 = require("chalk");
/**
 * Class for displaying progress indicators in the console
 */
var ProgressIndicator = /** @class */ (function () {
    /**
     * Creates a new ProgressIndicator
     * @param message - Message to display next to the spinner
     */
    function ProgressIndicator(message) {
        if (message === void 0) { message = 'Processing...'; }
        this.interval = null;
        this.frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
        this.frameIndex = 0;
        this.startTime = 0;
        this.isActive = false;
        this.message = message;
    }
    /**
     * Starts the progress indicator
     * @param message - Optional message to override the default
     */
    ProgressIndicator.prototype.start = function (message) {
        var _this = this;
        if (message) {
            this.message = message;
        }
        if (this.isActive) {
            return;
        }
        this.isActive = true;
        this.startTime = Date.now();
        // Clear the line and hide the cursor
        process.stdout.write('\x1B[?25l');
        this.interval = setInterval(function () {
            var frame = _this.frames[_this.frameIndex];
            var elapsedSeconds = ((Date.now() - _this.startTime) / 1000).toFixed(1);
            // Clear the line and write the new frame
            process.stdout.write("\r".concat(chalk_1.default.cyan(frame), " ").concat(_this.message, " (").concat(elapsedSeconds, "s)"));
            // Update frame index
            _this.frameIndex = (_this.frameIndex + 1) % _this.frames.length;
        }, 80);
    };
    /**
     * Stops the progress indicator
     * @param clearLine - Whether to clear the line after stopping (default: false)
     */
    ProgressIndicator.prototype.stop = function (clearLine) {
        if (clearLine === void 0) { clearLine = false; }
        if (!this.isActive) {
            return;
        }
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        // Show the cursor again
        process.stdout.write('\x1B[?25h');
        if (clearLine) {
            // Clear the line
            process.stdout.write('\r\x1B[K');
        }
        else {
            // Just move to the next line
            process.stdout.write('\n');
        }
        this.isActive = false;
    };
    /**
     * Updates the progress message
     * @param message - New message to display
     */
    ProgressIndicator.prototype.updateMessage = function (message) {
        this.message = message;
    };
    return ProgressIndicator;
}());
exports.ProgressIndicator = ProgressIndicator;
