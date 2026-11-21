import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // src/__tests__/roundtrip.test.ts builds boards from project source that
    // imports '@typecad/pcb' (as do the _sync.ts sidecars the planner
    // writes). Resolve it to this checkout's toolchain source, not dist/, so
    // the round trip always tests the code next to it.
    alias: [
      {
        find: /^@typecad\/pcb$/,
        replacement: fileURLToPath(new URL('../../@typecad/pcb/src/index.ts', import.meta.url)),
      },
    ],
  },
});
