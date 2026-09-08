import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Profiler } from '../src/routing/shared/profiler.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Profiler', () => {
  let profiler: Profiler;
  let tmpDir: string;

  beforeEach(() => {
    profiler = Profiler.getInstance();
    profiler.reset();
    profiler.setDebug(false);
    profiler.setEnabled(false);
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-profiler-'));
  });

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('singleton', () => {
    it('should return the same instance', () => {
      const a = Profiler.getInstance();
      const b = Profiler.getInstance();
      expect(a).toBe(b);
    });
  });

  describe('enable/disable', () => {
    it('should be disabled by default', () => {
      expect(profiler.isEnabled()).toBe(false);
    });

    it('should enable and disable', () => {
      profiler.setEnabled(true);
      expect(profiler.isEnabled()).toBe(true);
      profiler.setEnabled(false);
      expect(profiler.isEnabled()).toBe(false);
    });

    it('should enable via setDebug', () => {
      profiler.setDebug(true);
      expect(profiler.isEnabled()).toBe(true);
      expect(profiler.getDebug()).toBe(true);
    });
  });

  describe('timing', () => {
    it('should not record call count when disabled', () => {
      profiler.setEnabled(false);
      profiler.start('test');
      profiler.end('test');
      const entries = profiler.getEntries();
      if (entries.has('test')) {
        expect(entries.get('test')!.callCount).toBe(0);
      }
    });

    it('should record when enabled', () => {
      profiler.setEnabled(true);
      profiler.start('test');
      profiler.end('test');
      const entries = profiler.getEntries();
      expect(entries.get('test')!.callCount).toBe(1);
      expect(entries.get('test')!.totalDuration).toBeGreaterThanOrEqual(0);
    });

    it('should accumulate call counts', () => {
      profiler.setEnabled(true);
      for (let i = 0; i < 5; i++) {
        profiler.start('multi');
        profiler.end('multi');
      }
      const entries = profiler.getEntries();
      expect(entries.get('multi')!.callCount).toBe(5);
    });
  });

  describe('reset', () => {
    it('should clear all entries', () => {
      profiler.setEnabled(true);
      profiler.start('a');
      profiler.end('a');
      profiler.reset();
      expect(profiler.getEntries().size).toBe(0);
      expect(profiler.getCallStack()).toEqual([]);
    });

    it('should clear alerts', () => {
      profiler.clearAlerts();
      expect(profiler.getAlerts()).toEqual([]);
    });
  });

  describe('profile wrapper', () => {
    it('should profile a sync function', () => {
      profiler.setEnabled(true);
      const fn = profiler.profile('wrapped', (x: number) => x * 2);
      const result = fn(21);
      expect(result).toBe(42);
      const entries = profiler.getEntries();
      expect(entries.get('wrapped')!.callCount).toBe(1);
    });

    it('should profile an async function', async () => {
      profiler.setEnabled(true);
      const fn = profiler.profile('asyncWrapped', async (x: number) => {
        await new Promise((r) => setTimeout(r, 1));
        return x + 1;
      });
      const result = await fn(9);
      expect(result).toBe(10);
      const entries = profiler.getEntries();
      expect(entries.get('asyncWrapped')!.callCount).toBe(1);
    });

    it('should profile a throwing sync function', () => {
      profiler.setEnabled(true);
      const fn = profiler.profile('thrower', () => {
        throw new Error('boom');
      });
      expect(() => fn()).toThrow('boom');
      const entries = profiler.getEntries();
      expect(entries.get('thrower')!.callCount).toBe(1);
    });
  });

  describe('hierarchical profiling', () => {
    it('should track parent-child relationships', () => {
      profiler.setEnabled(true);
      profiler.start('parent');
      profiler.start('child');
      profiler.end('child');
      profiler.end('parent');
      const entries = profiler.getEntries();
      expect(entries.get('parent')!.children).toContain('child');
      expect(entries.get('child')!.parent).toBe('parent');
    });

    it('should get hierarchical view', () => {
      profiler.setEnabled(true);
      profiler.start('root');
      profiler.start('leaf');
      profiler.end('leaf');
      profiler.end('root');
      const view = profiler.getHierarchicalView();
      expect(view).toHaveProperty('root');
      expect(view.root!.children).toHaveProperty('leaf');
    });
  });

  describe('configuration', () => {
    it('should return config', () => {
      const config = profiler.getConfig();
      expect(config).toHaveProperty('enableMemoryTracking');
      expect(config).toHaveProperty('executionTimeThreshold');
    });

    it('should merge partial config', () => {
      profiler.configure({ executionTimeThreshold: 500 });
      const config = profiler.getConfig();
      expect(config.executionTimeThreshold).toBe(500);
    });
  });

  describe('hotspots', () => {
    it('should detect hotspots', () => {
      profiler.setEnabled(true);
      for (let i = 0; i < 100; i++) {
        profiler.start('hot');
        profiler.end('hot');
      }
      profiler.start('cold');
      profiler.end('cold');
      const hotspots = profiler.getHotspots();
      expect(hotspots.length).toBeGreaterThan(0);
      expect(hotspots[0].functionName).toBe('hot');
    });
  });

  describe('regression', () => {
    it('should return empty regressions without baseline', () => {
      const regressions = profiler.getRegressionReport();
      expect(regressions).toEqual([]);
    });
  });

  describe('exportToJSON', () => {
    it('should export profiling data to a JSON file', () => {
      profiler.setEnabled(true);
      profiler.start('funcA');
      profiler.end('funcA');
      const filePath = path.join(tmpDir, 'profile.json');
      profiler.exportToJSON(filePath);
      expect(fs.existsSync(filePath)).toBe(true);
      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(content).toHaveProperty('timestamp');
      expect(content).toHaveProperty('entries');
      expect(content.entries.length).toBeGreaterThan(0);
      expect(content.entries[0].name).toBe('funcA');
    });
  });

  describe('exportToCSV', () => {
    it('should export profiling data to a CSV file', () => {
      profiler.setEnabled(true);
      profiler.start('funcB');
      profiler.end('funcB');
      const filePath = path.join(tmpDir, 'profile.csv');
      profiler.exportToCSV(filePath);
      expect(fs.existsSync(filePath)).toBe(true);
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('Function');
      expect(content).toContain('funcB');
    });

    it('should skip entries with zero call count in CSV', () => {
      profiler.setEnabled(true);
      profiler.exportToCSV(path.join(tmpDir, 'empty.csv'));
      const content = fs.readFileSync(path.join(tmpDir, 'empty.csv'), 'utf-8');
      expect(content).toContain('Function');
    });
  });

  describe('saveBaseline', () => {
    it('should save baseline data to a file', () => {
      profiler.setEnabled(true);
      profiler.start('baseFn');
      profiler.end('baseFn');
      const filePath = path.join(tmpDir, 'baseline.json');
      profiler.saveBaseline(filePath);
      expect(fs.existsSync(filePath)).toBe(true);
      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(Array.isArray(content)).toBe(true);
      expect(content[0].functionName).toBe('baseFn');
    });

    it('should save baseline to default config path when no path given', () => {
      profiler.setEnabled(true);
      profiler.start('def');
      profiler.end('def');
      const defaultPath = path.join(tmpDir, 'profiler_baseline.json');
      const origCwd = process.cwd;
      process.cwd = () => tmpDir;
      profiler.configure({ baselineFile: defaultPath });
      profiler.saveBaseline();
      expect(fs.existsSync(defaultPath)).toBe(true);
      process.cwd = origCwd;
    });
  });

  describe('getMemoryStats', () => {
    it('should return memory delta entries when memory tracking is enabled', () => {
      profiler.setEnabled(true);
      profiler.configure({ enableMemoryTracking: true });
      profiler.start('memFn');
      profiler.end('memFn');
      const stats = profiler.getMemoryStats();
      expect(typeof stats).toBe('object');
    });
  });

  describe('getAlerts', () => {
    it('should trigger execution time alerts when threshold is exceeded', () => {
      profiler.setEnabled(true);
      profiler.setDebug(false);
      profiler.configure({ enablePerformanceAlerts: true, executionTimeThreshold: 0.001 });
      profiler.start('slow');
      profiler.end('slow');
      const alerts = profiler.getAlerts();
      expect(alerts.length).toBeGreaterThanOrEqual(1);
      expect(alerts[0].alertType).toBe('execution_time');
      expect(alerts[0].functionName).toBe('slow');
    });
  });

  describe('profile wrapper', () => {
    it('should handle async rejection', async () => {
      profiler.setEnabled(true);
      const fn = profiler.profile('rejector', async () => {
        throw new Error('async error');
      });
      await expect(fn()).rejects.toThrow('async error');
      const entries = profiler.getEntries();
      expect(entries.get('rejector')!.callCount).toBe(1);
    });
  });

  describe('configure with baseline file', () => {
    it('should not crash when baseline file does not exist', () => {
      const missingFile = path.join(tmpDir, 'nonexistent.json');
      expect(() => {
        profiler.configure({ baselineFile: missingFile, enableRegressionDetection: true });
      }).not.toThrow();
    });
  });

  describe('getCallStack', () => {
    it('should return copy of call stack', () => {
      profiler.setEnabled(true);
      profiler.start('a');
      profiler.start('b');
      const stack = profiler.getCallStack();
      expect(stack).toEqual(['a', 'b']);
      profiler.end('b');
      profiler.end('a');
    });
  });
});
