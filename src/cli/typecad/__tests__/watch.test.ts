import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { collectLocalDependencies, startWatchLoop } from '../watch.js';

let dir: string;
let entry: string;

function write(rel: string, content: string): string {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
  return file;
}

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-watch-'));
  entry = write(
    'main.ts',
    [
      "import { b } from './b';",
      "import { pad } from './nested/pad';",
      "import { PCB } from '@typecad/pcb';",
      "import 'https://example.com/remote.js';",
      'export const x = 1;',
    ].join('\n'),
  );
  write('b.ts', "import { c } from './c.js';\nexport const b = 1;");
  write('c.ts', 'export const c = 2;');
  write('nested/pad.ts', 'export const pad = 3;');
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function waitFor(predicate: () => boolean, timeoutMs = 4000): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() - started > timeoutMs) return reject(new Error('waitFor timeout'));
      setTimeout(tick, 25);
    };
    tick();
  });
}

describe('collectLocalDependencies', () => {
  it('follows relative imports transitively, including .js → .ts resolution', () => {
    const deps = collectLocalDependencies(entry).map((f) => path.relative(dir, f)).sort();
    expect(deps).toEqual(['b.ts', 'c.ts', 'main.ts', path.join('nested', 'pad.ts')]);
  });

  it('ignores bare package specifiers, URLs, and missing files', () => {
    // covered by the fixture above (@typecad/pcb + https import not in deps)
    const solo = write('solo.ts', "import './missing.js';\nimport 'left-pad';");
    expect(collectLocalDependencies(solo)).toEqual([solo]);
  });

  it('terminates on cyclic imports', () => {
    const a = write('cyc-a.ts', "import './cyc-b.js';");
    write('cyc-b.ts', "import './cyc-a.js';");
    expect(collectLocalDependencies(a)).toHaveLength(2);
  });

  it('resolves .mjs and .cjs specifiers to their .mts/.cts sources', () => {
    write('emitter.mts', 'export const e = 1;');
    write('config.cts', 'export const cfg = 2;');
    const host = write('host.ts', "import { e } from './emitter.mjs';\nimport { cfg } from './config.cjs';");
    const deps = collectLocalDependencies(host).map((f) => path.relative(dir, f));
    expect(deps).toContain('emitter.mts');
    expect(deps).toContain('config.cts');
  });
});

describe('startWatchLoop', () => {
  it('fires a debounced callback when a dependency changes', async () => {
    const changed: string[] = [];
    const handle = startWatchLoop(entry, (file) => changed.push(file), 50);
    try {
      fs.appendFileSync(path.join(dir, 'b.ts'), '\n// touched\n');
      await waitFor(() => changed.length > 0);
      expect(changed[0]).toBe(path.join(dir, 'b.ts'));
    } finally {
      handle.close();
    }
  });

  it('stops delivering events after close()', async () => {
    const changed: string[] = [];
    const handle = startWatchLoop(entry, (file) => changed.push(file), 50);
    handle.close();
    fs.appendFileSync(path.join(dir, 'c.ts'), '\n// touched after close\n');
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(changed).toHaveLength(0);
  });
});
