import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 30_000,
    exclude: ['**/node_modules/**', '**/dist/**', '**/.{idea,git,cache,output,temp}/**'],
    coverage: {
      provider: 'v8',
      // Branch coverage currently sits at ~60.6% (this gate only started
      // running when CI was repaired); ratchet upward toward 65 as the
      // router/length-matching modules gain direct unit tests.
      thresholds: {
        lines: 65,
        functions: 65,
        branches: 60,
        statements: 65,
      },
      include: ['src/**'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'tests/**',
        '**/*.d.ts',
        '**/*.md',
        '**/*.test.ts',
        '**/*.spec.ts',
        'src/cli/**',
        'src/gerber_viewer/cli.ts',
        'src/gitdiff/viewer/**',
        'scripts/**',
        'vitest.config.ts',
        '*.config.*',
        'coverage/**',
        'build/**',
        '**/*.d.ts.map',
        '**/*.js.map',
      ],
    },
  },
});
