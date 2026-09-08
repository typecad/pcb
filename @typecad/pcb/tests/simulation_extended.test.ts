import { describe, it, expect, vi } from 'vitest';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
  exec: vi.fn(),
  execFile: vi.fn(),
}));

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
}));

vi.mock('which', () => ({
  sync: vi.fn(() => '/usr/bin/ngspice'),
  default: { sync: vi.fn(() => '/usr/bin/ngspice') },
}));

describe('SimulationContext', () => {
  it('should be importable', async () => {
    const mod = await import('../src/simulation/ngspice.js');
    expect(mod.SimulationContext).toBeDefined();
  });
});
