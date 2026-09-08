import { describe, it, expect, afterEach } from 'vitest';
import { PCB } from '../src/index.js';
import { Component } from '../src/component.js';
import type { TextEntry } from '../src/pcb/component_text.js';
import fs from 'node:fs';

const buildDir = './build';
const boardName = 'text_override_test';
const FOOTPRINT = 'Resistor_SMD:R_0805_2012Metric';
// R_0805 template: Reference at (0 -1.65 0) on F.SilkS, Value at (0 1.65 0) on F.Fab

/** Extract a balanced (property "Name" ...) block from the board file. */
function propertyBlock(content: string, name: string): string | undefined {
  const start = content.indexOf(`(property "${name}"`);
  if (start < 0) return undefined;
  let depth = 0;
  for (let i = start; i < content.length; i++) {
    if (content[i] === '(') depth++;
    else if (content[i] === ')') {
      depth--;
      if (depth === 0) return content.slice(start, i + 1);
    }
  }
  return undefined;
}

function makeComponent(overrides: Partial<ConstructorParameters<typeof Component>[0]> = {}) {
  return new Component({ footprint: FOOTPRINT, reference: 'R1', value: '10k', ...overrides });
}

describe('footprint text overrides', () => {
  afterEach(() => {
    for (const ext of ['kicad_pcb', 'kicad_sch', 'kicad_pro', 'net', 'csv']) {
      try {
        fs.rmSync(`${buildDir}/${boardName}.${ext}`);
      } catch {
        /* ignore */
      }
    }
  });

  describe('referenceLayout visibility (three-state show)', () => {
    it('show: false hides the reference designator and keeps its text and position', () => {
      const pcb = new PCB(boardName);
      const r1 = makeComponent();
      r1.pcb = { x: 30, y: 30 };
      r1.referenceLayout = { show: false };
      pcb.create(r1);

      const block = propertyBlock(fs.readFileSync(`${buildDir}/${boardName}.kicad_pcb`, 'utf8'), 'Reference');
      expect(block).toBeDefined();
      expect(block).toContain('(hide yes)');
      expect(block).toContain('"R1"');
      expect(block).toContain('(at 0 -1.65');
    });

    it('show: true writes an explicit hide no', () => {
      const pcb = new PCB(boardName);
      const r1 = makeComponent();
      r1.pcb = { x: 30, y: 30 };
      r1.referenceLayout = { show: true };
      pcb.create(r1);

      const block = propertyBlock(fs.readFileSync(`${buildDir}/${boardName}.kicad_pcb`, 'utf8'), 'Reference');
      expect(block).toContain('(hide no)');
    });

    it('omitting show leaves the footprint visibility untouched', () => {
      const pcb = new PCB(boardName);
      const r1 = makeComponent();
      r1.pcb = { x: 30, y: 30 };
      r1.referenceLayout = { y: -3 };
      pcb.create(r1);

      const block = propertyBlock(fs.readFileSync(`${buildDir}/${boardName}.kicad_pcb`, 'utf8'), 'Reference');
      expect(block).not.toContain('(hide');
      // y overridden, x and rotation preserved from the template
      expect(block).toContain('(at 0 -3 0)');
    });

    it('partial position override keeps the other coordinate', () => {
      const pcb = new PCB(boardName);
      const r1 = makeComponent();
      r1.pcb = { x: 30, y: 30 };
      r1.referenceLayout = { x: 2 };
      pcb.create(r1);

      const block = propertyBlock(fs.readFileSync(`${buildDir}/${boardName}.kicad_pcb`, 'utf8'), 'Reference');
      expect(block).toContain('(at 2 -1.65');
    });
  });

  describe('component.text entries (all fields optional)', () => {
    it('a Reference entry with only show hides the designator without moving or retyping it', () => {
      const pcb = new PCB(boardName);
      const r1 = makeComponent();
      r1.pcb = { x: 30, y: 30 };
      r1.text = [{ property: 'Reference', show: false }];
      pcb.create(r1);

      const block = propertyBlock(fs.readFileSync(`${buildDir}/${boardName}.kicad_pcb`, 'utf8'), 'Reference');
      expect(block).toContain('(hide yes)');
      expect(block).toContain('"R1"');
      expect(block).toContain('(at 0 -1.65');
      expect(block).toContain('"F.SilkS"');
    });

    it('a Value entry with only fontSize restyles without moving or retyping', () => {
      const pcb = new PCB(boardName);
      const r1 = makeComponent();
      r1.pcb = { x: 30, y: 30 };
      r1.text = [{ property: 'Value', fontSize: 2 }];
      pcb.create(r1);

      const block = propertyBlock(fs.readFileSync(`${buildDir}/${boardName}.kicad_pcb`, 'utf8'), 'Value');
      expect(block).toContain('"10k"');
      expect(block).toContain('(size 2 2)');
      expect(block).toContain('(at 0 1.65');
      expect(block).toContain('"F.Fab"');
      expect(block).not.toContain('(hide');
    });

    it('an explicit text replacement still works', () => {
      const pcb = new PCB(boardName);
      const r1 = makeComponent();
      r1.pcb = { x: 30, y: 30 };
      r1.text = [{ property: 'Reference', text: 'F1', x: 0, y: -3 }];
      pcb.create(r1);

      const block = propertyBlock(fs.readFileSync(`${buildDir}/${boardName}.kicad_pcb`, 'utf8'), 'Reference');
      expect(block).toContain('"F1"');
      expect(block).toContain('(at 0 -3');
    });

    it('creates a custom property when text is given', () => {
      const pcb = new PCB(boardName);
      const r1 = makeComponent();
      r1.pcb = { x: 30, y: 30 };
      r1.text = [{ property: 'MPN', text: 'RC0805FR-071KL', x: 0, y: 3 }];
      pcb.create(r1);

      const content = fs.readFileSync(`${buildDir}/${boardName}.kicad_pcb`, 'utf8');
      const block = propertyBlock(content, 'MPN');
      expect(block).toContain('"RC0805FR-071KL"');
      expect(block).toContain('"F.Fab"'); // default layer for non-Reference
      expect(block).toContain('(hide no)');
    });

    it('skips a custom property with no text (nothing to render)', () => {
      const pcb = new PCB(boardName);
      const r1 = makeComponent();
      r1.pcb = { x: 30, y: 30 };
      r1.text = [{ property: 'Mystery', show: false }];
      pcb.create(r1);

      const content = fs.readFileSync(`${buildDir}/${boardName}.kicad_pcb`, 'utf8');
      expect(content).not.toContain('(property "Mystery"');
    });

    it('accepts known and arbitrary property names (autocomplete union)', () => {
      const entries: TextEntry[] = [
        { property: 'Reference', show: false },
        { property: 'Datasheet', x: 1 },
        { property: 'TotallyCustom', text: 'hi', x: 0, y: 0 },
      ];
      expect(entries).toHaveLength(3);
    });
  });

  describe('stitching interaction', () => {
    const A = `${boardName}_vis`;
    const B = `${boardName}_hid`;

    afterEach(() => {
      for (const name of [A, B]) {
        for (const ext of ['kicad_pcb', 'kicad_sch', 'kicad_pro', 'net', 'csv']) {
          try {
            fs.rmSync(`${buildDir}/${name}.${ext}`);
          } catch {
            /* ignore */
          }
        }
      }
    });

    function viaPositions(boardFile: string): Array<{ x: number; y: number }> {
      const matches = [...boardFile.matchAll(/\(via\s+\(at\s+([-\d.]+)\s+([-\d.]+)/g)];
      return matches.map((m) => ({ x: parseFloat(m[1]), y: parseFloat(m[2]) }));
    }

    it('a hidden reference no longer reserves a via-avoidance box', () => {
      // Reference text sits 3mm above the component; with a fine stitch pitch
      // candidates land inside the text box only when the text is hidden.
      const build = (name: string, show: boolean) => {
        const pcb = new PCB(name, { layers: 4 });
        pcb.outline(0, 0, 40, 30);
        pcb.plane('GND', 'In2.Cu');
        const r1 = makeComponent();
        r1.pcb = { x: 20, y: 15 };
        r1.referenceLayout = { x: 0, y: -3, show };
        pcb.add(r1);
        pcb.named('GND').net(r1.pin(1));
        pcb.stitch('GND', { pitch: 0.9 });
        pcb.create(r1);
        return fs.readFileSync(`${buildDir}/${name}.kicad_pcb`, 'utf8');
      };

      const visible = viaPositions(build(A, true));
      const hidden = viaPositions(build(B, false));
      expect(visible.length).toBeGreaterThan(0);

      // Window around the reference text location (20, 12)
      const inWindow = (v: { x: number; y: number }) => Math.abs(v.x - 20) <= 0.75 && Math.abs(v.y - 12) <= 0.75;
      expect(visible.some(inWindow)).toBe(false);
      expect(hidden.some(inWindow)).toBe(true);
    });
  });
});
