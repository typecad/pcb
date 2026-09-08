import { describe, expect, it } from 'vitest';
import { detectLayer, finalizeAndSortLayers } from '../src/gerber_viewer/detect_layer.js';
import { parseExcellon } from '../src/gerber_viewer/gerber/parse_excellon.js';
import { parseGerber } from '../src/gerber_viewer/gerber/parse_gerber.js';

const emptyGerber = parseGerber('%FSLAX36Y36*%\n%MOMM*%\nM02*\n');

describe('detectLayer from filenames', () => {
  it('recognizes KiCad layer names', () => {
    expect(detectLayer('board-F_Cu.gbr', emptyGerber)).toMatchObject({
      kind: 'copper',
      side: 'front',
    });
    expect(detectLayer('board-B_Cu.gbr', emptyGerber)).toMatchObject({
      kind: 'copper',
      side: 'back',
      copperIndex: 0,
    });
    expect(detectLayer('board-In2_Cu.gbr', emptyGerber)).toMatchObject({
      kind: 'copper',
      side: 'inner',
      copperIndex: 2,
    });
    expect(detectLayer('board-Edge_Cuts.gbr', emptyGerber)).toMatchObject({
      kind: 'edge',
      side: 'both',
    });
    expect(detectLayer('board-F_Silkscreen.gbr', emptyGerber)).toMatchObject({
      kind: 'silkscreen',
      side: 'front',
    });
    expect(detectLayer('board-B_Mask.gbr', emptyGerber)).toMatchObject({
      kind: 'mask',
      side: 'back',
    });
    expect(detectLayer('board-F_Paste.gbr', emptyGerber)).toMatchObject({
      kind: 'paste',
      side: 'front',
    });
  });

  it('recognizes legacy Protel extensions', () => {
    expect(detectLayer('board.gtl', emptyGerber)).toMatchObject({ kind: 'copper', side: 'front' });
    expect(detectLayer('board.gts', emptyGerber)).toMatchObject({ kind: 'mask', side: 'front' });
    expect(detectLayer('board.gko', emptyGerber)).toMatchObject({ kind: 'edge' });
    expect(detectLayer('board.drl', emptyGerber)).toMatchObject({ kind: 'drill' });
  });

  it('falls back to other', () => {
    const info = detectLayer('mystery.gbr', emptyGerber);
    expect(info.kind).toBe('other');
  });
});

describe('detectLayer from X2 attributes', () => {
  it('prefers %TF.FileFunction over the filename', () => {
    const gerber = parseGerber('%FSLAX36Y36*%\n%MOMM*%\n%TF.FileFunction,Profile,NP*%\nM02*\n');
    expect(detectLayer('whatever.gbr', gerber)).toMatchObject({ kind: 'edge' });

    const copper = parseGerber('%FSLAX36Y36*%\n%MOMM*%\n%TF.FileFunction,Copper,L2,Inr*%\nM02*\n');
    expect(detectLayer('whatever.gbr', copper)).toMatchObject({ kind: 'copper', side: 'inner' });

    const mask = parseGerber('%FSLAX36Y36*%\n%MOMM*%\n%TF.FileFunction,Soldermask,Top*%\nM02*\n');
    expect(detectLayer('whatever.gbr', mask)).toMatchObject({ kind: 'mask', side: 'front' });
  });

  it('flags plated drills from the Excellon X2 header', () => {
    const drill = parseExcellon('M48\n;#@! TF.FileFunction,Plated,1,2,PTH,Drill\nMETRIC\nT1C0.6\n%\nT1\nX1Y1\nM30\n');
    expect(detectLayer('board.drl', drill)).toMatchObject({
      kind: 'drill',
      drillPlated: true,
    });
  });
});

describe('finalizeAndSortLayers', () => {
  it('orders the stackup bottom-up and puts F_Cu above inner layers', () => {
    const infos = [
      'b-F_Cu.gbr',
      'b-Edge_Cuts.gbr',
      'b-B_Cu.gbr',
      'b-In1_Cu.gbr',
      'b-In2_Cu.gbr',
      'b-F_Mask.gbr',
      'b-B_Silkscreen.gbr',
      'b.drl',
    ].map((name) => detectLayer(name, emptyGerber));
    const sorted = finalizeAndSortLayers(infos);
    expect(sorted.map((l) => l.name)).toEqual([
      'b-Edge_Cuts.gbr',
      'b-B_Silkscreen.gbr', // back decorations paint below back copper (viewed from top)
      'b-B_Cu.gbr',
      'b-In1_Cu.gbr',
      'b-In2_Cu.gbr',
      'b-F_Cu.gbr',
      'b-F_Mask.gbr',
      'b.drl',
    ]);
    const fCu = sorted.find((l) => l.name === 'b-F_Cu.gbr')!;
    const in2 = sorted.find((l) => l.name === 'b-In2_Cu.gbr')!;
    expect(fCu.order).toBeGreaterThan(in2.order);
  });
});
