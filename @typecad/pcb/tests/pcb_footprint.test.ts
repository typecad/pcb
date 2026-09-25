import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parse, serialize, Sym, s, sym, yes, no, nameOf } from '../src/sexpr/index.js';
import type { SExpr } from '../src/sexpr/types.js';
import { processFootprintItem, updateFootprintNode, createFootprintNode } from '../src/pcb/pcb_footprint.js';
import { Component } from '../src/component.js';
import type { INetResolution } from '../src/pcb/pcb_interfaces.js';
import * as pcbUtils from '../src/pcb/pcb_utils.js';

vi.mock('../src/pcb/pcb_utils.js', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof pcbUtils;
  return {
    ...actual,
    generateUuid: vi.fn(() => '00000000-0000-0000-0000-000000000001'),
    formatSourceInfoForProperty: vi.fn(() => 'encoded-source-info'),
    getErrorMessage: actual.getErrorMessage,
  };
});

vi.mock('../src/pcb/component_footprint_loader.js', () => ({
  loadFootprintLib: vi.fn(
    (_footprint: string, _ref: string, _val: string, _cached: string | undefined) =>
      '(footprint "Resistor_SMD:R_0603" (layer "F.Cu") (at 0 0 0))',
  ),
}));

function defaultResolveNet(_ref: string, _pin: string, _uuid?: string, _map?: Map<string, number>): INetResolution {
  return { found: false, netCode: 0, netName: '' };
}

describe('processFootprintItem', () => {
  it('updates property Reference from component', () => {
    const comp = new Component({ footprint: 'Resistor_SMD:R_0603', reference: 'R1', value: '10k' });
    const prop: SExpr[] = [
      'property',
      'Reference',
      'R?',
      ['at', 0, 0, 0],
      ['layer', 'F.Fab'],
      ['effects', ['font', ['size', 1, 1], ['thickness', 0.15]]],
    ];
    processFootprintItem(prop as SexprNode, comp, defaultResolveNet);
    expect(prop[2]).toBe('R1');
  });

  it('updates property Value from component', () => {
    const comp = new Component({ footprint: 'Resistor_SMD:R_0603', reference: 'R1', value: '10k' });
    const prop: SExpr[] = ['property', 'Value', 'R', ['layer', 'F.Fab']];
    processFootprintItem(prop as SexprNode, comp, defaultResolveNet);
    expect(prop[2]).toBe('10k');
  });

  it('updates property Footprint from component', () => {
    const comp = new Component({ footprint: 'Resistor_SMD:R_0603', reference: 'R1' });
    const prop: SExpr[] = ['property', 'Footprint', '', ['layer', 'F.Fab']];
    processFootprintItem(prop as SexprNode, comp, defaultResolveNet);
    expect(prop[2]).toBe('Resistor_SMD:R_0603');
  });

  it('updates property Datasheet and sanitizes value', () => {
    const comp = new Component({
      footprint: 'Resistor_SMD:R_0603',
      reference: 'R1',
      datasheet: 'https://example.com/ds.pdf',
    });
    const prop: SExpr[] = ['property', 'Datasheet', '', ['layer', 'F.Fab']];
    processFootprintItem(prop as SexprNode, comp, defaultResolveNet);
    expect(prop[2]).toBe('https://example.com/ds.pdf');
  });

  it('updates property Code with existing value', () => {
    const comp = new Component({ footprint: 'Resistor_SMD:R_0603', reference: 'R1' });
    const prop: SExpr[] = ['property', 'Code', 'old-code', ['layer', 'F.Fab']];
    processFootprintItem(prop as SexprNode, comp, defaultResolveNet);
    expect(prop[2]).toBe('old-code');
  });

  it('updates property Description with sanitization', () => {
    const comp = new Component({
      footprint: 'Resistor_SMD:R_0603',
      reference: 'R1',
      description: 'A (great) resistor!',
    });
    const prop: SExpr[] = ['property', 'Description', '', ['layer', 'F.Fab']];
    processFootprintItem(prop as any, comp, defaultResolveNet);
    expect(prop[2]).toBe('A resistor!');
  });

  it('updates property MPN with sanitization', () => {
    const comp = new Component({ footprint: 'Resistor_SMD:R_0603', reference: 'R1', mpn: 'RC0603FR-0710KL' });
    const prop: SExpr[] = ['property', 'MPN', '', ['layer', 'F.Fab']];
    processFootprintItem(prop as SexprNode, comp, defaultResolveNet);
    expect(prop[2]).toBe('RC0603FR-0710KL');
  });

  it('applies back-side transform to property when side is back', () => {
    const comp = new Component({
      footprint: 'Resistor_SMD:R_0603',
      reference: 'R1',
      pcb: { x: 0, y: 0, side: 'back' },
    });
    const prop: SExpr[] = [
      'property',
      'Reference',
      'R?',
      ['at', 10, 20, 0],
      ['effects', ['font', ['size', 1, 1], ['thickness', 0.15]]],
    ];
    processFootprintItem(prop as SexprNode, comp, defaultResolveNet);
    expect(prop[2]).toBe('R1');
    const atNodes = prop.filter((item): item is SExpr[] => Array.isArray(item) && item[0] === 'at');
    expect(atNodes[0][2]).toBe(-20);
  });

  it('updates fp_text reference text', () => {
    const comp = new Component({ footprint: 'Resistor_SMD:R_0603', reference: 'R1', value: '10k' });
    const text: SExpr[] = ['fp_text', 'reference', 'REF**', ['at', 0, 0, 0], ['layer', 'F.SilkS']];
    processFootprintItem(text as SexprNode, comp, defaultResolveNet);
    expect(text[2]).toBe('R1');
  });

  it('updates fp_text value text', () => {
    const comp = new Component({ footprint: 'Resistor_SMD:R_0603', reference: 'R1', value: '10k' });
    const text: SExpr[] = ['fp_text', 'value', 'VAL**', ['at', 0, 0, 0], ['layer', 'F.Fab']];
    processFootprintItem(text as SexprNode, comp, defaultResolveNet);
    expect(text[2]).toBe('10k');
  });

  it('updates fp_text user with fab data when content is ${REFERENCE}', () => {
    const comp = new Component({
      footprint: 'Resistor_SMD:R_0603',
      reference: 'R1',
      fab: ['R1_label', { x: 5, y: 10, width: 2, height: 1.5, thickness: 0.2, rotation: 45 }],
    });
    const text: SExpr[] = [
      'fp_text',
      'user',
      '${REFERENCE}',
      ['at', 0, 0, 0],
      ['layer', 'F.SilkS'],
      ['effects', ['font', ['size', 1, 1], ['thickness', 0.15]]],
    ];
    processFootprintItem(text as SexprNode, comp, defaultResolveNet);
    expect(text[2]).toBe('R1_label');
    const atChild = text.find((item): item is SExpr[] => Array.isArray(item) && item[0] === 'at')!;
    expect(atChild[1]).toBe(5);
    expect(atChild[2]).toBe(10);
    expect(atChild[3]).toBe(45);
  });

  it('applies back-side transform to fp_text', () => {
    const comp = new Component({
      footprint: 'Resistor_SMD:R_0603',
      reference: 'R1',
      pcb: { x: 0, y: 0, side: 'back' },
    });
    const text: SExpr[] = [
      'fp_text',
      'reference',
      'REF**',
      ['at', 10, 20, 90],
      ['layer', 'F.SilkS'],
      ['effects', ['font', ['size', 1, 1], ['thickness', 0.15]]],
    ];
    processFootprintItem(text as SexprNode, comp, defaultResolveNet);
    expect(text[2]).toBe('R1');
    const atChild = text.find((item): item is SExpr[] => Array.isArray(item) && item[0] === 'at')!;
    expect(atChild[2]).toBeCloseTo(-20);
  });

  it('processes pad item with net resolution', () => {
    const comp = new Component({ footprint: 'Resistor_SMD:R_0603', reference: 'R1' });
    const resolveNet = () => ({ found: true, netCode: 5, netName: 'GND' });
    const pad: SExpr[] = ['pad', '1', 'smd', 'rect', ['at', 0, 0, 0], ['size', 1, 1], ['layers', 'F.Cu', 'F.Mask']];
    processFootprintItem(pad as SexprNode, comp, resolveNet);
    const netChild = pad.find((item): item is SExpr[] => Array.isArray(item) && item[0] === 'net');
    expect(netChild).toBeDefined();
    expect(netChild![1]).toBe(5);
    expect(netChild![2]).toBe('GND');
  });

  it('adds pintype to pad if missing', () => {
    const comp = new Component({ footprint: 'Resistor_SMD:R_0603', reference: 'R1' });
    const pad: SExpr[] = ['pad', '1', 'smd', 'rect', ['at', 0, 0, 0], ['size', 1, 1], ['layers', 'F.Cu', 'F.Mask']];
    processFootprintItem(pad as SexprNode, comp, defaultResolveNet);
    const pintypeChild = pad.find((item): item is SExpr[] => Array.isArray(item) && item[0] === 'pintype');
    expect(pintypeChild).toBeDefined();
    expect(nameOf(pintypeChild![1])).toBe('passive');
  });

  it('mirrors pad rotation on back side', () => {
    const comp = new Component({
      footprint: 'Resistor_SMD:R_0603',
      reference: 'R1',
      pcb: { x: 0, y: 0, rotation: 90, side: 'back' },
    });
    const pad: SExpr[] = ['pad', '1', 'smd', 'rect', ['at', 0, 0, 90], ['size', 1, 1], ['layers', 'F.Cu', 'F.Mask']];
    processFootprintItem(pad as SexprNode, comp, defaultResolveNet);
    const atChild = pad.find((item): item is SExpr[] => Array.isArray(item) && item[0] === 'at')!;
    const mirroredComponentRotation = (360 - 90) % 360;
    const mirroredPadRotation = (360 - 90) % 360;
    expect(atChild[3]).toBe((mirroredComponentRotation + mirroredPadRotation) % 360);
  });

  it('mirrors chamfer direction on back side', () => {
    const comp = new Component({
      footprint: 'Resistor_SMD:R_0603',
      reference: 'R1',
      pcb: { x: 0, y: 0, side: 'back' },
    });
    const pad: SExpr[] = [
      'pad',
      '1',
      'smd',
      'rect',
      ['at', 0, 0, 0],
      ['size', 1, 1],
      ['layers', 'F.Cu', 'F.Mask'],
      ['chamfer', 'top_left'],
    ];
    processFootprintItem(pad as any, comp, defaultResolveNet);
    const chamferChild = pad.find((item): item is SExpr[] => Array.isArray(item) && item[0] === 'chamfer')!;
    expect(chamferChild[1]).toBe('bottom_left');
  });

  it('mirrors graphics Y coordinates on back side', () => {
    const comp = new Component({
      footprint: 'Resistor_SMD:R_0603',
      reference: 'R1',
      pcb: { x: 0, y: 0, side: 'back' },
    });
    const line: SExpr[] = [
      'fp_line',
      ['start', 0, 10],
      ['end', 10, 20],
      ['layer', 'F.SilkS'],
      ['stroke', ['width', 0.1]],
    ];
    processFootprintItem(line as SexprNode, comp, defaultResolveNet);
    const startChild = line.find((item): item is SExpr[] => Array.isArray(item) && item[0] === 'start')!;
    const endChild = line.find((item): item is SExpr[] => Array.isArray(item) && item[0] === 'end')!;
    expect(startChild[2]).toBe(-10);
    expect(endChild[2]).toBe(-20);
  });

  it('leaves non-matching item geometry intact, adding only a deterministic uuid', () => {
    const comp = new Component({ footprint: 'Resistor_SMD:R_0603', reference: 'R1' });
    const item: SExpr[] = ['fp_arc', ['start', 0, 0], ['end', 10, 10], ['angle', 90]];
    const original = JSON.stringify(item);
    processFootprintItem(item as SexprNode, comp, defaultResolveNet);
    // Geometry untouched; a deterministic uuid is appended so KiCad's
    // resave (zone-fill round-trip) cannot invent a random one.
    expect(JSON.stringify(item.slice(0, 4))).toBe(
      JSON.stringify(['fp_arc', ['start', 0, 0], ['end', 10, 10], ['angle', 90]]),
    );
    const uuidChild = item.find((el) => Array.isArray(el) && el[0] === 'uuid') as SExpr[];
    expect(typeof uuidChild?.[1]).toBe('string');
    // Same component + geometry → same uuid
    const item2: SExpr[] = ['fp_arc', ['start', 0, 0], ['end', 10, 10], ['angle', 90]];
    processFootprintItem(item2 as SexprNode, comp, defaultResolveNet);
    expect((item2.find((el) => Array.isArray(el) && el[0] === 'uuid') as SExpr[])[1]).toBe(uuidChild[1]);
  });

  it('applies referenceLayout to fp_text reference', () => {
    const comp = new Component({
      footprint: 'Resistor_SMD:R_0603',
      reference: 'R1',
      referenceLayout: { x: 3, y: -2, rotation: 90, width: 1.5, height: 1.5, thickness: 0.2 },
    });
    const text: SExpr[] = [
      'fp_text',
      'reference',
      'REF**',
      ['at', 0, 0, 0],
      ['layer', 'F.SilkS'],
      ['effects', ['font', ['size', 1, 1], ['thickness', 0.15]]],
    ];
    processFootprintItem(text as SexprNode, comp, defaultResolveNet);
    expect(text[2]).toBe('R1');
    const atChild = text.find((item): item is SExpr[] => Array.isArray(item) && nameOf(item[0]) === 'at')!;
    expect(atChild[1]).toBe(3);
    expect(atChild[2]).toBe(-2);
    expect(atChild[3]).toBe(90);
    const effectsChild = text.find((item): item is SExpr[] => Array.isArray(item) && nameOf(item[0]) === 'effects')!;
    const fontChild = effectsChild.find((item): item is SExpr[] => Array.isArray(item) && nameOf(item[0]) === 'font')!;
    const sizeChild = fontChild.find((item): item is SExpr[] => Array.isArray(item) && nameOf(item[0]) === 'size')!;
    expect(sizeChild[1]).toBe(1.5);
    expect(sizeChild[2]).toBe(1.5);
    const thickChild = fontChild.find(
      (item): item is SExpr[] => Array.isArray(item) && nameOf(item[0]) === 'thickness',
    )!;
    expect(thickChild[1]).toBe(0.2);
  });

  it('applies valueLayout to fp_text value', () => {
    const comp = new Component({
      footprint: 'Resistor_SMD:R_0603',
      reference: 'R1',
      value: '10k',
      valueLayout: { x: 5, y: 7, rotation: 180, width: 2, height: 2 },
    });
    const text: SExpr[] = [
      'fp_text',
      'value',
      'VAL**',
      ['at', 0, 0, 0],
      ['layer', 'F.Fab'],
      ['effects', ['font', ['size', 1, 1], ['thickness', 0.15]]],
    ];
    processFootprintItem(text as SexprNode, comp, defaultResolveNet);
    expect(text[2]).toBe('10k');
    const atChild = text.find((item): item is SExpr[] => Array.isArray(item) && nameOf(item[0]) === 'at')!;
    expect(atChild[1]).toBe(5);
    expect(atChild[2]).toBe(7);
    expect(atChild[3]).toBe(180);
    const effectsChild = text.find((item): item is SExpr[] => Array.isArray(item) && nameOf(item[0]) === 'effects')!;
    const fontChild = effectsChild.find((item): item is SExpr[] => Array.isArray(item) && nameOf(item[0]) === 'font')!;
    const sizeChild = fontChild.find((item): item is SExpr[] => Array.isArray(item) && nameOf(item[0]) === 'size')!;
    expect(sizeChild[1]).toBe(2);
    expect(sizeChild[2]).toBe(2);
  });

  it('applies fabLayout to fp_text user ${REFERENCE} via fab sync', () => {
    const comp = new Component({
      footprint: 'Resistor_SMD:R_0603',
      reference: 'R1',
      fabLayout: { x: 4, y: 6, rotation: 45, width: 1.2, height: 1.2, thickness: 0.25, text: 'CUSTOM_FAB' },
    });
    const text: SExpr[] = [
      'fp_text',
      'user',
      '${REFERENCE}',
      ['at', 0, 0, 0],
      ['layer', 'F.Fab'],
      ['effects', ['font', ['size', 1, 1], ['thickness', 0.15]]],
    ];
    processFootprintItem(text as SexprNode, comp, defaultResolveNet);
    expect(text[2]).toBe('CUSTOM_FAB');
    const atChild = text.find((item): item is SExpr[] => Array.isArray(item) && nameOf(item[0]) === 'at')!;
    expect(atChild[1]).toBe(4);
    expect(atChild[2]).toBe(6);
    expect(atChild[3]).toBe(45);
    const effectsChild = text.find((item): item is SExpr[] => Array.isArray(item) && nameOf(item[0]) === 'effects')!;
    const fontChild = effectsChild.find((item): item is SExpr[] => Array.isArray(item) && nameOf(item[0]) === 'font')!;
    const sizeChild = fontChild.find((item): item is SExpr[] => Array.isArray(item) && nameOf(item[0]) === 'size')!;
    expect(sizeChild[1]).toBe(1.2);
    expect(sizeChild[2]).toBe(1.2);
    const thickChild = fontChild.find(
      (item): item is SExpr[] => Array.isArray(item) && nameOf(item[0]) === 'thickness',
    )!;
    expect(thickChild[1]).toBe(0.25);
  });

  it('applies referenceLayout layer override', () => {
    const comp = new Component({
      footprint: 'Resistor_SMD:R_0603',
      reference: 'R1',
      referenceLayout: { x: 0, y: 0, layer: 'F.Fab' },
    });
    const text: SExpr[] = [
      'fp_text',
      'reference',
      'REF**',
      ['at', 0, 0, 0],
      ['layer', 'F.SilkS'],
      ['effects', ['font', ['size', 1, 1], ['thickness', 0.15]]],
    ];
    processFootprintItem(text as SexprNode, comp, defaultResolveNet);
    const layerChild = text.find((item): item is SExpr[] => Array.isArray(item) && nameOf(item[0]) === 'layer')!;
    expect(layerChild[1]).toBe('F.Fab');
  });

  it('ignores layout properties when not set', () => {
    const comp = new Component({ footprint: 'Resistor_SMD:R_0603', reference: 'R1' });
    const text: SExpr[] = [
      'fp_text',
      'reference',
      'REF**',
      ['at', 5, 10, 45],
      ['layer', 'F.SilkS'],
      ['effects', ['font', ['size', 2, 2], ['thickness', 0.3]]],
    ];
    const originalAt = JSON.stringify(
      text.find((item): item is SExpr[] => Array.isArray(item) && nameOf(item[0]) === 'at'),
    );
    processFootprintItem(text as SexprNode, comp, defaultResolveNet);
    expect(text[2]).toBe('R1');
    const atChild = text.find((item): item is SExpr[] => Array.isArray(item) && nameOf(item[0]) === 'at')!;
    expect(atChild[1]).toBe(5);
    expect(atChild[2]).toBe(10);
  });
});

describe('updateFootprintNode', () => {
  it('updates footprint name, uuid, layer, and at position', () => {
    const comp = new Component({
      footprint: 'Resistor_SMD:R_0603',
      reference: 'R1',
      pcb: { x: 10, y: 20, rotation: 0 },
    });
    const node: SExpr[] = [
      'footprint',
      'Resistor_SMD:R_0603_Old',
      ['uuid', 'old-uuid'],
      ['at', 0, 0, 0],
      ['layer', 'F.Cu'],
    ] as SExpr[];
    const result = updateFootprintNode(node as any, comp, defaultResolveNet);
    expect(result[1]).toBe('Resistor_SMD:R_0603');
    const uuidChild = result.find((item): item is SExpr[] => Array.isArray(item) && nameOf(item[0]) === 'uuid')!;
    expect(uuidChild[1]).toBe(comp.uuid);
    const atChild = result.find((item): item is SExpr[] => Array.isArray(item) && nameOf(item[0]) === 'at')!;
    expect(atChild[1]).toBe(10);
    expect(atChild[2]).toBe(20);
  });

  it('adds Code property if missing', () => {
    const comp = new Component({ footprint: 'Resistor_SMD:R_0603', reference: 'R1', pcb: { x: 0, y: 0, rotation: 0 } });
    const node: SExpr[] = [
      'footprint',
      'Resistor_SMD:R_0603',
      ['uuid', comp.uuid],
      ['at', 0, 0, 0],
      ['layer', 'F.Cu'],
    ] as SExpr[];
    updateFootprintNode(node as any, comp, defaultResolveNet);
    const codeProp = node.find(
      (item): item is SExpr[] => Array.isArray(item) && nameOf(item[0]) === 'property' && item[1] === 'Code',
    );
    expect(codeProp).toBeDefined();
    expect(String(codeProp![2]).length).toBeGreaterThan(0);
  });

  it('sets B.Cu layer for back-side components', () => {
    const comp = new Component({
      footprint: 'Resistor_SMD:R_0603',
      reference: 'R1',
      pcb: { x: 0, y: 0, rotation: 0, side: 'back' },
    });
    const node: SExpr[] = ['footprint', 'Resistor_SMD:R_0603', ['uuid', comp.uuid], ['at', 0, 0, 0]] as SExpr[];
    updateFootprintNode(node as any, comp, defaultResolveNet);
    const layerChild = node.find((item): item is SExpr[] => Array.isArray(item) && nameOf(item[0]) === 'layer')!;
    expect(layerChild[1]).toBe('B.Cu');
  });
});

describe('createFootprintNode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a footprint node from library data', () => {
    const comp = new Component({
      footprint: 'Resistor_SMD:R_0603',
      reference: 'R1',
      value: '10k',
      pcb: { x: 5, y: 5, rotation: 0 },
    });
    const result = createFootprintNode(comp, defaultResolveNet);
    expect(nameOf(result[0])).toBe('footprint');
    expect(result[1]).toBe('Resistor_SMD:R_0603');
    const atChild = result.find((item): item is SExpr[] => Array.isArray(item) && nameOf(item[0]) === 'at')!;
    expect(atChild[1]).toBe(5);
    expect(atChild[2]).toBe(5);
    const uuidChild = result.find((item): item is SExpr[] => Array.isArray(item) && nameOf(item[0]) === 'uuid')!;
    expect(uuidChild).toBeDefined();
  });

  it('adds Code property with encoded source info', () => {
    const comp = new Component({ footprint: 'Resistor_SMD:R_0603', reference: 'R1', pcb: { x: 0, y: 0, rotation: 0 } });
    const result = createFootprintNode(comp, defaultResolveNet);
    const codeProp = result.find(
      (item): item is SExpr[] => Array.isArray(item) && nameOf(item[0]) === 'property' && item[1] === 'Code',
    );
    expect(codeProp).toBeDefined();
    expect(String(codeProp![2])).toBe('encoded-source-info');
  });

  it('adds text properties from component text array', () => {
    const comp = new Component({ footprint: 'Resistor_SMD:R_0603', reference: 'R1', pcb: { x: 0, y: 0, rotation: 0 } });
    comp.text = [{ property: 'customProp', text: 'hello', x: 1, y: 2, show: true }];
    const result = createFootprintNode(comp, defaultResolveNet);
    const customProp = result.find(
      (item): item is SExpr[] => Array.isArray(item) && nameOf(item[0]) === 'property' && item[1] === 'customProp',
    );
    expect(customProp).toBeDefined();
    expect(String(customProp![2])).toBe('hello');
  });

  it('throws BoardCreationError when footprint_lib fails', async () => {
    const { loadFootprintLib } = await import('../src/pcb/component_footprint_loader.js');
    vi.mocked(loadFootprintLib).mockImplementation(() => {
      throw new Error('Library not found');
    });
    const comp = new Component({ footprint: 'Invalid:Library', reference: 'U1' });
    expect(() => createFootprintNode(comp, defaultResolveNet)).toThrow();
  });

  it('falls back to direct loadFootprintLib when component.footprint_lib throws', async () => {
    const { loadFootprintLib } = await import('../src/pcb/component_footprint_loader.js');
    const fallbackContent = '(footprint "Resistor_SMD:R_0603" (layer "F.Cu") (at 0 0 0))';
    vi.mocked(loadFootprintLib).mockReturnValue(fallbackContent);

    const comp = new Component({ footprint: 'Resistor_SMD:R_0603', reference: 'R1', pcb: { x: 0, y: 0, rotation: 0 } });
    const originalFootprintLib = comp.footprint_lib;
    comp.footprint_lib = (_fp: string) => {
      throw new Error('dual-package mismatch');
    };

    const result = createFootprintNode(comp, defaultResolveNet);
    expect(nameOf(result[0])).toBe('footprint');
    expect(result[1]).toBe('Resistor_SMD:R_0603');
    expect(vi.mocked(loadFootprintLib)).toHaveBeenCalledWith('Resistor_SMD:R_0603', 'R1', '', undefined);

    comp.footprint_lib = originalFootprintLib;
  });

  it('uses component.footprint_lib when it succeeds (no fallback)', async () => {
    const { loadFootprintLib } = await import('../src/pcb/component_footprint_loader.js');
    vi.mocked(loadFootprintLib).mockReturnValue('(footprint "wrong" (layer "F.Cu"))');

    const comp = new Component({ footprint: 'Resistor_SMD:R_0603', reference: 'R1', pcb: { x: 0, y: 0, rotation: 0 } });
    const customContent = '(footprint "Resistor_SMD:R_0603_custom" (layer "F.Cu") (at 0 0 0))';
    const originalFootprintLib = comp.footprint_lib;
    comp.footprint_lib = (_fp: string) => customContent;

    const result = createFootprintNode(comp, defaultResolveNet);
    expect(result[1]).toBe('Resistor_SMD:R_0603');
    expect(vi.mocked(loadFootprintLib)).not.toHaveBeenCalled();

    comp.footprint_lib = originalFootprintLib;
  });

  it('applies valueLayout to property Value node', () => {
    const comp = new Component({
      footprint: 'Resistor_SMD:R_0603',
      reference: 'R1',
      value: '10k',
      valueLayout: { x: 5, y: 7, rotation: 90, width: 0.8, height: 0.8, thickness: 0.1 },
    });
    const prop: SExpr[] = [
      'property',
      'Value',
      '10k',
      ['at', 0, 1.43, 0],
      ['layer', 'F.Fab'],
      ['effects', ['font', ['size', 1, 1], ['thickness', 0.15]]],
    ];
    processFootprintItem(prop as SexprNode, comp, defaultResolveNet);
    const atChild = prop.find((item): item is SExpr[] => Array.isArray(item) && nameOf(item[0]) === 'at')!;
    expect(atChild[1]).toBe(5);
    expect(atChild[2]).toBe(7);
    expect(atChild[3]).toBe(90);
    const effectsChild = prop.find((item): item is SExpr[] => Array.isArray(item) && nameOf(item[0]) === 'effects')!;
    const fontChild = effectsChild.find((item): item is SExpr[] => Array.isArray(item) && nameOf(item[0]) === 'font')!;
    const sizeChild = fontChild.find((item): item is SExpr[] => Array.isArray(item) && nameOf(item[0]) === 'size')!;
    expect(sizeChild[1]).toBe(0.8);
    expect(sizeChild[2]).toBe(0.8);
  });

  it('applies referenceLayout to property Reference node', () => {
    const comp = new Component({
      footprint: 'Resistor_SMD:R_0603',
      reference: 'R1',
      referenceLayout: { x: 3, y: -2, layer: 'F.Fab' },
    });
    const prop: SExpr[] = [
      'property',
      'Reference',
      'R?',
      ['at', 0, -1.43, 0],
      ['layer', 'F.SilkS'],
      ['effects', ['font', ['size', 1, 1], ['thickness', 0.15]]],
    ];
    processFootprintItem(prop as SexprNode, comp, defaultResolveNet);
    expect(prop[2]).toBe('R1');
    const atChild = prop.find((item): item is SExpr[] => Array.isArray(item) && nameOf(item[0]) === 'at')!;
    expect(atChild[1]).toBe(3);
    expect(atChild[2]).toBe(-2);
    const layerChild = prop.find((item): item is SExpr[] => Array.isArray(item) && nameOf(item[0]) === 'layer')!;
    expect(layerChild[1]).toBe('F.Fab');
  });

  it('does not apply layout to unrelated property nodes', () => {
    const comp = new Component({
      footprint: 'Resistor_SMD:R_0603',
      reference: 'R1',
      valueLayout: { x: 99, y: 99 },
    });
    const prop: SExpr[] = ['property', 'Footprint', 'old', ['at', 0, 0, 0], ['layer', 'F.Fab']];
    const originalAt = JSON.stringify(
      prop.find((item): item is SExpr[] => Array.isArray(item) && nameOf(item[0]) === 'at'),
    );
    processFootprintItem(prop as SexprNode, comp, defaultResolveNet);
    const atChild = prop.find((item): item is SExpr[] => Array.isArray(item) && nameOf(item[0]) === 'at')!;
    expect(JSON.stringify(atChild)).toBe(originalAt);
  });
});
