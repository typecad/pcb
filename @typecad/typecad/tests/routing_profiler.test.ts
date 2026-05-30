import { describe, it, expect, beforeEach } from 'vitest';
import { Profiler } from '../src/routing/shared/profiler.js';

describe('Profiler', () => {
    let profiler: Profiler;

    beforeEach(() => {
        profiler = Profiler.getInstance();
        profiler.reset();
        profiler.setDebug(false);
        profiler.setEnabled(false);
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
                await new Promise(r => setTimeout(r, 1));
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
});
