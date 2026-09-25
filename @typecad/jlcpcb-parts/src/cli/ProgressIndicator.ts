import chalk from 'chalk';

/**
 * Class for displaying progress indicators in the console
 */
export class ProgressIndicator {
  private message: string;
  private interval: NodeJS.Timeout | null = null;
  private frames: string[] = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private frameIndex = 0;
  private startTime: number = 0;
  private isActive = false;

  /**
   * Creates a new ProgressIndicator
   * @param message - Message to display next to the spinner
   */
  constructor(message: string = 'Processing...') {
    this.message = message;
  }

  /**
   * Starts the progress indicator
   * @param message - Optional message to override the default
   */
  public start(message?: string): void {
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

    this.interval = setInterval(() => {
      const frame = this.frames[this.frameIndex];
      const elapsedSeconds = ((Date.now() - this.startTime) / 1000).toFixed(1);

      // Clear the line and write the new frame
      process.stdout.write(`\r${chalk.cyan(frame)} ${this.message} (${elapsedSeconds}s)`);

      // Update frame index
      this.frameIndex = (this.frameIndex + 1) % this.frames.length;
    }, 80);
  }

  /**
   * Stops the progress indicator
   * @param clearLine - Whether to clear the line after stopping (default: false)
   */
  public stop(clearLine: boolean = false): void {
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
    } else {
      // Just move to the next line
      process.stdout.write('\n');
    }

    this.isActive = false;
  }

  /**
   * Updates the progress message
   * @param message - New message to display
   */
  public updateMessage(message: string): void {
    this.message = message;
  }
}
