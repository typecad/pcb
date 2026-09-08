import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SourceMatcher } from '../src/kicad2typecad/matcher.js';
import { collectTypeScriptFiles } from '../src/kicad2typecad/source_analyzer.js';
import type { KicadFootprintIR, CodeMetadata, LegacyCodeMetadata } from '../src/kicad2typecad/types.js';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-matcher-test-'));
}

function removeTempDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function makeFootprint(overrides: Partial<KicadFootprintIR> = {}): KicadFootprintIR {
  return {
    footprintName: 'Resistor_SMD:R_0603_1608Metric',
    reference: 'R1',
    position: { x: 10, y: 20, rotation: 0 },
    side: 'front',
    uuid: 'test-uuid-1',
    codeMetadata: null,
    referenceProperty: null,
    valueProperty: null,
    ...overrides,
  };
}

describe('SourceMatcher', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tempDir);
  });

  describe('matchAll with Code metadata', () => {
    it('should match footprint using variable name + file from metadata', () => {
      const srcFile = path.join(tempDir, 'index.ts');
      fs.writeFileSync(
        srcFile,
        `import { Component } from '@typecad/pcb';\nthis.r1 = new Component({ reference: 'R1' });\n`,
      );

      const meta: CodeMetadata = { v: 1, u: 'uuid-1', n: 'r1', t: true, f: srcFile };
      const fp = makeFootprint({ codeMetadata: meta });
      const matcher = new SourceMatcher(tempDir);
      const results = matcher.matchAll([fp]);
      expect(results).toHaveLength(1);
      expect(results[0].sourceLocation).not.toBeNull();
      expect(results[0].sourceLocation!.variableName).toBe('r1');
      expect(results[0].sourceLocation!.isThis).toBe(true);
      expect(results[0].matchConfidence).toBe('uuid');
    });

    it('should return null when file does not exist', () => {
      const meta: CodeMetadata = { v: 1, u: 'uuid-1', n: 'r1', t: true, f: '/nonexistent/file.ts' };
      const fp = makeFootprint({ codeMetadata: meta });
      const matcher = new SourceMatcher(tempDir);
      const results = matcher.matchAll([fp]);
      expect(results[0].sourceLocation).toBeNull();
      expect(results[0].matchConfidence).toBe('none');
    });

    it('should scan all source files when file path is missing', () => {
      const srcFile = path.join(tempDir, 'main.ts');
      fs.writeFileSync(srcFile, `const led = new Component({ reference: 'D1' });\n`);

      const meta: CodeMetadata = { v: 1, u: 'uuid-2', n: 'led', t: false };
      const fp = makeFootprint({ codeMetadata: meta, reference: 'D1' });
      const matcher = new SourceMatcher(tempDir);
      const results = matcher.matchAll([fp]);
      expect(results[0].sourceLocation).not.toBeNull();
      expect(results[0].sourceLocation!.variableName).toBe('led');
    });
  });

  describe('matchAll with legacy metadata', () => {
    it('should handle legacy Code metadata', () => {
      const srcFile = path.join(tempDir, 'legacy.ts');
      fs.writeFileSync(srcFile, `this.cap = new Component({ reference: 'C1' });\n`);

      const meta: LegacyCodeMetadata = { v: 0, u: '', n: 'cap', t: true, f: srcFile };
      const fp = makeFootprint({ codeMetadata: meta, reference: 'C1' });
      const matcher = new SourceMatcher(tempDir);
      const results = matcher.matchAll([fp]);
      expect(results[0].sourceLocation).not.toBeNull();
      expect(results[0].matchConfidence).toBe('variable-fallback');
    });
  });

  describe('matchAll without metadata (reference fallback)', () => {
    it('should find by reference + footprint name on same line', () => {
      const srcFile = path.join(tempDir, 'board.ts');
      fs.writeFileSync(
        srcFile,
        `const resistor = new Component({ reference: 'R1', footprint: 'Resistor_SMD:R_0603_1608Metric' });\n`,
      );

      const fp = makeFootprint({ codeMetadata: null });
      const matcher = new SourceMatcher(tempDir);
      const results = matcher.matchAll([fp]);
      expect(results[0].sourceLocation).not.toBeNull();
      expect(results[0].sourceLocation!.variableName).toBe('resistor');
    });

    it('should return none when no match found', () => {
      const fp = makeFootprint({ codeMetadata: null, reference: 'X99' });
      const matcher = new SourceMatcher(tempDir);
      const results = matcher.matchAll([fp]);
      expect(results[0].sourceLocation).toBeNull();
      expect(results[0].matchConfidence).toBe('none');
    });
  });

  describe('matchAll with file+line but no variable name', () => {
    it('should find component by file path and line number when variable name is missing', () => {
      const srcFile = path.join(tempDir, 'board.ts');
      const lines = [
        `import { Resistor } from '@typecad/passives/0603';`,
        `let r1 = new Resistor();`,
        `let r2 = new Resistor({ value: '10k' });`,
      ];
      fs.writeFileSync(srcFile, lines.join('\n') + '\n');

      const meta: CodeMetadata = { v: 1, u: '', f: srcFile, l: 2 };
      const fp = makeFootprint({ codeMetadata: meta, reference: 'R1' });
      const matcher = new SourceMatcher(tempDir);
      const results = matcher.matchAll([fp]);
      expect(results[0].sourceLocation).not.toBeNull();
      expect(results[0].sourceLocation!.variableName).toBe('r1');
      expect(results[0].sourceLocation!.isThis).toBe(false);
    });

    it('should match second component on different line', () => {
      const srcFile = path.join(tempDir, 'board.ts');
      const lines = [
        `import { Resistor } from '@typecad/passives/0603';`,
        `let r1 = new Resistor();`,
        `let r2 = new Resistor({ value: '10k' });`,
      ];
      fs.writeFileSync(srcFile, lines.join('\n') + '\n');

      const meta: CodeMetadata = { v: 1, u: '', f: srcFile, l: 3 };
      const fp = makeFootprint({ codeMetadata: meta, reference: 'R2' });
      const matcher = new SourceMatcher(tempDir);
      const results = matcher.matchAll([fp]);
      expect(results[0].sourceLocation).not.toBeNull();
      expect(results[0].sourceLocation!.variableName).toBe('r2');
    });
  });

  describe('findVariableInFile', () => {
    it('should match this.X = new ... pattern', () => {
      const srcFile = path.join(tempDir, 'test.ts');
      fs.writeFileSync(srcFile, `    this.led = new Component({ reference: 'D1' });\n`);
      const matcher = new SourceMatcher(tempDir);
      const loc = matcher.findVariableInFile(srcFile, 'led', true);
      expect(loc).not.toBeNull();
      expect(loc!.isThis).toBe(true);
    });

    it('should match const X = new ... pattern', () => {
      const srcFile = path.join(tempDir, 'test.ts');
      fs.writeFileSync(srcFile, `const sensor = new Component({ reference: 'U1' });\n`);
      const matcher = new SourceMatcher(tempDir);
      const loc = matcher.findVariableInFile(srcFile, 'sensor', false);
      expect(loc).not.toBeNull();
      expect(loc!.isThis).toBe(false);
    });

    it('should resolve relative paths', () => {
      const subDir = path.join(tempDir, 'src');
      fs.mkdirSync(subDir);
      const srcFile = path.join(subDir, 'app.ts');
      fs.writeFileSync(srcFile, `this.button = new Component({});\n`);
      const matcher = new SourceMatcher(tempDir);
      const loc = matcher.findVariableInFile(path.join('src', 'app.ts'), 'button', true);
      expect(loc).not.toBeNull();
    });
  });

  describe('collectTypeScriptFiles', () => {
    it('should find .ts, .tsx, .mts, .cts files', () => {
      fs.writeFileSync(path.join(tempDir, 'a.ts'), '');
      fs.writeFileSync(path.join(tempDir, 'b.tsx'), '');
      fs.writeFileSync(path.join(tempDir, 'c.mts'), '');
      fs.writeFileSync(path.join(tempDir, 'd.cts'), '');
      fs.writeFileSync(path.join(tempDir, 'e.js'), '');
      const matcher = new SourceMatcher(tempDir);
      const fp = makeFootprint({ codeMetadata: null, reference: 'X0' });
      const results = matcher.matchAll([fp]);
      expect(results[0].matchConfidence).toBe('none');
    });

    it('should skip node_modules, dist, build, .git directories', () => {
      for (const dir of ['node_modules', 'dist', 'build', '.git']) {
        const subDir = path.join(tempDir, dir);
        fs.mkdirSync(subDir);
        fs.writeFileSync(path.join(subDir, 'hidden.ts'), `const x = new Component({});\n`);
      }
      fs.writeFileSync(path.join(tempDir, 'visible.ts'), '');
      const matcher = new SourceMatcher(tempDir);
      const fp = makeFootprint({ codeMetadata: null, reference: 'X0' });
      const results = matcher.matchAll([fp]);
      expect(results[0].matchConfidence).toBe('none');
    });
  });

  describe('regression: src/ subdirectory matching', () => {
    it('should match components in src/ subdirectory when sourceRoot has src/ subdirectory', () => {
      const srcDir = path.join(tempDir, 'src');
      fs.mkdirSync(srcDir);
      const srcFile = path.join(srcDir, 'board.ts');
      fs.writeFileSync(srcFile, `const r1 = new Component({ reference: 'R1' });\n`);

      const meta: CodeMetadata = { v: 1, u: '', n: 'r1' };
      const fp = makeFootprint({ codeMetadata: meta, reference: 'R1' });
      const matcher = new SourceMatcher(srcDir);
      const results = matcher.matchAll([fp]);
      expect(results[0].sourceLocation).not.toBeNull();
      expect(results[0].sourceLocation!.variableName).toBe('r1');
    });

    it('should match components when sourceRoot is a relative path to src/ subdirectory', () => {
      const srcDir = path.join(tempDir, 'src');
      fs.mkdirSync(srcDir);
      fs.writeFileSync(path.join(srcDir, 'main.ts'), `const r1 = new Component({ reference: 'R1' });\n`);

      const origCwd = process.cwd();
      try {
        process.chdir(tempDir);
        const meta: CodeMetadata = { v: 1, u: '', n: 'r1' };
        const fp = makeFootprint({ codeMetadata: meta, reference: 'R1' });
        const matcher = new SourceMatcher('./src');
        const results = matcher.matchAll([fp]);
        expect(results[0].sourceLocation).not.toBeNull();
        expect(results[0].sourceLocation!.variableName).toBe('r1');
      } finally {
        process.chdir(origCwd);
      }
    });

    it('should match imported-class components (Resistor, LED) by variable name via findVariableInSources', () => {
      const srcDir = path.join(tempDir, 'src');
      fs.mkdirSync(srcDir);
      const srcFile = path.join(srcDir, 'main.ts');
      fs.writeFileSync(
        srcFile,
        [
          `import { Component, PCB } from '@typecad/pcb'`,
          `import { Resistor, LED } from '@typecad/passives/0805'`,
          ``,
          `const r1 = new Resistor({ value: '1 kOhm' });`,
          `const d1 = new LED({});`,
          `const bt1 = new Component({ footprint: 'Battery:BatteryHolder_Keystone_500' });`,
        ].join('\n') + '\n',
      );

      const matcher = new SourceMatcher(srcDir);

      const fpR1 = makeFootprint({
        codeMetadata: { v: 1, u: '', n: 'r1' } as CodeMetadata,
        reference: 'R1',
        footprintName: 'Resistor_SMD:R_0805_2012Metric',
      });
      const fpD1 = makeFootprint({
        codeMetadata: { v: 1, u: '', n: 'd1' } as CodeMetadata,
        reference: 'D1',
        footprintName: 'LED_SMD:LED_0805_2012Metric',
      });
      const fpBt1 = makeFootprint({
        codeMetadata: { v: 1, u: '', n: 'bt1' } as CodeMetadata,
        reference: 'BT1',
        footprintName: 'Battery:BatteryHolder_Keystone_500',
      });

      const results = matcher.matchAll([fpR1, fpD1, fpBt1]);
      expect(results).toHaveLength(3);
      for (const r of results) {
        expect(r.sourceLocation).not.toBeNull();
      }
      expect(results[0].sourceLocation!.variableName).toBe('r1');
      expect(results[1].sourceLocation!.variableName).toBe('d1');
      expect(results[2].sourceLocation!.variableName).toBe('bt1');
    });

    it('should match by footprint fallback for object constructor without explicit reference', () => {
      const srcDir = path.join(tempDir, 'src');
      fs.mkdirSync(srcDir);
      const srcFile = path.join(srcDir, 'board.ts');
      fs.writeFileSync(srcFile, `const bt1 = new Component({ footprint: 'Battery:BatteryHolder_Keystone_500' });\n`);

      const fp = makeFootprint({
        codeMetadata: null,
        reference: 'BT1',
        footprintName: 'Battery:BatteryHolder_Keystone_500',
      });
      const matcher = new SourceMatcher(srcDir);
      const results = matcher.matchAll([fp]);
      expect(results[0].sourceLocation).not.toBeNull();
      expect(results[0].sourceLocation!.variableName).toBe('bt1');
      expect(results[0].matchConfidence).toBe('variable-fallback');
    });
  });

  describe('collectTypeScriptFiles returns absolute paths', () => {
    it('should return absolute paths when given a relative-style directory', () => {
      const srcDir = path.join(tempDir, 'src');
      fs.mkdirSync(srcDir);
      fs.writeFileSync(path.join(srcDir, 'a.ts'), '');
      fs.writeFileSync(path.join(srcDir, 'b.ts'), '');

      const files = collectTypeScriptFiles(srcDir);
      expect(files).toHaveLength(2);
      for (const f of files) {
        expect(path.isAbsolute(f)).toBe(true);
        expect(fs.existsSync(f)).toBe(true);
      }
    });

    it('should return absolute paths for nested subdirectories', () => {
      const srcDir = path.join(tempDir, 'src');
      const subDir = path.join(srcDir, 'lib');
      fs.mkdirSync(subDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, 'root.ts'), '');
      fs.writeFileSync(path.join(subDir, 'nested.ts'), '');

      const files = collectTypeScriptFiles(srcDir);
      expect(files).toHaveLength(2);
      for (const f of files) {
        expect(path.isAbsolute(f)).toBe(true);
      }
    });
  });
});
