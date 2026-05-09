import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Application } from '../app/index.js';
import { CommandLineInterface } from '../cli/CommandLineInterface.js';
import { ComponentSearchEngine } from '../scoring/SearchEngine.js';
import { DataManager } from '../data/DataManager.js';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Integration Tests', () => {
  let tempDir: string;
  let app: Application;
  let originalConsoleLog: typeof console.log;
  let originalConsoleError: typeof console.error;
  let consoleOutput: string[];
  let consoleErrors: string[];

  beforeEach(async () => {
    // Create temporary directory for cache files
    tempDir = await fs.mkdtemp(join(tmpdir(), 'integration-test-'));
    
    // Mock console methods to capture output
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    consoleOutput = [];
    consoleErrors = [];
    
    console.log = (...args: any[]) => {
      consoleOutput.push(args.join(' '));
    };
    
    console.error = (...args: any[]) => {
      consoleErrors.push(args.join(' '));
    };
    
    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Restore console methods
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
    
    vi.restoreAllMocks();
  });

  describe('Complete Search Workflow', () => {
    it('should perform end-to-end search with KiCad data', async () => {
      // Mock HTML responses for KiCad website
      const mainPageHtml = `
        <html>
          <body>
            <p>Last updated on 15 January 2024</p>
            <table>
              <tr><td><a href="4xxx/">4xxx</a></td></tr>
              <tr><td><a href="Analog/">Analog</a></td></tr>
            </table>
          </body>
        </html>
      `;

      const library4xxxHtml = `
        <html>
          <body>
            <table>
              <tr><td>4001</td><td>Quad 2-input NOR gate</td></tr>
              <tr><td>4011</td><td>Quad 2-input NAND gate</td></tr>
            </table>
          </body>
        </html>
      `;

      const libraryAnalogHtml = `
        <html>
          <body>
            <table>
              <tr><td>LM358</td><td>Dual operational amplifier</td></tr>
              <tr><td>LM741</td><td>Single operational amplifier</td></tr>
            </table>
          </body>
        </html>
      `;

      // Mock fetch responses
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(mainPageHtml)
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(mainPageHtml)
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(library4xxxHtml)
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(libraryAnalogHtml)
        });

      // Create application with temporary cache directory
      app = new Application(
        'test-cache.json',
        tempDir,
        24,
        'test-kicad-search',
        false // Disable shared cache for testing
      );

      // Simulate CLI arguments for searching "op amp"
      const args = ['node', 'script.js', 'op', 'amp', '--format', 'json'];
      
      // Run the application
      await app.run(args);

      // Verify that search results were output in JSON format
      expect(consoleOutput.length).toBeGreaterThan(0);
      
      // Parse the JSON output
      const jsonOutput = consoleOutput[consoleOutput.length - 1];
      const results = JSON.parse(jsonOutput);
      
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      
      // Verify that operational amplifier symbols were found
      const opAmpResults = results.filter((result: any) => 
        result.description.toLowerCase().includes('operational amplifier') ||
        result.description.toLowerCase().includes('op amp')
      );
      
      expect(opAmpResults.length).toBeGreaterThan(0);
      
      // Verify result structure
      const firstResult = results[0];
      expect(firstResult).toHaveProperty('lcsc');
      expect(firstResult).toHaveProperty('manufacturer', 'KiCad');
      expect(firstResult).toHaveProperty('description');
      expect(firstResult).toHaveProperty('package', 'Symbol');
      expect(firstResult).toHaveProperty('score');
      expect(firstResult).toHaveProperty('matchSummary');
      
      // Verify LCSC format (library:symbol)
      expect(firstResult.lcsc).toMatch(/^[^:]+:[^:]+$/);
    });

    it('should handle cache validation with date-based caching', async () => {
      const mainPageHtml = `
        <html>
          <body>
            <p>Last updated on 15 January 2024</p>
            <table>
              <tr><td><a href="4xxx/">4xxx</a></td></tr>
            </table>
          </body>
        </html>
      `;

      const library4xxxHtml = `
        <html>
          <body>
            <table>
              <tr><td>4001</td><td>Quad 2-input NOR gate</td></tr>
            </table>
          </body>
        </html>
      `;

      // First run - should download data
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(mainPageHtml)
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(mainPageHtml)
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(library4xxxHtml)
        });

      app = new Application(
        'test-cache.json',
        tempDir,
        24,
        'test-kicad-search',
        false // Disable shared cache for testing
      );

      await app.run(['node', 'script.js', '4001', '--format', 'json']);

      // Verify cache file was created (check both possible locations)
      const cacheFile1 = join(tempDir, 'test-cache.json');
      const cacheFile2 = join(tempDir, 'kicad-symbols-cache.json');
      
      const cache1Exists = await fs.access(cacheFile1).then(() => true).catch(() => false);
      const cache2Exists = await fs.access(cacheFile2).then(() => true).catch(() => false);
      
      expect(cache1Exists || cache2Exists).toBe(true);

      // Clear console output
      consoleOutput.length = 0;
      vi.clearAllMocks();

      // Second run - should use cache (same date)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(mainPageHtml) // Same date
      });

      const app2 = new Application(
        'test-cache.json',
        tempDir,
        24,
        'test-kicad-search',
        false // Disable shared cache for testing
      );

      await app2.run(['node', 'script.js', '4001', '--format', 'json']);

      // Should still get results (from cache)
      expect(consoleOutput.length).toBeGreaterThan(0);
      const results = JSON.parse(consoleOutput[consoleOutput.length - 1]);
      expect(results.length).toBeGreaterThan(0);

      // Verify that only one fetch was made (for date check, not for downloading libraries)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should handle network errors gracefully', async () => {
      // Mock network error
      mockFetch.mockRejectedValue(new Error('Network error'));

      app = new Application(
        'test-cache.json',
        tempDir,
        24,
        'test-kicad-search',
        false // Disable shared cache for testing
      );

      // Should handle error gracefully
      await expect(app.run(['node', 'script.js', 'test', '--format', 'json'])).rejects.toThrow();

      // Verify error was logged to console
      expect(consoleErrors.length).toBeGreaterThan(0);
    }, 10000); // Increase timeout to 10 seconds
  });

  describe('CLI Output Formats', () => {
    beforeEach(async () => {
      // Setup mock data for CLI tests
      const mainPageHtml = `
        <html>
          <body>
            <p>Last updated on 15 January 2024</p>
            <table>
              <tr><td><a href="4xxx/">4xxx</a></td></tr>
            </table>
          </body>
        </html>
      `;

      const library4xxxHtml = `
        <html>
          <body>
            <table>
              <tr><td>4001</td><td>Quad 2-input NOR gate</td></tr>
              <tr><td>4011</td><td>Quad 2-input NAND gate</td></tr>
            </table>
          </body>
        </html>
      `;

      mockFetch
        .mockResolvedValue({
          ok: true,
          text: () => Promise.resolve(mainPageHtml)
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(mainPageHtml)
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(library4xxxHtml)
        });

      app = new Application(
        'test-cache.json',
        tempDir,
        24,
        'test-kicad-search',
        false // Disable shared cache for testing
      );
    });

    it('should output results in JSON format', async () => {
      await app.run(['node', 'script.js', 'gate', '--format', 'json']);

      expect(consoleOutput.length).toBeGreaterThan(0);
      const jsonOutput = consoleOutput[consoleOutput.length - 1];
      
      // Should be valid JSON
      expect(() => JSON.parse(jsonOutput)).not.toThrow();
      
      const results = JSON.parse(jsonOutput);
      expect(Array.isArray(results)).toBe(true);
      
      if (results.length > 0) {
        expect(results[0]).toHaveProperty('lcsc');
        expect(results[0]).toHaveProperty('manufacturer');
        expect(results[0]).toHaveProperty('description');
        expect(results[0]).toHaveProperty('score');
      }
    });

    it('should output results in detailed format', async () => {
      await app.run(['node', 'script.js', 'gate', '--format', 'detailed']);

      expect(consoleOutput.length).toBeGreaterThan(0);
      
      // Should contain formatted output with colors (ANSI codes)
      const output = consoleOutput.join('\n');
      expect(output).toContain('Found');
      expect(output).toContain('matching components');
    });

    it('should output results in compact format', async () => {
      await app.run(['node', 'script.js', 'gate', '--format', 'compact']);

      expect(consoleOutput.length).toBeGreaterThan(0);
      
      // Should contain compact single-line results
      const output = consoleOutput.join('\n');
      expect(output).toContain('Found');
      expect(output).toContain('matching components');
    });

    it('should output results in table format', async () => {
      await app.run(['node', 'script.js', 'gate', '--format', 'table']);

      expect(consoleOutput.length).toBeGreaterThan(0);
      
      // Should contain table headers
      const output = consoleOutput.join('\n');
      expect(output).toContain('LCSC');
      expect(output).toContain('Manufacturer');
      expect(output).toContain('Description');
    });

    it('should handle empty search results', async () => {
      await app.run(['node', 'script.js', 'nonexistent_component_xyz', '--format', 'json']);

      expect(consoleOutput.length).toBeGreaterThan(0);
      const jsonOutput = consoleOutput[consoleOutput.length - 1];
      const results = JSON.parse(jsonOutput);
      
      expect(results).toEqual([]);
    });

    it('should handle help flag', async () => {
      await app.run(['node', 'script.js', '--help']);

      const output = consoleOutput.join('\n');
      expect(output).toContain('KiCad Symbols Search Tool');
      expect(output).toContain('Usage:');
      expect(output).toContain('Options:');
      expect(output).toContain('Examples:');
    });

    it('should handle version flag', async () => {
      await app.run(['node', 'script.js', '--version']);

      const output = consoleOutput.join('\n');
      expect(output).toContain('version');
    });

    it('should handle invalid arguments gracefully', async () => {
      await expect(app.run(['node', 'script.js', '--invalid-flag'])).rejects.toThrow();
    });

    it('should handle missing query error', async () => {
      await expect(app.run(['node', 'script.js'])).rejects.toThrow();
    });
  });

  describe('Search Engine Integration', () => {
    it('should perform fuzzy search with scoring', async () => {
      const mainPageHtml = `
        <html>
          <body>
            <p>Last updated on 15 January 2024</p>
            <table>
              <tr><td><a href="Analog/">Analog</a></td></tr>
            </table>
          </body>
        </html>
      `;

      const libraryAnalogHtml = `
        <html>
          <body>
            <table>
              <tr><td>LM358</td><td>Dual operational amplifier</td></tr>
              <tr><td>LM741</td><td>Single operational amplifier</td></tr>
              <tr><td>LM324</td><td>Quad operational amplifier</td></tr>
            </table>
          </body>
        </html>
      `;

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(mainPageHtml)
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(mainPageHtml)
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(libraryAnalogHtml)
        });

      app = new Application(
        'test-cache.json',
        tempDir,
        24,
        'test-kicad-search',
        false // Disable shared cache for testing
      );

      // Search for "dual op amp" - should match LM358 best
      await app.run(['node', 'script.js', 'dual', 'op', 'amp', '--format', 'json']);

      const jsonOutput = consoleOutput[consoleOutput.length - 1];
      const results = JSON.parse(jsonOutput);
      
      expect(results.length).toBeGreaterThan(0);
      
      // Results should be sorted by score (highest first)
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
      
      // The dual operational amplifier should score higher than single
      const dualOpAmp = results.find((r: any) => r.description.includes('Dual operational amplifier'));
      const singleOpAmp = results.find((r: any) => r.description.includes('Single operational amplifier'));
      
      if (dualOpAmp && singleOpAmp) {
        expect(dualOpAmp.score).toBeGreaterThan(singleOpAmp.score);
      }
    });

    it('should handle library:symbol format searches', async () => {
      const mainPageHtml = `
        <html>
          <body>
            <p>Last updated on 15 January 2024</p>
            <table>
              <tr><td><a href="4xxx/">4xxx</a></td></tr>
            </table>
          </body>
        </html>
      `;

      const library4xxxHtml = `
        <html>
          <body>
            <table>
              <tr><td>4001</td><td>Quad 2-input NOR gate</td></tr>
            </table>
          </body>
        </html>
      `;

      // Clear previous mocks and set up fresh ones
      vi.clearAllMocks();
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(mainPageHtml)
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(mainPageHtml)
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(library4xxxHtml)
        });

      // Create new app instance to avoid cache issues
      const testApp = new Application(
        'test-cache-symbol.json',
        tempDir,
        24,
        'test-kicad-search',
        false // Disable shared cache for testing
      );

      // Clear console output before test
      consoleOutput.length = 0;

      // Search for exact library:symbol format
      await testApp.run(['node', 'script.js', '4xxx:4001', '--format', 'json']);

      expect(consoleOutput.length).toBeGreaterThan(0);
      const jsonOutput = consoleOutput[consoleOutput.length - 1];
      const results = JSON.parse(jsonOutput);
      
      expect(results.length).toBeGreaterThan(0);
      
      // Should find the exact match
      const exactMatch = results.find((r: any) => r.lcsc === '4xxx:4001');
      expect(exactMatch).toBeDefined();
      if (exactMatch) {
        expect(exactMatch.score).toBeGreaterThan(50); // Should have a good score for exact match
      }
    });

    it('should handle sorting options', async () => {
      const mainPageHtml = `
        <html>
          <body>
            <p>Last updated on 15 January 2024</p>
            <table>
              <tr><td><a href="Analog/">Analog</a></td></tr>
            </table>
          </body>
        </html>
      `;

      const libraryAnalogHtml = `
        <html>
          <body>
            <table>
              <tr><td>LM741</td><td>Single operational amplifier</td></tr>
              <tr><td>LM358</td><td>Dual operational amplifier</td></tr>
              <tr><td>LM324</td><td>Quad operational amplifier</td></tr>
            </table>
          </body>
        </html>
      `;

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(mainPageHtml)
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(mainPageHtml)
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(libraryAnalogHtml)
        });

      app = new Application(
        'test-cache.json',
        tempDir,
        24,
        'test-kicad-search',
        false // Disable shared cache for testing
      );

      // Search with LCSC sorting
      await app.run(['node', 'script.js', 'operational', '--sort', 'id', '--format', 'json']);

      const jsonOutput = consoleOutput[consoleOutput.length - 1];
      const results = JSON.parse(jsonOutput);
      
      expect(results.length).toBeGreaterThan(0);
      
              // Results should be sorted by ID (alphabetically)
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].lcsc.localeCompare(results[i].lcsc)).toBeLessThanOrEqual(0);
      }
    });

    it('should handle result limiting', async () => {
      const mainPageHtml = `
        <html>
          <body>
            <p>Last updated on 15 January 2024</p>
            <table>
              <tr><td><a href="Analog/">Analog</a></td></tr>
            </table>
          </body>
        </html>
      `;

      const libraryAnalogHtml = `
        <html>
          <body>
            <table>
              <tr><td>LM358</td><td>Dual operational amplifier</td></tr>
              <tr><td>LM741</td><td>Single operational amplifier</td></tr>
              <tr><td>LM324</td><td>Quad operational amplifier</td></tr>
              <tr><td>LM386</td><td>Audio power amplifier</td></tr>
              <tr><td>LM393</td><td>Dual comparator</td></tr>
            </table>
          </body>
        </html>
      `;

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(mainPageHtml)
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(mainPageHtml)
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(libraryAnalogHtml)
        });

      app = new Application(
        'test-cache.json',
        tempDir,
        24,
        'test-kicad-search',
        false // Disable shared cache for testing
      );

      // Search with limit of 2 results
      await app.run(['node', 'script.js', 'amplifier', '--limit', '2', '--format', 'json']);

      const jsonOutput = consoleOutput[consoleOutput.length - 1];
      const results = JSON.parse(jsonOutput);
      
      expect(results.length).toBeLessThanOrEqual(2);
    });
  });
});