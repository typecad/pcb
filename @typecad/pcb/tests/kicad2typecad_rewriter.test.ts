import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SourceRewriter } from '../src/kicad2typecad/rewriter.js';
import type {
  KicadFootprintIR,
  KicadIR,
  KicadTextIR,
  MatchResult,
  CodeMetadata,
  PendingChange,
  TextLayoutIR,
} from '../src/kicad2typecad/types.js';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'typecad-rewriter-test-'));
}

function removeTempDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function makeFootprint(overrides: Partial<KicadFootprintIR> = {}): KicadFootprintIR {
  return {
    footprintName: 'Resistor_SMD:R_0603_1608Metric',
    reference: 'R1',
    position: { x: 10, y: 20, rotation: 90 },
    side: 'front',
    uuid: 'uuid-1',
    codeMetadata: null,
    referenceProperty: null,
    valueProperty: null,
    ...overrides,
  };
}

function makeMatchResult(overrides: Partial<KicadFootprintIR> = {}, filePath?: string): MatchResult {
  const fp = makeFootprint(overrides);
  return {
    irFootprint: fp,
    sourceLocation: filePath ? { filePath, variableName: 'r1', isThis: true } : null,
    matchConfidence: filePath ? 'uuid' : 'none',
  };
}

describe('SourceRewriter', () => {
  const rewriter = new SourceRewriter();

  describe('computeFootprintChanges', () => {
    it('should skip footprints without source location', () => {
      const results = [makeMatchResult()];
      const changes = rewriter.computeFootprintChanges(results);
      expect(changes).toHaveLength(0);
    });

    it('should detect position change with separate .pcb = line', () => {
      const tempDir = createTempDir();
      try {
        const srcFile = path.join(tempDir, 'board.ts');
        fs.writeFileSync(
          srcFile,
          [
            `import { Component } from '@typecad/pcb';`,
            `this.r1 = new Component({ reference: 'R1' });`,
            `this.r1.pcb = { x: 5, y: 10, rotation: 0 };`,
          ].join('\n'),
        );

        const results = [makeMatchResult({ position: { x: 10, y: 20, rotation: 0 } }, srcFile)];
        const changes = rewriter.computeFootprintChanges(results);
        expect(changes).toHaveLength(1);
        expect(changes[0].newX).toBe(10);
        expect(changes[0].newY).toBe(20);
      } finally {
        removeTempDir(tempDir);
      }
    });

    it('should detect inline pcb: change', () => {
      const tempDir = createTempDir();
      try {
        const srcFile = path.join(tempDir, 'board.ts');
        fs.writeFileSync(
          srcFile,
          [
            `import { Component } from '@typecad/pcb';`,
            `this.r1 = new Component({ reference: 'R1', pcb: { x: 5, y: 10, rotation: 0 } });`,
          ].join('\n'),
        );

        const results = [makeMatchResult({ position: { x: 15, y: 25, rotation: 45 } }, srcFile)];
        const changes = rewriter.computeFootprintChanges(results);
        expect(changes).toHaveLength(1);
        expect(changes[0].newX).toBe(15);
        expect(changes[0].newRotation).toBe(45);
      } finally {
        removeTempDir(tempDir);
      }
    });

    it('should detect side change', () => {
      const tempDir = createTempDir();
      try {
        const srcFile = path.join(tempDir, 'board.ts');
        fs.writeFileSync(
          srcFile,
          [
            `this.r1 = new Component({ reference: 'R1' });`,
            `this.r1.pcb = { x: 10, y: 20, rotation: 90, side: 'front' };`,
          ].join('\n'),
        );

        const results = [makeMatchResult({ side: 'back' }, srcFile)];
        const changes = rewriter.computeFootprintChanges(results);
        expect(changes).toHaveLength(1);
        expect(changes[0].newSide).toBe('back');
      } finally {
        removeTempDir(tempDir);
      }
    });

    it('should not generate change when position unchanged', () => {
      const tempDir = createTempDir();
      try {
        const srcFile = path.join(tempDir, 'board.ts');
        fs.writeFileSync(
          srcFile,
          [`this.r1 = new Component({ reference: 'R1' });`, `this.r1.pcb = { x: 10, y: 20, rotation: 90 };`].join('\n'),
        );

        const results = [makeMatchResult({ position: { x: 10, y: 20, rotation: 90 } }, srcFile)];
        const changes = rewriter.computeFootprintChanges(results);
        expect(changes).toHaveLength(0);
      } finally {
        removeTempDir(tempDir);
      }
    });

    it('should skip when file does not exist', () => {
      const results = [makeMatchResult({}, '/nonexistent/file.ts')];
      const changes = rewriter.computeFootprintChanges(results);
      expect(changes).toHaveLength(0);
    });
  });

  describe('computeTextChanges', () => {
    it('should detect text position change', () => {
      const tempDir = createTempDir();
      try {
        const srcFile = path.join(tempDir, 'board.ts');
        fs.writeFileSync(srcFile, `pcb.text({ text: 'Label1', x: 10, y: 20, rotation: 0, layer: 'F.SilkS' });\n`);

        const ir: KicadIR = {
          version: '20221018',
          generator: 'pcbnew',
          footprints: [],
          segments: [],
          vias: [],
          outlines: [],
          nets: [],
          textElements: [
            {
              text: 'Label1',
              x: 15,
              y: 25,
              rotation: 0,
              layer: 'F.SilkS',
            },
          ],
        };

        const changes = rewriter.computeTextChanges(ir, [srcFile]);
        expect(changes).toHaveLength(1);
        expect(changes[0].newX).toBe(15);
        expect(changes[0].newY).toBe(25);
      } finally {
        removeTempDir(tempDir);
      }
    });

    it('should detect text content change', () => {
      const tempDir = createTempDir();
      try {
        const srcFile = path.join(tempDir, 'board.ts');
        fs.writeFileSync(srcFile, `pcb.text({ text: 'OldLabel', x: 10, y: 20, rotation: 0, layer: 'F.SilkS' });\n`);

        const ir: KicadIR = {
          version: '20221018',
          generator: 'pcbnew',
          footprints: [],
          segments: [],
          vias: [],
          outlines: [],
          nets: [],
          textElements: [
            {
              text: 'NewLabel',
              x: 10,
              y: 20,
              rotation: 0,
              layer: 'F.SilkS',
            },
          ],
        };

        const changes = rewriter.computeTextChanges(ir, [srcFile]);
        expect(changes).toHaveLength(1);
        expect(changes[0].newPcbText).toBe('NewLabel');
        expect(changes[0].changedProps).toContain('text');
      } finally {
        removeTempDir(tempDir);
      }
    });

    it('should detect font/size changes', () => {
      const tempDir = createTempDir();
      try {
        const srcFile = path.join(tempDir, 'board.ts');
        fs.writeFileSync(
          srcFile,
          `pcb.text({ text: 'Styled', x: 0, y: 0, rotation: 0, layer: 'F.SilkS', font: 'Inter', width: 1, height: 2, thickness: 0.15, bold: false, italic: false });\n`,
        );

        const ir: KicadIR = {
          version: '20221018',
          generator: 'pcbnew',
          footprints: [],
          segments: [],
          vias: [],
          outlines: [],
          nets: [],
          textElements: [
            {
              text: 'Styled',
              x: 0,
              y: 0,
              rotation: 0,
              layer: 'F.SilkS',
              fontFace: 'Arial',
              fontSize: [3, 4],
              thickness: 0.2,
              bold: true,
              italic: true,
            },
          ],
        };

        const changes = rewriter.computeTextChanges(ir, [srcFile]);
        expect(changes).toHaveLength(1);
        expect(changes[0].changedProps).toContain('font');
        expect(changes[0].changedProps).toContain('size');
        expect(changes[0].changedProps).toContain('thickness');
        expect(changes[0].changedProps).toContain('bold');
        expect(changes[0].changedProps).toContain('italic');
      } finally {
        removeTempDir(tempDir);
      }
    });

    it('should return empty when no text elements', () => {
      const ir: KicadIR = {
        version: '0',
        generator: '',
        footprints: [],
        segments: [],
        vias: [],
        outlines: [],
        nets: [],
        textElements: [],
      };
      const changes = rewriter.computeTextChanges(ir, ['/dummy.ts']);
      expect(changes).toHaveLength(0);
    });

    it('should return empty when no matching source calls', () => {
      const tempDir = createTempDir();
      try {
        const srcFile = path.join(tempDir, 'board.ts');
        fs.writeFileSync(srcFile, `const x = 42;\n`);
        const ir: KicadIR = {
          version: '0',
          generator: '',
          footprints: [],
          segments: [],
          vias: [],
          outlines: [],
          nets: [],
          textElements: [{ text: 'Hello', x: 0, y: 0, rotation: 0, layer: 'F.SilkS' }],
        };
        const changes = rewriter.computeTextChanges(ir, [srcFile]);
        expect(changes).toHaveLength(0);
      } finally {
        removeTempDir(tempDir);
      }
    });
  });

  describe('applyFootprintChanges', () => {
    it('should update x/y/rotation in .pcb = line', async () => {
      const tempDir = createTempDir();
      try {
        const srcFile = path.join(tempDir, 'board.ts');
        const original = [
          `this.r1 = new Component({ reference: 'R1' });`,
          `this.r1.pcb = { x: 5, y: 10, rotation: 0 };`,
        ].join('\n');
        fs.writeFileSync(srcFile, original);

        const analysis = await import('../src/kicad2typecad/source_analyzer.js').then((m) => m.analyzeFile(srcFile));
        const pcbAssign = analysis?.pcbAssignments[0];
        expect(pcbAssign).toBeDefined();

        const change: PendingChange = {
          filePath: srcFile,
          variableName: 'r1',
          prefix: 'this.',
          oldX: 5,
          oldY: 10,
          oldRotation: 0,
          oldSide: 'front',
          newX: 15,
          newY: 25,
          newRotation: 45,
          newSide: 'front',
          label: 'test',
        };

        const result = rewriter.applyFootprintChanges([change]);
        expect(result.filesModified).toBe(1);
        const updated = fs.readFileSync(srcFile, 'utf-8');
        expect(updated).toContain('x: 15');
        expect(updated).toContain('y: 25');
        expect(updated).toContain('rotation: 45');
        expect(fs.existsSync(srcFile + '.backup')).toBe(true);
      } finally {
        removeTempDir(tempDir);
      }
    });

    it('should add side when switching to back', () => {
      const tempDir = createTempDir();
      try {
        const srcFile = path.join(tempDir, 'board.ts');
        fs.writeFileSync(
          srcFile,
          [`this.r1 = new Component({ reference: 'R1' });`, `this.r1.pcb = { x: 10, y: 20, rotation: 0 };`].join('\n'),
        );

        const change: PendingChange = {
          filePath: srcFile,
          variableName: 'r1',
          prefix: 'this.',
          oldX: 10,
          oldY: 20,
          oldRotation: 0,
          oldSide: 'front',
          newX: 10,
          newY: 20,
          newRotation: 0,
          newSide: 'back',
          label: 'test',
        };

        const result = rewriter.applyFootprintChanges([change]);
        expect(result.filesModified).toBe(1);
        const updated = fs.readFileSync(srcFile, 'utf-8');
        expect(updated).toContain("side: 'back'");
      } finally {
        removeTempDir(tempDir);
      }
    });
  });

  describe('computeLayoutChanges', () => {
    it('should detect referenceLayout change with separate assignment', () => {
      const tempDir = createTempDir();
      try {
        const srcFile = path.join(tempDir, 'board.ts');
        fs.writeFileSync(
          srcFile,
          [
            `import { Component } from '@typecad/pcb';`,
            `this.r1 = new Component({ reference: 'R1' });`,
            `this.r1.referenceLayout = { x: 0, y: -1.43 };`,
          ].join('\n'),
        );

        const newLayout: TextLayoutIR = { x: 0, y: -3 };
        const results = [makeMatchResult({ referenceLayout: newLayout }, srcFile)];
        const changes = rewriter.computeLayoutChanges(results);
        expect(changes).toHaveLength(1);
        expect(changes[0].layoutType).toBe('referenceLayout');
        expect(changes[0].changedProps).toContainEqual(expect.stringContaining('position'));
      } finally {
        removeTempDir(tempDir);
      }
    });

    it('should detect valueLayout change', () => {
      const tempDir = createTempDir();
      try {
        const srcFile = path.join(tempDir, 'board.ts');
        fs.writeFileSync(
          srcFile,
          [`this.r1 = new Component({ reference: 'R1', valueLayout: { x: 0, y: 1 } });`].join('\n'),
        );

        const newValueLayout: TextLayoutIR = { x: 0, y: 5, rotation: 90 };
        const results = [makeMatchResult({ valueLayout: newValueLayout }, srcFile)];
        const changes = rewriter.computeLayoutChanges(results);
        expect(changes).toHaveLength(1);
        expect(changes[0].layoutType).toBe('valueLayout');
        expect(changes[0].changedProps).toContainEqual(expect.stringContaining('position'));
      } finally {
        removeTempDir(tempDir);
      }
    });

    it('should detect no change when layouts match', () => {
      const tempDir = createTempDir();
      try {
        const srcFile = path.join(tempDir, 'board.ts');
        fs.writeFileSync(
          srcFile,
          [`this.r1 = new Component({ reference: 'R1' });`, `this.r1.referenceLayout = { x: 0, y: -3 };`].join('\n'),
        );

        const results = [makeMatchResult({ referenceLayout: { x: 0, y: -3 } }, srcFile)];
        const changes = rewriter.computeLayoutChanges(results);
        expect(changes).toHaveLength(0);
      } finally {
        removeTempDir(tempDir);
      }
    });

    it('should skip footprints without source location', () => {
      const results = [makeMatchResult({ referenceLayout: { x: 0, y: -3 } })];
      const changes = rewriter.computeLayoutChanges(results);
      expect(changes).toHaveLength(0);
    });

    it('should skip new layouts when captureLayouts is false and source has no layout', () => {
      const tempDir = createTempDir();
      try {
        const srcFile = path.join(tempDir, 'board.ts');
        fs.writeFileSync(
          srcFile,
          [`import { Component } from '@typecad/pcb';`, `this.r1 = new Component({ reference: 'R1' });`].join('\n'),
        );

        const newLayout: TextLayoutIR = { x: 0, y: -1.5 };
        const results = [makeMatchResult({ referenceLayout: newLayout }, srcFile)];
        const changes = rewriter.computeLayoutChanges(results, false);
        expect(changes).toHaveLength(0);
      } finally {
        removeTempDir(tempDir);
      }
    });

    it('should skip new layouts by default (no captureLayouts arg)', () => {
      const tempDir = createTempDir();
      try {
        const srcFile = path.join(tempDir, 'board.ts');
        fs.writeFileSync(srcFile, [`this.r1 = new Component({ reference: 'R1' });`].join('\n'));

        const results = [
          makeMatchResult(
            {
              referenceLayout: { x: 0, y: -1.5 },
              valueLayout: { x: 0, y: 1.5 },
              fabLayout: { x: 0, y: 0 },
            },
            srcFile,
          ),
        ];
        const changes = rewriter.computeLayoutChanges(results);
        expect(changes).toHaveLength(0);
      } finally {
        removeTempDir(tempDir);
      }
    });

    it('should generate new layouts when captureLayouts is true', () => {
      const tempDir = createTempDir();
      try {
        const srcFile = path.join(tempDir, 'board.ts');
        fs.writeFileSync(srcFile, [`this.r1 = new Component({ reference: 'R1' });`].join('\n'));

        const results = [
          makeMatchResult(
            {
              referenceLayout: { x: 0, y: -1.5 },
            },
            srcFile,
          ),
        ];
        const changes = rewriter.computeLayoutChanges(results, true);
        expect(changes).toHaveLength(1);
        expect(changes[0].layoutType).toBe('referenceLayout');
        expect(changes[0].oldLayout).toBeNull();
        expect(changes[0].newLayout.x).toBe(0);
        expect(changes[0].newLayout.y).toBe(-1.5);
      } finally {
        removeTempDir(tempDir);
      }
    });

    it('should still update existing layouts regardless of captureLayouts flag', () => {
      const tempDir = createTempDir();
      try {
        const srcFile = path.join(tempDir, 'board.ts');
        fs.writeFileSync(
          srcFile,
          [`this.r1 = new Component({ reference: 'R1' });`, `this.r1.referenceLayout = { x: 0, y: -1.43 };`].join('\n'),
        );

        const newLayout: TextLayoutIR = { x: 0, y: -3 };
        const results = [makeMatchResult({ referenceLayout: newLayout }, srcFile)];
        const changes = rewriter.computeLayoutChanges(results, false);
        expect(changes).toHaveLength(1);
        expect(changes[0].layoutType).toBe('referenceLayout');
      } finally {
        removeTempDir(tempDir);
      }
    });
  });

  describe('applyLayoutChanges', () => {
    it('should update existing referenceLayout assignment', () => {
      const tempDir = createTempDir();
      try {
        const srcFile = path.join(tempDir, 'board.ts');
        fs.writeFileSync(
          srcFile,
          [`this.r1 = new Component({ reference: 'R1' });`, `this.r1.referenceLayout = { x: 0, y: -1.43 };`].join('\n'),
        );

        const change = {
          filePath: srcFile,
          variableName: 'r1',
          prefix: 'this.',
          layoutType: 'referenceLayout' as const,
          oldLayout: { x: 0, y: -1.43 } as TextLayoutIR,
          newLayout: { x: 0, y: -3 } as TextLayoutIR,
          label: 'test',
          changedProps: ['position'],
        };

        const result = rewriter.applyLayoutChanges([change]);
        expect(result.filesModified).toBe(1);
        const updated = fs.readFileSync(srcFile, 'utf-8');
        expect(updated).toContain('y: -3');
        expect(updated).not.toContain('y: -1.43');
      } finally {
        removeTempDir(tempDir);
      }
    });

    it('should insert new layout assignment when none exists', () => {
      const tempDir = createTempDir();
      try {
        const srcFile = path.join(tempDir, 'board.ts');
        fs.writeFileSync(srcFile, [`this.r1 = new Component({ reference: 'R1' });`].join('\n'));

        const change = {
          filePath: srcFile,
          variableName: 'r1',
          prefix: 'this.',
          layoutType: 'fabLayout' as const,
          oldLayout: null as TextLayoutIR | null,
          newLayout: { x: 0, y: 1, rotation: 180 } as TextLayoutIR,
          label: 'test',
          changedProps: ['position', 'rotation'],
        };

        const result = rewriter.applyLayoutChanges([change]);
        expect(result.filesModified).toBe(1);
        const updated = fs.readFileSync(srcFile, 'utf-8');
        expect(updated).toContain('fabLayout = { x: 0, y: 1, rotation: 180 }');
      } finally {
        removeTempDir(tempDir);
      }
    });

    it('should update inline layout in constructor', () => {
      const tempDir = createTempDir();
      try {
        const srcFile = path.join(tempDir, 'board.ts');
        fs.writeFileSync(
          srcFile,
          [`this.r1 = new Component({ reference: 'R1', referenceLayout: { x: 0, y: -1 } });`].join('\n'),
        );

        const change = {
          filePath: srcFile,
          variableName: 'r1',
          prefix: 'this.',
          layoutType: 'referenceLayout' as const,
          oldLayout: { x: 0, y: -1 } as TextLayoutIR,
          newLayout: { x: 0, y: -5 } as TextLayoutIR,
          label: 'test',
          changedProps: ['position'],
        };

        const result = rewriter.applyLayoutChanges([change]);
        expect(result.filesModified).toBe(1);
        const updated = fs.readFileSync(srcFile, 'utf-8');
        expect(updated).toContain('y: -5');
      } finally {
        removeTempDir(tempDir);
      }
    });

    it('should add missing properties to existing fabLayout assignment', () => {
      const tempDir = createTempDir();
      try {
        const srcFile = path.join(tempDir, 'test.ts');
        fs.writeFileSync(
          srcFile,
          [
            `import { Component } from '@typecad/pcb';`,
            `this.r1 = new Component('Resistor_SMD:R_0603');`,
            `this.r1.fabLayout = { x: 0, y: 0 };`,
          ].join('\n'),
        );

        const change = {
          filePath: srcFile,
          variableName: 'r1',
          prefix: 'this.',
          layoutType: 'fabLayout' as const,
          oldLayout: { x: 0, y: 0 } as TextLayoutIR,
          newLayout: { x: 0, y: 0, layer: 'F.Fab', width: 0.4, height: 0.4, thickness: 0.06 } as TextLayoutIR,
          label: 'test',
          changedProps: ['layer', 'width', 'height', 'thickness'],
        };

        const result = rewriter.applyLayoutChanges([change]);
        expect(result.filesModified).toBe(1);
        const updated = fs.readFileSync(srcFile, 'utf-8');
        expect(updated).toContain('layer');
        expect(updated).toContain('0.4');
        expect(updated).toContain('0.06');
      } finally {
        removeTempDir(tempDir);
      }
    });
  });
});
