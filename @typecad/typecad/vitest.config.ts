import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 30_000,
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dist-obfuscated/**',
      '**/.{idea,git,cache,output,temp}/**',
    ],
    coverage: {
      provider: 'v8',
      thresholds: {
        lines: 65,
        functions: 65,
        branches: 65,
        statements: 65,
      },
      include: ['src/**'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'dist-obfuscated/**',
        'tests/**',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.spec.ts',
        'src/cli/**',
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
