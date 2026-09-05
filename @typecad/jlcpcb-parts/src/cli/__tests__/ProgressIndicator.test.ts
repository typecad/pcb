import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProgressIndicator } from '../ProgressIndicator.js';

describe('ProgressIndicator', () => {
  // Mock stdout.write to avoid actual console output during tests
  const originalStdoutWrite = process.stdout.write;
  const mockStdoutWrite = vi.fn();

  // Mock setInterval and clearInterval
  const originalSetInterval = global.setInterval;
  const originalClearInterval = global.clearInterval;
  const mockSetInterval = vi.fn().mockReturnValue(123); // Return a fake timer ID
  const mockClearInterval = vi.fn();

  // Mock Date.now
  const originalDateNow = Date.now;
  const mockDateNow = vi.fn().mockReturnValue(1000); // Fixed timestamp for testing

  beforeEach(() => {
    // Setup mocks before each test
    process.stdout.write = mockStdoutWrite;
    global.setInterval = mockSetInterval as any;
    global.clearInterval = mockClearInterval;
    Date.now = mockDateNow;

    // Clear mock calls
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original functions after each test
    process.stdout.write = originalStdoutWrite;
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
    Date.now = originalDateNow;
  });

  describe('start', () => {
    it('should start the progress indicator with default message', () => {
      // Arrange
      const progress = new ProgressIndicator();

      // Act
      progress.start();

      // Assert
      expect(mockStdoutWrite).toHaveBeenCalledWith('\x1B[?25l'); // Hide cursor
      expect(mockSetInterval).toHaveBeenCalled();
    });

    it('should start the progress indicator with custom message', () => {
      // Arrange
      const progress = new ProgressIndicator();
      const customMessage = 'Custom message';

      // Act
      progress.start(customMessage);

      // Assert
      expect(mockStdoutWrite).toHaveBeenCalledWith('\x1B[?25l'); // Hide cursor
      expect(mockSetInterval).toHaveBeenCalled();

      // Trigger the interval callback to check if it uses the custom message
      const intervalCallback = mockSetInterval.mock.calls[0][0];
      intervalCallback();

      expect(mockStdoutWrite).toHaveBeenCalledWith(expect.stringContaining(customMessage));
    });

    it('should not start if already active', () => {
      // Arrange
      const progress = new ProgressIndicator();
      progress.start(); // Start once
      mockSetInterval.mockClear(); // Clear the first call

      // Act
      progress.start(); // Try to start again

      // Assert
      expect(mockSetInterval).not.toHaveBeenCalled(); // Should not call setInterval again
    });
  });

  describe('stop', () => {
    it('should stop the progress indicator', () => {
      // Arrange
      const progress = new ProgressIndicator();
      progress.start();

      // Act
      progress.stop();

      // Assert
      expect(mockClearInterval).toHaveBeenCalledWith(123); // Clear the interval
      expect(mockStdoutWrite).toHaveBeenCalledWith('\x1B[?25h'); // Show cursor
      expect(mockStdoutWrite).toHaveBeenCalledWith('\n'); // New line
    });

    it('should clear the line when clearLine is true', () => {
      // Arrange
      const progress = new ProgressIndicator();
      progress.start();

      // Act
      progress.stop(true);

      // Assert
      expect(mockClearInterval).toHaveBeenCalledWith(123); // Clear the interval
      expect(mockStdoutWrite).toHaveBeenCalledWith('\x1B[?25h'); // Show cursor
      expect(mockStdoutWrite).toHaveBeenCalledWith('\r\x1B[K'); // Clear line
    });

    it('should do nothing if not active', () => {
      // Arrange
      const progress = new ProgressIndicator();

      // Act
      progress.stop();

      // Assert
      expect(mockClearInterval).not.toHaveBeenCalled();
    });
  });

  describe('updateMessage', () => {
    it('should update the message', () => {
      // Arrange
      const progress = new ProgressIndicator('Initial message');
      const newMessage = 'Updated message';

      // Act
      progress.updateMessage(newMessage);
      progress.start(); // Start to trigger the interval callback

      // Trigger the interval callback to check if it uses the updated message
      const intervalCallback = mockSetInterval.mock.calls[0][0];
      intervalCallback();

      // Assert
      expect(mockStdoutWrite).toHaveBeenCalledWith(expect.stringContaining(newMessage));
    });
  });
});
