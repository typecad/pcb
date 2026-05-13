import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 30_000,
    include: [
      'tests/autoroute_integration.test.ts',
      'tests/complex_routing.test.ts',
      'tests/dsbga-complex-routing.test.ts',
      'tests/keepout-area.test.ts',
      'tests/multilayer-connectors.test.ts',
      'tests/qfn-intersecting.test.ts',
      'tests/rotated-resistors-routing.test.ts',
      'tests/simple-net.test.ts',
      'tests/pcb.test.ts',
    ],
  },
});
