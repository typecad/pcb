import { Logger, LogLevel } from '../Logger.js';

/**
 * Demonstrates the simplified Logger usage
 */
function demonstrateLogger() {
  console.log('=== Logger Demo ===\n');

  // 1. Basic usage with defaults (INFO level, timestamps enabled)
  console.log('1. Basic logger with defaults:');
  const basicLogger = Logger.getInstance();
  basicLogger.info('This is an info message');
  basicLogger.warn('This is a warning message');
  basicLogger.error('This is an error message');
  basicLogger.debug('This debug message will not show (level is INFO)');

  console.log('\n2. Logger with custom options (DEBUG level, no timestamps):');
  // Note: This will only work if we reset the singleton between demos
  // In real usage, options are only applied on first getInstance() call
  const customLogger = Logger.getInstance({
    consoleLevel: LogLevel.DEBUG,
    includeTimestamps: false,
  });

  customLogger.debug('This debug message will now show');
  customLogger.info('Info without timestamp');
  customLogger.warn('Warning without timestamp');

  console.log('\n3. Error handling:');
  const error = new Error('Sample error');
  customLogger.error('Something went wrong', error);

  console.log('\n4. Logging with additional data:');
  customLogger.info('Process completed', {
    duration: 1234,
    items: 5,
    success: true,
  });
}

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateLogger();
}

export { demonstrateLogger };
