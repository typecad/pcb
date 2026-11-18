import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { loadSymbolLib, getSymbolReferencePrefix } from '../src/renderers/component_symbol_loader.js';
import { SymbolLibraryManager } from '../src/symbol_library_manager.js';
import { loadFootprintLib } from '../src/pcb/component_footprint_loader.js';
import { getFootprintBounds } from '../src/pcb/footprint_bounds.js';

vi.mock('../src/kicad.js', () => ({ libraryRoots: () => ({}) }));

describe('automatic KiCad library downloads', () => {
  it('fetches only missing entries, resolves inheritance, and rebuilds offline from project files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-auto-lib-'));
    try {
      const build = path.join(dir, 'build');
      const cache = path.join(dir, 'cache');
      const preload = path.join(dir, 'mock-fetch.cjs');
      const requests = path.join(dir, 'requests.txt');
      const payloads = {
        'TestIC.kicad_symdir/Derived.kicad_sym': '(kicad_symbol_lib (symbol "Derived" (extends "Parent")))',
        'TestIC.kicad_symdir/Parent.kicad_sym': '(kicad_symbol_lib (symbol "Parent" (property "Reference" "IC")))',
        'TestPkg.pretty/Chip.kicad_mod': '(footprint "Chip" (pad "1" smd rect (at 0 0) (size 2 2)))',
      };
      fs.writeFileSync(
        preload,
        `
        const files = ${JSON.stringify(payloads)};
        global.fetch = async url => {
          const key = url.split('/').slice(-2).join('/');
          require('node:fs').appendFileSync(${JSON.stringify(requests)}, key + '\\n');
          return new Response(files[key] || '', { status: files[key] ? 200 : 404 });
        };
      `,
      );
      vi.stubEnv('TYPECAD_BUILD_DIR', build);
      vi.stubEnv('TYPECAD_LIB_CACHE', cache);
      vi.stubEnv('NODE_OPTIONS', '--require ' + JSON.stringify(preload));
      fs.mkdirSync(path.join(build, 'lib'), { recursive: true });
      fs.writeFileSync(path.join(build, 'lib/TestIC.kicad_sym'), '(kicad_symbol_lib (symbol "Local"))');

      const manager = new SymbolLibraryManager();
      expect(manager.getSymbolDefinition('TestIC:Local')).toBeTruthy();
      expect(manager.hasSymbol('TestIC:Derived')).toBe(false);
      expect(fs.existsSync(requests)).toBe(false);
      expect(manager.getSymbolDefinition('TestIC:Derived')?.serializedLibEntry).toContain('TestIC:Derived');
      expect(getSymbolReferencePrefix('TestIC:Derived')).toBe('IC');
      expect(getFootprintBounds('TestPkg:Chip')?.width).toBe(2);
      expect(loadFootprintLib('TestPkg:Chip', 'U1', '', undefined)).toContain('Chip');
      expect(fs.readFileSync(requests, 'utf8').trim().split('\n')).toEqual(Object.keys(payloads));

      // A second project can populate its own files from the shared cache.
      vi.stubEnv('TYPECAD_BUILD_DIR', path.join(dir, 'other-project'));
      expect(loadSymbolLib('TestIC:Derived', 'IC1', '', undefined)).toContain('TestIC:Derived');
      expect(loadFootprintLib('TestPkg:Chip', 'U1', '', undefined)).toContain('Chip');
      vi.stubEnv('TYPECAD_LIB_CACHE', path.join(dir, 'empty-cache'));
      expect(new SymbolLibraryManager().getSymbolDefinition('TestIC:Derived')).toBeTruthy();
      expect(loadFootprintLib('TestPkg:Chip', 'U1', '', undefined)).toContain('Chip');
      expect(fs.readFileSync(requests, 'utf8').trim().split('\n')).toEqual(Object.keys(payloads));
      expect(() => loadFootprintLib('TestPkg:Absent', 'U2', '', undefined)).toThrow(/HTTP 404/);
    } finally {
      vi.unstubAllEnvs();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
