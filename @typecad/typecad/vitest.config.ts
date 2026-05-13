// @ts-nocheck
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
  },
});
