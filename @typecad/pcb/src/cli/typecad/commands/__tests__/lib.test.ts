// `typecad-pcb lib add/list` — fetch (mocked), cache, merge, offline power.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { ParsedArgs } from '../../parser.js';

const { run } = await import('../lib.js');

const SYMBOLS_RAW = 'https://gitlab.com/kicad/libraries/kicad-symbols/-/raw/master';
const TREE_API = 'https://gitlab.com/api/v4/projects/kicad%2Flibraries%2Fkicad-symbols/repository/tree';
const MODELS_RAW = 'https://gitlab.com/kicad/libraries/kicad-packages3D/-/raw/master';

const symLib = (name: string): string =>
  `(kicad_symbol_lib (version 20251024)\n  (symbol "${name}" (pin passive line (at 0 2.54 270) (name "~") (number "1"))))`;
const FOOTPRINT = `(footprint "Package_SO:SOIC-8" (layer "F.Cu"))`;
// `$`+`{` keeps the template literal from interpolating the env-var ref
const ENV_DIR = '$' + '{KICAD10_3DMODEL_DIR}';
const KIPRJMOD = '$' + '{KIPRJMOD}';
const FOOTPRINT_WITH_MODEL = `(footprint "Package_SO:SOIC-8" (layer "F.Cu")
  (model "${ENV_DIR}/Package_SO.3dshapes/SOIC-8_3.9x4.9mm_P1.27mm.step"
    (offset (xyz 0 0 0))))`;
const MODEL_STEP = `ISO-10303-21;\nHEADER;\nEND-ISO-10303-21;\n`;

/** Response fake with both text() and arrayBuffer() (models fetch binary) */
const fakeRes = (body: string, ok = true, status = 200) => ({
  ok,
  status,
  text: async () => body,
  arrayBuffer: async () => new TextEncoder().encode(body).buffer as ArrayBuffer,
});

let tmpProject: string;
let tmpCache: string;
let buildDir: string;
const fetchMock = vi.fn();

function parsedWith(sub: string, args: ParsedArgs['args'], positional: string[] = []): ParsedArgs {
  return { command: 'lib', subcommand: sub, args, positional, passthrough: [], json: false, help: false, version: false };
}

/** route mocked fetch by URL: tree API → JSON, symdir raw → symbol lib */
function mockRepo(files: Record<string, string>, tree: unknown[] = []) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.startsWith(TREE_API)) return fakeRes(JSON.stringify(tree));
    for (const [suffix, body] of Object.entries(files)) {
      if (url.endsWith(suffix)) return fakeRes(body);
    }
    return fakeRes('', false, 404);
  });
}

beforeEach(() => {
  tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-lib-'));
  tmpCache = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-libcache-'));
  buildDir = path.join(tmpProject, 'build');
  process.env.TYPECAD_BUILD_DIR = buildDir;
  process.env.TYPECAD_LIB_CACHE = tmpCache;
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  delete process.env.TYPECAD_BUILD_DIR;
  delete process.env.TYPECAD_LIB_CACHE;
  vi.unstubAllGlobals();
  fs.rmSync(tmpProject, { recursive: true, force: true });
  fs.rmSync(tmpCache, { recursive: true, force: true });
});

describe('typecad-pcb lib', () => {
  it('fetches a whole symbol library (tree listing + per-symbol files) and merges one lib file', async () => {
    mockRepo(
      { 'R_Small.kicad_sym': symLib('R_Small'), 'C_Small.kicad_sym': symLib('C_Small') },
      [
        { name: 'R_Small.kicad_sym', type: 'blob' },
        { name: 'C_Small.kicad_sym', type: 'blob' },
      ],
    );
    await run(parsedWith('add', {}, ['Device']));

    const dest = path.join(buildDir, 'lib', 'Device.kicad_sym');
    const merged = fs.readFileSync(dest, 'utf8');
    expect(merged).toContain('(symbol "R_Small"');
    expect(merged).toContain('(symbol "C_Small"');
    expect(merged.startsWith('(kicad_symbol_lib')).toBe(true);
    // cached per repo path for the next project
    expect(fs.existsSync(path.join(tmpCache, 'symbols', 'Device', 'R_Small.kicad_sym'))).toBe(true);
  });

  it('uses the cache on a second add (no second download)', async () => {
    mockRepo({ 'R_Small.kicad_sym': symLib('R_Small') }, [{ name: 'R_Small.kicad_sym', type: 'blob' }]);
    await run(parsedWith('add', {}, ['Device']));
    const calls = fetchMock.mock.calls.length;
    // same cache, fresh build dir: tree re-listed but no file re-downloaded
    const secondBuild = path.join(tmpProject, 'build2');
    process.env.TYPECAD_BUILD_DIR = secondBuild;
    await run(parsedWith('add', {}, ['Device']));
    // tree call only (+0 raw fetches)
    expect(fetchMock.mock.calls.length - calls).toBe(1);
    expect(fs.readFileSync(path.join(secondBuild, 'lib', 'Device.kicad_sym'), 'utf8')).toContain('(symbol "R_Small"');
  });

  it('fetches a single symbol via Lib:Symbol and accumulates into the project lib', async () => {
    mockRepo({ 'R_Small.kicad_sym': symLib('R_Small'), 'LED.kicad_sym': symLib('LED') });
    await run(parsedWith('add', {}, ['Device:R_Small']));
    expect(fetchMock).toHaveBeenCalledWith(`${SYMBOLS_RAW}/Device.kicad_symdir/R_Small.kicad_sym`, expect.anything());
    await run(parsedWith('add', {}, ['Device:LED']));
    const merged = fs.readFileSync(path.join(buildDir, 'lib', 'Device.kicad_sym'), 'utf8');
    expect(merged).toContain('(symbol "R_Small"');
    expect(merged).toContain('(symbol "LED"');
  });

  it('copies the bundled power library offline (no fetch)', async () => {
    await run(parsedWith('add', {}, ['power']));
    expect(fetchMock).not.toHaveBeenCalled();
    const dest = path.join(buildDir, 'lib', 'power.kicad_sym');
    expect(fs.existsSync(dest)).toBe(true);
    expect(fs.readFileSync(dest, 'utf8')).toMatch(/\(kicad_symbol_lib/);
  });

  it('fetches a single footprint into build/lib/footprints', async () => {
    fetchMock.mockImplementation(async (url: string) => fakeRes(FOOTPRINT, url.includes('kicad_mod')));
    await run(parsedWith('add', { footprint: 'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm' }, []));

    const dest = path.join(buildDir, 'lib', 'footprints', 'SOIC-8_3.9x4.9mm_P1.27mm.kicad_mod');
    expect(fs.readFileSync(dest, 'utf8')).toBe(FOOTPRINT);
    expect(fs.existsSync(path.join(tmpCache, 'footprints', 'Package_SO', 'SOIC-8_3.9x4.9mm_P1.27mm.kicad_mod'))).toBe(true);
  });

  it('reports an unknown library without writing anything', async () => {
    mockRepo({}, []);
    await run(parsedWith('add', {}, ['Mystery']));
    expect(fs.existsSync(path.join(buildDir, 'lib', 'Mystery.kicad_sym'))).toBe(false);
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });

  it('rejects a fetched payload that is not a symbol library', async () => {
    mockRepo({ 'Fake.kicad_sym': '<html>not a lib</html>' }, [{ name: 'Fake.kicad_sym', type: 'blob' }]);
    await run(parsedWith('add', {}, ['Device']));
    expect(fs.existsSync(path.join(buildDir, 'lib', 'Device.kicad_sym'))).toBe(false);
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });

  it('rejects malformed footprint specs', async () => {
    await run(parsedWith('add', { footprint: 'NoColonHere' }, []));
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });

  it('fetches the footprint\'s 3D model companion and rewrites the reference to KIPRJMOD', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('kicad_mod')) return fakeRes(FOOTPRINT_WITH_MODEL);
      if (url.startsWith(MODELS_RAW)) return fakeRes(MODEL_STEP);
      return fakeRes('', false, 404);
    });
    await run(parsedWith('add', { footprint: 'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm' }, []));

    // model landed, binary-cached and project-owned
    const model = path.join(buildDir, 'lib', '3dshapes', 'Package_SO.3dshapes', 'SOIC-8_3.9x4.9mm_P1.27mm.step');
    expect(fs.readFileSync(model, 'utf8')).toBe(MODEL_STEP);
    expect(fs.existsSync(path.join(tmpCache, '3dshapes', 'Package_SO.3dshapes', 'SOIC-8_3.9x4.9mm_P1.27mm.step'))).toBe(true);
    // the vendored footprint points at the project-owned copy
    const fp = fs.readFileSync(path.join(buildDir, 'lib', 'footprints', 'SOIC-8_3.9x4.9mm_P1.27mm.kicad_mod'), 'utf8');
    expect(fp).toContain(`(model "${KIPRJMOD}/lib/3dshapes/Package_SO.3dshapes/SOIC-8_3.9x4.9mm_P1.27mm.step"`);
    expect(fp).not.toContain('KICAD10_3DMODEL_DIR');
  });

  it('adds the footprint even when the 3D model 404s (warning, no failure)', async () => {
    fetchMock.mockImplementation(async (url: string) => fakeRes(FOOTPRINT_WITH_MODEL, url.includes('kicad_mod')));
    await run(parsedWith('add', { footprint: 'Package_SO:SOIC-8_3.9x4.9mm_P1.27mm' }, []));

    const fp = path.join(buildDir, 'lib', 'footprints', 'SOIC-8_3.9x4.9mm_P1.27mm.kicad_mod');
    expect(fs.existsSync(fp)).toBe(true);
    // no rewrite happened — the env-var reference is intact
    expect(fs.readFileSync(fp, 'utf8')).toContain('KICAD10_3DMODEL_DIR');
    expect(fs.existsSync(path.join(buildDir, 'lib', '3dshapes'))).toBe(false);
    expect(process.exitCode).toBe(0);
  });

  it('lists the active sources and build/lib contents', async () => {
    fs.mkdirSync(path.join(buildDir, 'lib'), { recursive: true });
    fs.writeFileSync(path.join(buildDir, 'lib', 'Device.kicad_sym'), symLib('R_Small'), 'utf8');
    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => logs.push(a.join(' ')));
    try {
      await run(parsedWith('list', {}, []));
    } finally {
      spy.mockRestore();
    }
    const out = logs.join('\n');
    expect(out).toContain('build/lib');
    expect(out).toContain('Device.kicad_sym');
    expect(out).toContain('power');
  });
});
