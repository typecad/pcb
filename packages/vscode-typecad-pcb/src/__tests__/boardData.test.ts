import { describe, it, expect, vi } from 'vitest';
import { BoardDataService } from '../boardData.js';
import type { QueryRunner } from '../boardData.js';

const indexJson = JSON.stringify([
  {
    reference: 'R1',
    value: '1kohm',
    footprint: 'R_0402',
    variable: 'r1',
    side: 'front',
    at: { x: 0, y: 0, rotation: 0 },
    padCount: 2,
  },
]);

const detailJson = JSON.stringify({
  reference: 'R1',
  value: '1kohm',
  footprint: 'R_0402',
  variable: 'r1',
  source: 'src/power.ts:12',
  side: 'front',
  at: { x: 0, y: 0, rotation: 0 },
  padCount: 2,
  unconnectedPads: [],
  pads: [{ pad: '1', net: 'VCC', type: 'smd', at: { x: 0, y: 0 }, layers: ['F.Cu'] }],
});

function fakeRunner(responses: Record<string, string>): QueryRunner & { calls: string[] } {
  const calls: string[] = [];
  const run = vi.fn((cwd: string, command: string) => {
    calls.push(command);
    if (command in responses) return Promise.resolve(responses[command]);
    return Promise.reject(new Error(`unexpected command: ${command}`));
  }) as unknown as QueryRunner & { calls: string[] };
  (run as unknown as { calls: string[] }).calls = calls;
  return run;
}

describe('BoardDataService', () => {
  it('resolves a hover word to pad-level detail via two queries', async () => {
    const run = fakeRunner({
      'npx typecad-pcb query components --json': indexJson,
      'npx typecad-pcb query component R1 --json': detailJson,
    });
    const service = new BoardDataService(run);
    service.setFolder('C:/proj/hw');

    const detail = await service.resolve('r1');
    expect(detail?.reference).toBe('R1');
    expect(detail?.pads[0].net).toBe('VCC');
    expect(run.calls).toHaveLength(2);
  });

  it('caches the index and per-component details', async () => {
    const run = fakeRunner({
      'npx typecad-pcb query components --json': indexJson,
      'npx typecad-pcb query component R1 --json': detailJson,
    });
    const service = new BoardDataService(run);
    service.setFolder('C:/proj/hw');

    await service.resolve('r1');
    await service.resolve('r1');
    await service.resolve('R1');
    expect(run.calls).toHaveLength(2);
  });

  it('returns null for words matching no component', async () => {
    const run = fakeRunner({ 'npx typecad-pcb query components --json': indexJson });
    const service = new BoardDataService(run);
    service.setFolder('C:/proj/hw');

    expect(await service.resolve('typecad')).toBeNull();
    expect(run.calls).toHaveLength(1);
  });

  it('invalidates on setFolder and invalidate', async () => {
    const run = fakeRunner({
      'npx typecad-pcb query components --json': indexJson,
      'npx typecad-pcb query component R1 --json': detailJson,
    });
    const service = new BoardDataService(run);
    service.setFolder('C:/proj/hw');
    await service.resolve('r1');

    service.setFolder('C:/proj/hw');
    await service.resolve('r1');
    expect(run.calls).toHaveLength(2); // same folder → still cached

    service.setFolder('C:/other/hw');
    await service.resolve('r1');
    expect(run.calls).toHaveLength(4); // folder switch → re-query everything
  });

  it('dedupes concurrent index queries', async () => {
    const run = fakeRunner({
      'npx typecad-pcb query components --json': indexJson,
      'npx typecad-pcb query component R1 --json': detailJson,
    });
    const service = new BoardDataService(run);
    service.setFolder('C:/proj/hw');

    await Promise.all([service.resolve('r1'), service.resolve('R1'), service.components()]);
    expect(run.calls.filter((c) => c.includes('components'))).toHaveLength(1);
  });

  it('dedupes concurrent detail queries for the same reference', async () => {
    const run = fakeRunner({
      'npx typecad-pcb query components --json': indexJson,
      'npx typecad-pcb query component R1 --json': detailJson,
    });
    const service = new BoardDataService(run);
    service.setFolder('C:/proj/hw');

    // a hover and a viewer reveal of the same part must share one query
    await Promise.all([service.resolve('r1'), service.resolve('R1')]);
    expect(run.calls.filter((c) => c.includes('component R1'))).toHaveLength(1);
  });

  it('a query racing an invalidate() never repopulates the cache with stale data', async () => {
    let releaseIndex: (value: string) => void = () => {};
    const indexGate = new Promise<string>((resolve) => {
      releaseIndex = resolve;
    });
    const run = vi.fn((_cwd: string, command: string) => {
      if (command.includes('components')) return indexGate;
      return Promise.resolve(detailJson);
    }) as unknown as QueryRunner & { mock: { calls: unknown[][] } };
    const service = new BoardDataService(run);
    service.setFolder('C:/proj/hw');

    const stale = service.components(); // in flight…
    service.invalidate(); // …the board changed mid-flight
    releaseIndex(indexJson);
    await stale;

    // the stale settle must not have cached: the next call re-queries
    await service.components();
    expect(run.mock.calls.filter((call) => String(call[1]).includes('components'))).toHaveLength(2);
  });

  it('flags missing-board failures so the hover can show a build hint', async () => {
    const run: QueryRunner = () =>
      Promise.reject(new Error("No .kicad_pcb found in C:/proj/hw/build. Run 'typecad-pcb build' first"));
    const service = new BoardDataService(run);
    service.setFolder('C:/proj/hw');

    await expect(service.resolve('r1')).rejects.toSatisfy((e: Error) => /No \.kicad_pcb/.test(e.message));
  });

  it('refuses to query without a folder', async () => {
    const service = new BoardDataService(fakeRunner({}));
    await expect(service.resolve('r1')).rejects.toThrow(/typecad\.conf\.ts/);
  });
});
