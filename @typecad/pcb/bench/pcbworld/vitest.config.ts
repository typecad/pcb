import { defineConfig } from 'vitest/config';

// The bench is a long-running job, not a unit test: one file, no timeout,
// console passed through so per-board progress is visible.
export default defineConfig({
  test: {
    include: ['bench/pcbworld/run.bench.ts'],
    testTimeout: 0,
    hookTimeout: 0,
    silent: false,
    reporters: ['default'],
  },
});
