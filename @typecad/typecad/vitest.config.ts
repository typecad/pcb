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
        lines: 60,
        functions: 50,
        branches: 50,
        statements: 60,
      },
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
      ],
    },
  },
});
