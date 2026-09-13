import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseExcellon } from '../src/gerber_viewer/gerber/parse_excellon.js';
import { parseGerber } from '../src/gerber_viewer/gerber/parse_gerber.js';
import { detectLayer } from '../src/gerber_viewer/detect_layer.js';
import { extractComponents, footprintBodyDims, renderComponentGlyphs } from '../src/gerber_viewer/render/components.js';
import { classifyPackageFromName, resistorBands, semanticFromRef, TOLERANCE_BAND } from '../src/gerber_viewer/render/packages.js';
import { stitchBoardOutline } from '../src/gerber_viewer/render/outline.js';
import { renderPcbaSvg } from '../src/gerber_viewer/render/pcba.js';
import { DEFAULT_PCBA_THEME, mergeTheme } from '../src/gerber_viewer/render/theme.js';
import { loadPcbaTheme, parseNetlistComponents, renderPcbaFromFiles } from '../src/gerber_viewer/pcba.js';
import type { RenderLayer } from '../src/gerber_viewer/render/svg.js';

// 20x15mm board. Coordinates: X36/Y36 fixed point (1 unit = 1µm).
function layer(name: string, gerber: string): RenderLayer {
  const image = parseGerber(gerber, { name });
  return { info: detectLayer(name, image), image };
}

function drillLayer(name: string, drill: string): RenderLayer {
  const image = parseExcellon(drill, { name });
  return { info: detectLayer(name, image), image };
}

const EDGE = `%FSLAX36Y36*%
%MOMM*%
%ADD10C,0.1*%
D10*
X0Y0D02*
X20000000Y0D01*
X20000000Y15000000D01*
X0Y15000000D01*
X0Y0D01*
M02*
`;

// front copper: R1 (2 SMD pads), U1 (2 rows x 4 pads = SOIC-8), TP1 (single pad), one trace
const F_CU = `%FSLAX36Y36*%
%MOMM*%
%ADD10R,1.2X0.8*%
%ADD12R,0.6X1.4*%
%ADD11C,0.9*%
D10*
%TO.P,R1,1*%
X3000000Y3000000D03*
%TD*%
%TO.P,R1,2*%
X5200000Y3000000D03*
%TD*%
D12*
%TO.P,U1,1*%
X11000000Y9200000D03*
%TD*%
%TO.P,U1,2*%
X12000000Y9200000D03*
%TD*%
%TO.P,U1,3*%
X13000000Y9200000D03*
%TD*%
%TO.P,U1,4*%
X14000000Y9200000D03*
%TD*%
%TO.P,U1,5*%
X14000000Y6800000D03*
%TD*%
%TO.P,U1,6*%
X13000000Y6800000D03*
%TD*%
%TO.P,U1,7*%
X12000000Y6800000D03*
%TD*%
%TO.P,U1,8*%
X11000000Y6800000D03*
%TD*%
D11*
%TO.P,TP1,1*%
X17000000Y3000000D03*
%TD*%
D10*
X3000000Y3000000D02*
X3000000Y6000000D01*
M02*
`;

const F_MASK = `%FSLAX36Y36*%
%MOMM*%
%ADD20R,1.4X1.0*%
%ADD22R,0.8X1.6*%
%ADD21C,1.1*%
D20*
X3000000Y3000000D03*
X5200000Y3000000D03*
D22*
X11000000Y9200000D03*
X12000000Y9200000D03*
X13000000Y9200000D03*
X14000000Y9200000D03*
X14000000Y6800000D03*
X13000000Y6800000D03*
X12000000Y6800000D03*
X11000000Y6800000D03*
D21*
X17000000Y3000000D03*
M02*
`;

const F_SILK = `%FSLAX36Y36*%
%MOMM*%
%ADD30C,0.15*%
D30*
X1000000Y1000000D02*
X19000000Y1000000D01*
M02*
`;

const DRILL = `M48
METRIC,TZ
T1C0.400
T2C0.900
%
G90
G05
T1
X2.5Y2.5
X17.5Y12.5
T2
X10.0Y7.5
M30
`;

const FRONT_LAYERS = [
  layer('demo-Edge_Cuts.gbr', EDGE),
  layer('demo-F_Cu.gbr', F_CU),
  layer('demo-F_Mask.gbr', F_MASK),
  layer('demo-F_Silkscreen.gbr', F_SILK),
  drillLayer('demo.drl', DRILL),
];

/** render glyphs for direct string assertions (default theme, mm) */
function renderComponentGlyphsOf(components: ReturnType<typeof extractComponents>['components']) {
  return renderComponentGlyphs(components, DEFAULT_PCBA_THEME, { units: 'mm' });
}

describe('footprintBodyDims', () => {
  it('parses chip metric codes', () => {
    expect(footprintBodyDims('Resistor_SMD:R_0603_1608Metric')).toEqual({ w: 1.6, h: 0.8 });
    expect(footprintBodyDims('Capacitor_SMD:C_0805_2012Metric')).toEqual({ w: 2.0, h: 1.2 });
  });

  it('parses explicit body dimensions (first NxMmm wins over the EP)', () => {
    expect(footprintBodyDims('Package_DFN_QFN:QFN-24-1EP_4x4mm_P0.5mm_EP2.6x2.6mm')).toEqual({ w: 4, h: 4 });
    expect(footprintBodyDims('Package_SO:SOIC-8_3.9x4.9mm_P1.27mm')).toEqual({ w: 3.9, h: 4.9 });
  });

  it('returns null when the name carries no dimensions', () => {
    expect(footprintBodyDims('TerminalBlock_TE-Connectivity:TerminalBlock_TE_282834-4_1x04_P2.54mm_Horizontal')).toBeNull();
  });
});

describe('package grammar', () => {
  it('classifies package archetypes from footprint names', () => {
    expect(classifyPackageFromName('Resistor_SMD:R_0603_1608Metric')).toBe('chip');
    expect(classifyPackageFromName('Capacitor_SMD:C_0402_1005Metric')).toBe('chip');
    expect(classifyPackageFromName('LED_SMD:LED_0603_1608Metric')).toBe('chip');
    expect(classifyPackageFromName('Package_SO:SOIC-8_3.9x4.9mm_P1.27mm')).toBe('soic');
    expect(classifyPackageFromName('Package_SO:TSSOP-20_4.4x6.5mm_P0.65mm')).toBe('soic');
    expect(classifyPackageFromName('Package_DFN_QFN:QFN-32-1EP_5x5mm_P0.5mm')).toBe('qfn');
    expect(classifyPackageFromName('Package_QFP:TQFP-32_7x7mm_P0.8mm')).toBe('qfp');
    expect(classifyPackageFromName('Package_BGA:BGA-48_7.0x7.0mm_Layout6x8')).toBe('bga');
    expect(classifyPackageFromName('Package_DIP:DIP-8_W7.62mm')).toBe('dip');
    expect(classifyPackageFromName('Connector_PinHeader_2.54mm:PinHeader_1x06_P2.54mm_Vertical')).toBe('header');
    expect(classifyPackageFromName('TerminalBlock_TE-Connectivity:TerminalBlock_TE_282834-4_1x04_P2.54mm_Horizontal')).toBe('terminal');
    expect(classifyPackageFromName('Crystal:Crystal_HC49-4H_Vertical')).toBe('crystal');
    expect(classifyPackageFromName('Package_TO_SOT_SMD:SOT-23')).toBe('to');
    expect(classifyPackageFromName('Package_TO_SOT_THT:TO-220-3_Vertical')).toBe('to');
    expect(classifyPackageFromName('Button_Switch_THT:SW_PUSH_6mm')).toBe('button');
    expect(classifyPackageFromName('MountingHole:MountingHole_3.2mm_M3')).toBe('skip');
    expect(classifyPackageFromName('Sensor:Some_Weird_Sensor')).toBeNull(); // falls back to pads
    // new families
    expect(classifyPackageFromName('Capacitor_THT:CP_Radial_D5.0mm_P2.50mm')).toBe('radial');
    expect(classifyPackageFromName('Capacitor_SMD:CP_Elec_4x5.4')).toBe('radial');
    expect(classifyPackageFromName('LED_THT:LED_D3.0mm')).toBe('dome');
    expect(classifyPackageFromName('Potentiometer_THT:Potentiometer_Bourns_3296W_Vertical')).toBe('trimmer');
    expect(classifyPackageFromName('Rotary_Encoder:RotaryEncoder_Alps_EC11E-Switch_Vertical_H20mm')).toBe('rotary');
    expect(classifyPackageFromName('Button_Switch_THT:SW_DIP_SPSTx01_Slide_6.7x4.1mm_W7.62mm_P2.54mm_LowProfile')).toBe('slide');
    expect(classifyPackageFromName('Connector_USB:USB_Micro-B_Amphenol_10118193-0001LF_Horizontal')).toBe('connector');
    expect(classifyPackageFromName('Connector_BarrelJack:BarrelJack_CUI_PJ-063AH_Horizontal')).toBe('connector');
    expect(classifyPackageFromName('Connector_JST:JST_PH_B2B-PH-K_1x02_P2.00mm_Vertical')).toBe('connector');
    expect(classifyPackageFromName('Oscillator:Oscillator_SMD_EuroQuartz_XO91-4Pin_7.0x5.0mm')).toBe('can');
    expect(classifyPackageFromName('RF_Module:ESP-01M_Receiver')).toBe('can');
    expect(classifyPackageFromName('Crystal:Crystal_SMD_3215-2Pin_3.2x1.5mm')).toBe('crystal');
  });

  it('classifies through-hole diodes as axial — they outrank the broad /Diode/ chip entry', () => {
    expect(classifyPackageFromName('Diode_THT:D_DO-41_SOD81_P7.62mm_Horizontal')).toBe('axial');
    expect(classifyPackageFromName('D_THT:D_DO-35_P7.62mm_Horizontal')).toBe('axial');
    expect(classifyPackageFromName('Resistor_THT:R_Axial_DIN0207_L6.3mm_D2.5mm_P10.16mm_Horizontal')).toBe('axial');
    // SMD diodes still read as chips
    expect(classifyPackageFromName('Diode_SMD:D_SOD-123')).toBe('chip');
  });

  it('classifies new families from pad topology without names', () => {
    const th2 = (ref: string) => `%FSLAX36Y36*%
%MOMM*%
%ADD15C,1.3*%
D15*
%TO.P,${ref},1*%
X13000000Y10000000D03*
%TD*%
%TO.P,${ref},2*%
X13500000Y10000000D03*
%TD*%
M02*
`;
    const back = (src: string, ref: string) => src.replace('demo-F_Cu', 'demo-B_Cu');
    const mk = (ref: string) => [layer('demo-F_Cu.gbr', th2(ref)), layer('demo-B_Cu.gbr', back(th2(ref), ref))];
    expect(extractComponents(mk('C3'), 'front').components[0]!.kind).toBe('radial'); // TH cap
    expect(extractComponents(mk('LED4'), 'front').components[0]!.kind).toBe('dome'); // TH LED
    expect(extractComponents(mk('SW4'), 'front').components[0]!.kind).toBe('slide'); // TH switch

    const th3 = `%FSLAX36Y36*%
%MOMM*%
%ADD15C,1.2*%
D15*
%TO.P,RV2,1*%
X13000000Y10000000D03*
%TD*%
%TO.P,RV2,2*%
X13250000Y10000000D03*
%TD*%
%TO.P,RV2,3*%
X13500000Y10000000D03*
%TD*%
M02*
`;
    const rv = extractComponents(
      [layer('demo-F_Cu.gbr', th3), layer('demo-B_Cu.gbr', th3.replace('demo-F_Cu', 'demo-B_Cu'))],
      'front',
    );
    expect(rv.components[0]!.kind).toBe('trimmer');
  });

  it('renders the radial can, TH LED dome, and metal-can glyphs', () => {
    const gbr = (ref: string) => `%FSLAX36Y36*%
%MOMM*%
%ADD15C,1.3*%
D15*
%TO.P,${ref},1*%
X13000000Y10000000D03*
%TD*%
%TO.P,${ref},2*%
X13250000Y10000000D03*
%TD*%
M02*
`;
    const radial = extractComponents(
      [layer('demo-F_Cu.gbr', gbr('C3')), layer('demo-B_Cu.gbr', gbr('C3').replace('demo-F_Cu', 'demo-B_Cu'))],
      'front',
    );
    const { glyphs } = renderComponentGlyphsOf(radial.components);
    const c3 = glyphs.split('data-ref="C3"')[1]!.split('<g data-ref=')[0]!;
    expect(c3).toContain(`<circle cx="0" cy="0"`); // the can
    expect(c3).toContain(themeColor('stripe')); // polarity stripe

    const dome = extractComponents(
      [layer('demo-F_Cu.gbr', gbr('LED4')), layer('demo-B_Cu.gbr', gbr('LED4').replace('demo-F_Cu', 'demo-B_Cu'))],
      'front',
    );
    const d = renderComponentGlyphsOf(dome.components).glyphs.split('data-ref="LED4"')[1]!.split('<g data-ref=')[0]!;
    expect(d).toContain(themeColor('ledTint'));
    expect(d).toContain('fill-opacity="0.85"');

    const canPads: string[] = [];
    let canPin = 1;
    for (const [x, y] of [[8, 10], [12, 10], [8, 8], [12, 8]] as const) {
      canPads.push(`%TO.P,X1,${canPin++}*%\nX${Math.round(x * 1e6)}Y${Math.round(y * 1e6)}D03*\n%TD*%\n`);
    }
    const canGbr = `%FSLAX36Y36*%\n%MOMM*%\n%ADD16R,1.2X1.0*%\nD16*\n${canPads.join('')}M02*\n`;
    const can = extractComponents([layer('demo-F_Cu.gbr', canGbr)], 'front', { X1: { footprint: 'Oscillator:Oscillator_SMD_EuroQuartz_XO91-4Pin_7.0x5.0mm' } });
    const x1 = renderComponentGlyphsOf(can.components).glyphs.split('data-ref="X1"')[1]!.split('<g data-ref=')[0]!;
    expect(x1).toContain(themeColor('crystal')); // metal lid
    expect(x1).toContain(themeColor('pin1'));
    expect(x1).not.toContain('#c8cdd2'); // no legs

    function themeColor(key: 'stripe' | 'ledTint' | 'crystal' | 'pin1'): string {
      return DEFAULT_PCBA_THEME[key];
    }
  });

  it('maps reference prefixes to semantics', () => {
    expect(semanticFromRef('R12')).toBe('resistor');
    expect(semanticFromRef('RN1')).toBe('resistor');
    expect(semanticFromRef('C7')).toBe('capacitor');
    expect(semanticFromRef('L4')).toBe('inductor');
    expect(semanticFromRef('FB2')).toBe('inductor');
    expect(semanticFromRef('D2')).toBe('diode');
    expect(semanticFromRef('LED3')).toBe('led');
    expect(semanticFromRef('Q5')).toBe('transistor');
    expect(semanticFromRef('U3')).toBe('ic');
    expect(semanticFromRef('Y1')).toBe('crystal');
    expect(semanticFromRef('J1')).toBe('connector');
    expect(semanticFromRef('SW1')).toBe('switch');
    expect(semanticFromRef('F1')).toBe('fuse');
    expect(semanticFromRef('RV1')).toBe('potentiometer');
    expect(semanticFromRef('X1')).toBe('crystal');
    expect(semanticFromRef('ZZ1')).toBe('none');
  });

  it('sizes rotated bodies from rotated pad extents (90° matches its unrotated twin)', () => {
    // one SOT-23-5 land pattern authored twice: once at 0°, once rotated
    // 90° (pad rects transpose in the gerber). The local frame canonicalizes
    // orientation, so the two glyphs' bodies must be congruent — treating
    // gerber-frame pad w/h as local extents skews the rotated one
    const padsAt0 = [
      [10, 8],
      [10, 9.5],
      [10, 11],
      [12, 8.75],
      [12, 10.25],
    ] as const;
    // rotate (dx,dy) -> (dy,-dx) about the centroid (11, 9.5)
    const rot = ([x, y]: readonly [number, number]): [number, number] => [y - 9.5 + 11, -(x - 11) + 9.5];
    const mk = (pads: readonly (readonly [number, number])[], aperture: string) =>
      layer(
        'demo-F_Cu.gbr',
        `%FSLAX36Y36*%\n%MOMM*%\n%ADD12R,${aperture}*%\nD12*\n${pads
          .map(([x, y], i) => `%TO.P,U9,${i + 1}*%\nX${x * 1e6}Y${y * 1e6}D03*\n%TD*%\n`)
          .join('')}M02*\n`,
      );
    const at0 = extractComponents([mk(padsAt0, '1.4X0.6')], 'front');
    const at90 = extractComponents([mk(padsAt0.map(rot), '0.6X1.4')], 'front');
    expect(at0.components[0]!.kind).toBe('sot');
    expect(at90.components[0]!.kind).toBe('sot');
    const bodyOf = (comps: ReturnType<typeof extractComponents>['components']): { w: number; h: number } => {
      const glyph = renderComponentGlyphsOf(comps).glyphs.split('data-ref="U9"')[1]!.split('</g>')[0]!;
      const body = /<rect[^>]*fill="#2b2f33"/.exec(glyph)?.[0] ?? '';
      return {
        w: Number(/width="([\d.-]+)"/.exec(body)?.[1]),
        h: Number(/height="([\d.-]+)"/.exec(body)?.[1]),
      };
    };
    const a = bodyOf(at0.components);
    const b = bodyOf(at90.components);
    expect(Math.abs(a.w - b.w)).toBeLessThan(0.01);
    expect(Math.abs(a.h - b.h)).toBeLessThan(0.01);
  });

  it('draws the generic body under the pads (painter order)', () => {
    // an odd SMD pad pattern with no honest archetype → generic: body first,
    // pads after — SVG paints in document order, so pads stay visible
    const pads = [
      [10, 9],
      [12, 9],
      [11, 10],
      [10, 11],
      [12, 11],
    ] as const;
    const ops = pads.map(([x, y], i) => `%TO.P,U8,${i + 1}*%\nX${x * 1e6}Y${y * 1e6}D03*\n%TD*%\n`).join('');
    const gbr = `%FSLAX36Y36*%\n%MOMM*%\n%ADD12R,0.6X0.9*%\nD12*\n${ops}M02*\n`;
    const { components } = extractComponents([layer('demo-F_Cu.gbr', gbr)], 'front');
    expect(components[0]!.kind).toBe('generic');
    const glyph = renderComponentGlyphsOf(components).glyphs.split('data-ref="U8"')[1]!.split('</g>')[0]!;
    const bodyIdx = glyph.indexOf(`fill="${DEFAULT_PCBA_THEME.body}"`);
    const padIdx = glyph.indexOf(`fill="${DEFAULT_PCBA_THEME.lead}"`);
    expect(bodyIdx).toBeGreaterThanOrEqual(0);
    expect(padIdx).toBeGreaterThan(bodyIdx); // pads paint over the body
  });

  it('computes resistor band colors from values', () => {
    const brown = '#7a4a2b';
    const black = '#3a3d42';
    expect(resistorBands('1kohm')).toEqual([brown, black, '#c93a3a']); // brown black red
    expect(resistorBands('10k')).toEqual([brown, black, '#d97b1e']); // brown black orange
    expect(resistorBands('4.7k')).toEqual(['#d9c545', '#8a5fb5', '#c93a3a']); // yellow violet red
    expect(resistorBands('100R')).toEqual([brown, black, brown]); // 100 = 10 x 10^1
    expect(resistorBands('0 ohm')).toEqual([black, black, black]);
    expect(resistorBands(undefined)).toBeNull();
    expect(resistorBands('ATtiny3227')).toBeNull();
    expect(TOLERANCE_BAND).toBe('#caa53f');
  });

  it('renormalizes band rollover (9.99k is 10k, not "no bands")', () => {
    expect(resistorBands('9.99k')).toEqual(['#7a4a2b', '#3a3d42', '#d97b1e']); // brown black orange
    expect(resistorBands('99.9k')).toEqual(['#7a4a2b', '#3a3d42', '#d9c545']); // 100k
  });

  it('keeps mega and milli distinct (M vs m)', () => {
    // uppercase M is mega: 10M = brown black blue
    expect(resistorBands('10M')).toEqual(['#7a4a2b', '#3a3d42', '#3f6fb5']);
    // lowercase m is milli — must not read as 10 Mohm
    expect(resistorBands('10m')).not.toEqual(resistorBands('10M'));
  });
});

describe('stitchBoardOutline', () => {
  it('chains edge traces into one closed rectangle contour', () => {
    const result = stitchBoardOutline(FRONT_LAYERS[0]!, { minX: 0, minY: 0, maxX: 20, maxY: 15 }, 'mm');
    expect(result?.contours).toHaveLength(1);
    expect(result?.warnings).toEqual([]);
    expect(result?.strokeWidth).toBe(0.1);
  });

  it('stitches across arcs', () => {
    const gerber = `%FSLAX36Y36*%
%MOMM*%
%ADD10C,0.1*%
D10*
G75*
X0Y0D02*
X19000000Y0D01*
G03X20000000Y1000000I1000000J0D01*
G01X20000000Y15000000D01*
X0Y15000000D01*
X0Y0D01*
M02*
`;
    const result = stitchBoardOutline(layer('demo-Edge_Cuts.gbr', gerber), null, 'mm');
    expect(result?.contours).toHaveLength(1);
    expect(result?.contours[0]!.segments.some((s) => s.kind === 'arc')).toBe(true);
  });

  it('falls back to the bounding box when the outline cannot close', () => {
    const open = EDGE.replace('X0Y15000000D01*\nX0Y0D01*\n', 'X0Y15000000D01*\n'); // drop the last edge
    const result = stitchBoardOutline(layer('demo-Edge_Cuts.gbr', open), { minX: 0, minY: 0, maxX: 20, maxY: 15 }, 'mm');
    expect(result?.warnings.join(' ')).toContain('bounding box');
    expect(result?.contours).toHaveLength(1); // the fallback rectangle
  });

  it('uses closed region contours directly', () => {
    const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'gerber');
    const regionEdge = fs.readFileSync(path.join(fixtures, 'edge.gbr'), 'utf8');
    const result = stitchBoardOutline(layer('demo-Edge_Cuts.gbr', regionEdge), null, 'mm');
    expect(result?.contours).toHaveLength(1);
  });
});

describe('extractComponents', () => {
  it('groups pads by reference and infers the package family', () => {
    const { components, warnings } = extractComponents(FRONT_LAYERS, 'front');
    expect(warnings).toEqual([]);
    const byRef = new Map(components.map((c) => [c.ref, c]));
    expect(byRef.get('R1')?.kind).toBe('chip');
    expect(byRef.get('R1')?.semantic).toBe('resistor');
    expect(byRef.get('U1')?.kind).toBe('soic');
    expect(byRef.get('U1')?.semantic).toBe('ic');
    expect(byRef.get('U1')?.pads).toHaveLength(8);
    expect(byRef.get('TP1')?.kind).toBe('skip'); // single pad = test point
  });

  it('flags through-hole parts seen on both coppers', () => {
    const back = layer('demo-B_Cu.gbr', `%FSLAX36Y36*%
%MOMM*%
%ADD12R,1.5X1.5*%
D12*
%TO.P,U1,1*%
X11000000Y9200000D03*
%TD*%
M02*
`);
    const { components } = extractComponents([...FRONT_LAYERS, back], 'front');
    expect(components.find((c) => c.ref === 'U1')?.throughHole).toBe(true);
  });

  it('classifies perimeter pads as qfn whose body hides them (pads on the bottom)', () => {
    const pads: string[] = [];
    // 3-4-3-2 QFN-12 ring around (10,8), 1.2mm pitch
    const ring: Array<[number, number, string]> = [
      [9.4, 8.8, '1'], [10.6, 8.8, '2'],
      [8.8, 8.4, '3'], [11.2, 8.4, '4'],
      [8.8, 7.6, '5'], [11.2, 7.6, '6'],
      [9.4, 7.2, '7'], [10.6, 7.2, '8'],
    ];
    for (const [x, y, pin] of ring) {
      pads.push(`%TO.P,U2,${pin}*%\nX${Math.round(x * 1e6)}Y${Math.round(y * 1e6)}D03*\n%TD*%\n`);
    }
    const gerber = `%FSLAX36Y36*%
%MOMM*%
%ADD12R,0.6X0.4*%
D12*
${pads.join('')}M02*
`;
    const { components } = extractComponents([layer('demo-F_Cu.gbr', gerber)], 'front');
    expect(components.find((c) => c.ref === 'U2')?.kind).toBe('qfn');
    // from the top only the body shows: it covers the full pad-rectangle
    // extent (3.0 x 2.0) plus margin, so no pads peek out around the chip
    const { glyphs } = renderComponentGlyphsOf(components);
    const u2 = glyphs.split('data-ref="U2"')[1]!.split('<g data-ref=')[0]!;
    expect(u2).toMatch(/width="3\.1\d*"/);
    expect(u2).toMatch(/height="2\.1\d*"/);
  });

  it('never sizes a qfn body below its pad coverage, even with named dims', () => {
    // pads spanning 4.0 x 3.0mm plus a center exposed pad, footprint name
    // "4x4mm" -> body 4.1 x 4: the pad span + margin floors the width, the
    // named size wins on height. The EP must not break the qfn detection.
    const pads: string[] = [];
    const ring: Array<[number, number, string]> = [
      [8.05, 9.25, '1'], [9.15, 9.25, '2'], [10.25, 9.25, '3'],
      [8.05, 6.75, '7'], [9.15, 6.75, '8'], [10.25, 6.75, '9'],
      [7.35, 8.5, '4'], [7.35, 7.5, '5'],
      [10.95, 8.5, '10'], [10.95, 7.5, '11'],
      [9.15, 8.0, '25'], // exposed pad at the centroid
    ];
    for (const [x, y, pin] of ring) {
      const code = pin === '25' ? 13 : 12; // EP is bigger
      pads.push(`%TO.P,U3,${pin}*%\nX${Math.round(x * 1e6)}Y${Math.round(y * 1e6)}D03*\n%TD*%\n`);
    }
    const gerber = `%FSLAX36Y36*%
%MOMM*%
%ADD12R,0.4X0.5*%
%ADD13R,1.5X1.5*%
D12*
${pads.filter((_, i) => i < 10).join('')}D13*
${pads[10]!}M02*
`;
    const { components } = extractComponents(
      [layer('demo-F_Cu.gbr', gerber)],
      'front',
      { U3: { footprint: 'Package_DFN_QFN:QFN-24-1EP_4x4mm_P0.5mm_EP2.6x2.6mm' } },
    );
    expect(components.find((c) => c.ref === 'U3')?.kind).toBe('qfn');
    const { glyphs } = renderComponentGlyphsOf(components);
    const u3 = glyphs.split('data-ref="U3"')[1]!.split('<g data-ref=')[0]!;
    expect(u3).toMatch(/width="4\.1"/);
    expect(u3).toMatch(/height="4"/);
  });

  it('renders single-row through-hole parts as pin headers', () => {
    // J1: four 2.1mm round pads in one row (a terminal block), pads on BOTH
    // coppers -> through-hole, single row -> header glyph: body + pin dots
    const front = `%FSLAX36Y36*%
%MOMM*%
%ADD15C,2.1*%
D15*
%TO.P,J1,1*%
X1328300Y-973000D03*
%TD*%
%TO.P,J1,2*%
X1328300Y-998400D03*
%TD*%
%TO.P,J1,3*%
X1328300Y-1023800D03*
%TD*%
%TO.P,J1,4*%
X1328300Y-1049200D03*
%TD*%
M02*
`;
    const back = front.replace('demo-F_Cu', 'demo-B_Cu');
    const { components } = extractComponents([layer('demo-F_Cu.gbr', front), layer('demo-B_Cu.gbr', back)], 'front');
    expect(components.find((c) => c.ref === 'J1')?.kind).toBe('header');
    const { glyphs, count } = renderComponentGlyphsOf(components);
    const j1 = glyphs.split('data-ref="J1"')[1]!.split('<g data-ref=')[0]!;
    expect(j1).toContain(`fill="${DEFAULT_PCBA_THEME.body}"`); // plastic body
    expect((j1.match(/fill="#c8cdd2"/g) ?? []).length).toBe(4); // metal pins up
    expect(count).toBe(1);
  });

  it('renders a terminal block from its footprint name with screw dots', () => {
    const front = `%FSLAX36Y36*%
%MOMM*%
%ADD15C,2.1*%
D15*
%TO.P,J2,1*%
X1328300Y-973000D03*
%TD*%
%TO.P,J2,2*%
X1328300Y-998400D03*
%TD*%
M02*
`;
    const back = front.replace('demo-F_Cu', 'demo-B_Cu');
    const { components } = extractComponents(
      [layer('demo-F_Cu.gbr', front), layer('demo-B_Cu.gbr', back)],
      'front',
      { J2: { footprint: 'TerminalBlock_TE-Connectivity:TerminalBlock_TE_282834-4_1x04_P2.54mm_Horizontal' } },
    );
    expect(components.find((c) => c.ref === 'J2')?.kind).toBe('terminal');
    const { glyphs } = renderComponentGlyphsOf(components);
    const j2 = glyphs.split('data-ref="J2"')[1]!.split('<g data-ref=')[0]!;
    expect((j2.match(new RegExp(`fill="${DEFAULT_PCBA_THEME.pads}"`, 'g')) ?? []).length).toBe(2); // gold screws
  });

  it('classifies SOT-23 pad patterns as sot and 2-row TH as dip', () => {
    const sot = `%FSLAX36Y36*%
%MOMM*%
%ADD12R,0.6X0.8*%
D12*
%TO.P,Q1,1*%
X10000000Y8050000D03*
%TD*%
%TO.P,Q1,2*%
X11000000Y8050000D03*
%TD*%
%TO.P,Q1,3*%
X10500000Y8950000D03*
%TD*%
M02*
`;
    const { components } = extractComponents([layer('demo-F_Cu.gbr', sot)], 'front');
    expect(components.find((c) => c.ref === 'Q1')?.kind).toBe('sot');

    const dipFront = `%FSLAX36Y36*%
%MOMM*%
%ADD13C,1.6*%
D13*
%TO.P,U9,1*%
X12000000Y7000000D03*
%TD*%
%TO.P,U9,2*%
X13000000Y7000000D03*
%TD*%
%TO.P,U9,3*%
X13000000Y9000000D03*
%TD*%
%TO.P,U9,4*%
X12000000Y9000000D03*
%TD*%
M02*
`;
    const dipBack = dipFront.replace('demo-F_Cu', 'demo-B_Cu');
    const dip = extractComponents([layer('demo-F_Cu.gbr', dipFront), layer('demo-B_Cu.gbr', dipBack)], 'front');
    expect(dip.components.find((c) => c.ref === 'U9')?.kind).toBe('dip');
    const { glyphs } = renderComponentGlyphsOf(dip.components);
    expect(glyphs.split('data-ref="U9"')[1]!.split('<g data-ref=')[0]!).toContain('fill-opacity="0.28"'); // notch
  });

  it('renders SOT-23-5 with oriented rect legs meeting the body', () => {
    // SOT-23-5: three pads left, two right; pads 1.0 long x 0.6 wide,
    // elongated away from the body (realistic land pattern)
    const pad = (x: number, y: number, pin: string) => `%TO.P,U2,${pin}*%\nX${Math.round(x * 1e6)}Y${Math.round(y * 1e6)}D03*\n%TD*%\n`;
    const gerber = `%FSLAX36Y36*%
%MOMM*%
%ADD12R,1.0X0.6*%
D12*
${pad(9.4, 10.2, '1')}${pad(9.4, 9.2, '2')}${pad(9.4, 8.2, '3')}${pad(10.6, 9.7, '4')}${pad(10.6, 8.7, '5')}M02*
`;
    const { components } = extractComponents([layer('demo-F_Cu.gbr', gerber)], 'front');
    expect(components.find((c) => c.ref === 'U2')?.kind).toBe('sot');
    const { glyphs } = renderComponentGlyphsOf(components);
    const u2 = glyphs.split('data-ref="U2"')[1]!.split('<g data-ref=')[0]!;
    // legs: 5 slim rects (50% of the pad short side = 0.3) running from the
    // body edge out to the pad, along the pads' long axis — elongated, not
    // square blobs, and no stray circles
    const legs = [...u2.matchAll(/<rect[^>]*width="([\d.]+)" height="([\d.]+)"[^>]*fill="#c8cdd2"/g)].map((m) => [+m[1]!, +m[2]!]);
    expect(legs).toHaveLength(5);
    for (const [w, h] of legs) {
      expect(Math.min(w, h)).toBeCloseTo(0.3, 2); // slim (~55% of pad width)
      expect(Math.max(w, h)).toBeGreaterThan(0.2); // oriented along the lead
    }
    expect(u2).not.toMatch(/<circle[^>]*fill="#c8cdd2"/);
  });

  it('classifies ball grids as bga, draws only the body — no pins, no legs', () => {
    // 8x8 grid of 0.25mm round pads at 0.5mm pitch with a 2x2 depopulated
    // center — interior pads present, like a real ball array
    const flashes: string[] = [];
    let pin = 1;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (r >= 3 && r <= 4 && c >= 3 && c <= 4) continue;
        flashes.push(`%TO.P,U9,${pin++}*%\nX${Math.round((10 + c * 0.5) * 1e6)}Y${Math.round((10 + r * 0.5) * 1e6)}D03*\n%TD*%\n`);
      }
    }
    const gerber = `%FSLAX36Y36*%
%MOMM*%
%ADD20C,0.25*%
D20*
${flashes.join('')}M02*
`;
    const { components } = extractComponents([layer('demo-F_Cu.gbr', gerber)], 'front');
    expect(components.find((c) => c.ref === 'U9')?.kind).toBe('bga');
    const { glyphs } = renderComponentGlyphsOf(components);
    const u9 = glyphs.split('data-ref="U9"')[1]!.split('<g data-ref=')[0]!;
    expect(u9).toContain(`fill="${DEFAULT_PCBA_THEME.body}"`); // the package rect
    expect(u9).not.toContain('#c8cdd2'); // no pin/leg representation at all
  });

  it('anchors through-hole pins at their drilled holes', () => {
    // 2x2 DIP-ish TH pads at ±2.54mm, drilled 0.9mm: slim wires run from the
    // body edge into each hole, and the drilled hole is punched back over
    // each wire so the board's own drill dot stays visible
    const dipFront = `%FSLAX36Y36*%
%MOMM*%
%ADD13C,1.6*%
D13*
%TO.P,U9,1*%
X10000000Y10000000D03*
%TD*%
%TO.P,U9,2*%
X10000000Y12540000D03*
%TD*%
%TO.P,U9,3*%
X14920000Y12540000D03*
%TD*%
%TO.P,U9,4*%
X14920000Y10000000D03*
%TD*%
M02*
`;
    const dipBack = dipFront.replace('demo-F_Cu', 'demo-B_Cu');
    const drill = `M48
METRIC,TZ
T1C0.900
%
G90
G05
T1
X10.0Y10.0
X10.0Y12.54
X14.92Y12.54
X14.92Y10.0
M30
`;
    const { components } = extractComponents(
      [
        layer('demo-F_Cu.gbr', dipFront),
        layer('demo-B_Cu.gbr', dipBack),
        drillLayer('demo.drl', drill),
      ],
      'front',
    );
    const u9 = components.find((c) => c.ref === 'U9')!;
    expect(u9.kind).toBe('dip');
    for (const pad of u9.pads) {
      expect(pad.drill).not.toBeNull();
      expect(pad.drill!.diameter).toBeCloseTo(0.9, 3);
    }
    const { glyphs } = renderComponentGlyphsOf(components);
    const g = glyphs.split('data-ref="U9"')[1]!.split('<g data-ref=')[0]!;
    const pins = [...g.matchAll(/<rect x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"[^>]*fill="#c8cdd2"/g)].map((m) => [+m[1]!, +m[2]!, +m[3]!, +m[4]!]);
    expect(pins).toHaveLength(4);
    for (const [x, y, w, h] of pins) {
      // wire-slim on the cross axis (under the drill: 0.9 x 0.7 = 0.63),
      // perpendicular stub to the hole — not pad/drill-wide, or the pad
      // reads SMD
      const dims = [w, h].sort((a, b) => a - b);
      expect(dims[0]).toBeCloseTo(0.63, 2); // the wire-thick axis
      expect(dims[1]).toBeGreaterThan(dims[0]); // the stub to the hole
      // local frame only: the pads sit within ±5 of the glyph origin
      expect(Math.abs(x)).toBeLessThan(5);
      expect(Math.abs(y)).toBeLessThan(5);
    }
    // each wire ends in its hole: a hole-colored dot at the drill position
    const holes = [...g.matchAll(new RegExp(`<circle cx="([-.\\d]+)" cy="([-.\\d]+)" r="0.45" fill="${DEFAULT_PCBA_THEME.hole.replace(/#/g, '#')}"`, 'g'))];
    expect(holes).toHaveLength(4);
  });

  it('draws a metal tab for a dominant pad and no slim leg on it', () => {
    // SOT-223-style: three 0.6x1.0 pads in a column + a big 2x3.8 tab
    const pad = (x: number, y: number, pin: string, ap: number) => `D${ap}\n%TO.P,Q3,${pin}*%\nX${Math.round(x * 1e6)}Y${Math.round(y * 1e6)}D03*\n%TD*%\n`;
    const gerber = `%FSLAX36Y36*%
%MOMM*%
%ADD12R,0.6X1.0*%
%ADD13R,2X3.8*%
${pad(9, 11.2, '1', 12)}${pad(9, 10, '2', 12)}${pad(9, 8.8, '3', 12)}${pad(12, 10, '2', 13)}M02*
`;
    const { components } = extractComponents([layer('demo-F_Cu.gbr', gerber)], 'front');
    const q3 = components.find((c) => c.ref === 'Q3')!;
    expect(['sot', 'to']).toContain(q3.kind);
    const { glyphs } = renderComponentGlyphsOf(components);
    const g = glyphs.split('data-ref="Q3"')[1]!.split('<g data-ref=')[0]!;
    const silver = [...g.matchAll(/<rect[^>]*width="([\d.]+)" height="([\d.]+)"[^>]*fill="#c8cdd2"/g)].map((m) => [+m[1]!, +m[2]!]);
    const [tab] = silver.filter(([w, h]) => Math.max(w, h) > 2); // the long slab
    const legs = silver.filter(([w, h]) => Math.max(w, h) <= 1.2);
    expect(tab).toBeDefined(); // metal tab drawn for the dominant pad
    expect(Math.min(...tab!)).toBeGreaterThan(0.1); // a slab, not a hairline
    expect(legs.length).toBeGreaterThanOrEqual(2); // slim legs on the signal pins
    for (const [w, h] of legs) expect(Math.max(w, h)).toBeLessThan(1.2); // never pad-length
  });

  it('squares the Fab outline: chamfered corners become the bounding box', () => {
    // QFN-style pads spanning ±1.94 (land pattern), Fab body outline 4x4
    // with a 1mm pin-1 chamfer, plus text strokes and an EP mark that must
    // lose the largest-contour contest
    const ring: Array<[number, number, string]> = [
      [8.06, 10.94, '1'], [9.06, 10.94, '2'], [10.06, 10.94, '3'], [11.06, 10.94, '4'],
      [8.06, 9.06, '7'], [9.06, 9.06, '8'], [10.06, 9.06, '9'], [11.06, 9.06, '10'],
      [7.44, 10.5, '5'], [7.44, 9.5, '6'],
      [11.68, 10.5, '11'], [11.68, 9.5, '12'],
      [9.56, 10.0, '25'], // EP at the centroid
    ];
    const byPin = new Map(ring.map(([x, y, pin]) => [pin, [x, y] as const]));
    const flash = (pin: string) => {
      const [x, y] = byPin.get(pin)!;
      const ap = pin === '25' ? 14 : x! < 8 || x! > 11 ? 13 : 12;
      return `D${ap}\n%TO.P,U4,${pin}*%\nX${Math.round(x! * 1e6)}Y${Math.round(y! * 1e6)}D03*\n%TD*%\n`;
    };    const copperMixed = `%FSLAX36Y36*%
%MOMM*%
%ADD12R,0.825X0.25*%
%ADD13R,0.25X0.825*%
%ADD14R,1.6X1.6*%
${ring.map(([, , pin]) => flash(pin)).join('')}M02*
`;
    // Fab: 4x4 outline (8..12)x(8..12) with a 1mm chamfer at (8,9)-(9,8),
    // a value-text stroke that cannot close, and a small EP-ish loop
    const fab = `%FSLAX36Y36*%
%MOMM*%
%ADD10C,0.12*%
D10*
X12000000Y12000000D02*
X8000000Y12000000D01*
X8000000Y9000000D01*
X9000000Y8000000D01*
X12000000Y8000000D01*
X12000000Y12000000D01*
X9800000Y12200000D02*
X10400000Y12400000D01*
X9200000Y9200000D02*
X9800000Y9200000D01*
X9800000Y10800000D01*
X9200000Y10800000D01*
X9200000Y9200000D01*
M02*
`;
    const { components } = extractComponents(
      [layer('demo-F_Cu.gbr', copperMixed), layer('demo-F_Fab.gbr', fab)],
      'front',
    );
    const u4 = components.find((c) => c.ref === 'U4')!;
    expect(u4.kind).toBe('qfn');
    expect(u4.fabContour).not.toBeNull();
    expect(u4.fabContour!.length).toBeGreaterThanOrEqual(5); // chamfer in the source
    // ...but the drawn body is the bounding square, chamfer squared off
    const { glyphs } = renderComponentGlyphsOf(components);
    const g = glyphs.split('data-ref="U4"')[1]!.split('<g data-ref=')[0]!;
    expect(g).not.toContain('<polygon');
    expect(g).toMatch(/width="4" height="4"/); // pads (4.7 span) peek past it
    expect(g).toContain(`fill="${DEFAULT_PCBA_THEME.pin1}"`); // dot marks orientation
  });

  it('sizes two-pad bodies to full part proportions with termination caps', () => {
    // R1: pads 1.2x0.8 at x 3 / 5.2 (centers span 2.2) -> body 2.31 x 0.68,
    // sharp corners, silver end caps ~20% of the body length each
    const { components } = extractComponents(FRONT_LAYERS, 'front');
    const { glyphs } = renderComponentGlyphsOf(components);
    const r1 = glyphs.split('data-ref="R1"')[1]!.split('<g data-ref=')[0]!;
    expect(r1).toContain('width="2.31"');
    expect(r1).toContain('height="0.68"');
    expect(r1).not.toContain('rx="0.34"'); // not a capsule anymore
    const caps = [...r1.matchAll(/width="(0\.4\d+)"[^>]*fill="#c8cdd2"/g)];
    expect(caps).toHaveLength(2); // [copper pad [silver | black | silver] copper pad]
  });

  it('uses footprint-name dimensions and values from a netlist', () => {
    const netlist = `(export (version "E")
  (components
    (comp (ref "R1") (value "1kohm") (footprint "Resistor_SMD:R_0603_1608Metric"))
    (comp (ref "U1") (value "mcu") (footprint "Package_DFN_QFN:QFN-24-1EP_4x4mm_P0.5mm_EP2.6x2.6mm"))
  )
)
`;
    const parsed = parseNetlistComponents(netlist);
    expect(parsed).toEqual({
      R1: { footprint: 'Resistor_SMD:R_0603_1608Metric', value: '1kohm' },
      U1: { footprint: 'Package_DFN_QFN:QFN-24-1EP_4x4mm_P0.5mm_EP2.6x2.6mm', value: 'mcu' },
    });
    const { components } = extractComponents(FRONT_LAYERS, 'front', parsed);
    expect(components.find((c) => c.ref === 'R1')?.bodyDims).toEqual({ w: 1.6, h: 0.8 });
    expect(components.find((c) => c.ref === 'U1')?.bodyDims).toEqual({ w: 4, h: 4 });
    const { glyphs } = renderComponentGlyphsOf(components);
    const r1 = glyphs.split('data-ref="R1"')[1]!.split('<g data-ref=')[0]!;
    expect(r1).toContain('width="1.6"'); // the 0603 body, not the pad blob
    expect(r1).toContain('height="0.8"');
    // SMD chips carry a printed code, not color bands
    expect(r1).not.toContain('#7a4a2b');
    expect(r1).not.toContain('#c93a3a');
    expect(r1).not.toContain(TOLERANCE_BAND);
  });

  it('draws color bands on through-hole resistors only', () => {
    const front = `%FSLAX36Y36*%
%MOMM*%
%ADD13C,1.3*%
D13*
%TO.P,R5,1*%
X13000000Y10000000D03*
%TD*%
%TO.P,R5,2*%
X14016000Y10000000D03*
%TD*%
M02*
`;
    const back = front.replace('demo-F_Cu', 'demo-B_Cu');
    const { components } = extractComponents(
      [layer('demo-F_Cu.gbr', front), layer('demo-B_Cu.gbr', back)],
      'front',
      { R5: { value: '10k', footprint: 'Resistor_THT:R_Axial_DIN0207_L6.3mm_D2.5mm_P10.16mm_Horizontal' } },
    );
    expect(components.find((c) => c.ref === 'R5')?.kind).toBe('axial');
    const { glyphs } = renderComponentGlyphsOf(components);
    const r5 = glyphs.split('data-ref="R5"')[1]!.split('<g data-ref=')[0]!;
    expect(r5).toContain(`fill="${DEFAULT_PCBA_THEME.bodyResistor}"`); // tan body
    expect(r5).toContain('#7a4a2b'); // brown
    expect(r5).toContain('#3a3d42'); // black
    expect(r5).toContain('#d97b1e'); // orange (10k = 1-0-3)
    expect(r5).toContain(TOLERANCE_BAND); // gold
  });

  it('clips axial decorations to the capsule body — bands and the diode stripe cannot overflow the rounded ends', () => {
    const th2 = (ref: string) => `%FSLAX36Y36*%
%MOMM*%
%ADD15C,1.3*%
D15*
%TO.P,${ref},1*%
X10000000Y6000000D03*
%TD*%
%TO.P,${ref},2*%
X13000000Y6000000D03*
%TD*%
M02*
`;
    const mk = (ref: string) => [layer('demo-F_Cu.gbr', th2(ref)), layer('demo-B_Cu.gbr', th2(ref).replace('demo-F_Cu', 'demo-B_Cu'))];
    const { components } = extractComponents([...mk('D9'), ...mk('R9')], 'front', {
      R9: { value: '10k', footprint: 'Resistor_THT:R_Axial_DIN0207_L6.3mm_D2.5mm_P10.16mm_Horizontal' },
    });
    expect(components.find((c) => c.ref === 'D9')?.kind).toBe('axial');
    expect(components.find((c) => c.ref === 'R9')?.kind).toBe('axial');
    const { glyphs } = renderComponentGlyphsOf(components);
    const glyphOf = (ref: string) => glyphs.split(`data-ref="${ref}"`)[1]!.split('<g data-ref=')[0]!;

    // the diode stripe rides a clip to the body capsule: a clipPath is
    // defined with the body's rounded geometry and the stripe references it.
    // The stripe is FULL body height — clipped, it wraps the end (tall at
    // its inner edge, following the cap's arc at the outer edge) instead of
    // floating as an inset rect
    const d9 = glyphOf('D9');
    expect(d9).toMatch(/<clipPath id="pcba-band-D9"><rect [^>]*rx="[\d.]+"[^>]*><\/clipPath>/);
    expect(d9).toContain(`fill="${DEFAULT_PCBA_THEME.stripe}"`);
    expect((d9.match(/clip-path="url\(#pcba-band-D9\)"/g) ?? []).length).toBe(1);
    const stripeH = Number(/<rect clip-path="url\(#pcba-band-D9\)"[^>]*height="([\d.]+)"/.exec(d9)?.[1] ?? '0');
    const clipH = Number(/<clipPath id="pcba-band-D9"><rect [^>]*height="([\d.]+)"/.exec(d9)?.[1] ?? '0');
    expect(stripeH).toBeCloseTo(clipH, 5); // full wrap: same height as the body

    // the resistor's three value bands + gold tolerance band all ride the same clip
    const r9 = glyphOf('R9');
    expect(r9).toMatch(/<clipPath id="pcba-band-R9">/);
    expect((r9.match(/clip-path="url\(#pcba-band-R9\)"/g) ?? []).length).toBe(4);
  });

  it('applies semantic appearance: MLCC beige, diode stripe, LED tint', () => {
    const chip = (ref: string, y: number) =>
      `%TO.P,${ref},1*%\nX3000000Y${Math.round(y * 1e6)}D03*\n%TD*%\n%TO.P,${ref},2*%\nX5200000Y${Math.round(
        y * 1e6,
      )}D03*\n%TD*%\n`;
    const gerber = `%FSLAX36Y36*%
%MOMM*%
%ADD10R,1.2X0.8*%
D10*
${chip('C19', 3)}${chip('D2', 6)}${chip('LED3', 9)}M02*
`;
    const layers = [layer('demo-F_Cu.gbr', gerber)];
    const { components } = extractComponents(layers, 'front');
    const byRef = new Map(components.map((c) => [c.ref, c]));
    expect(byRef.get('C19')?.semantic).toBe('capacitor');
    expect(byRef.get('D2')?.semantic).toBe('diode');
    expect(byRef.get('LED3')?.semantic).toBe('led');
    const { glyphs } = renderComponentGlyphsOf(components);
    const c19 = glyphs.split('data-ref="C19"')[1]!.split('<g data-ref=')[0]!;
    expect(c19).toContain(`fill="${DEFAULT_PCBA_THEME.bodyMlcc}"`);
    const d2 = glyphs.split('data-ref="D2"')[1]!.split('<g data-ref=')[0]!;
    expect(d2).toContain(`fill="${DEFAULT_PCBA_THEME.stripe}"`);
    const led = glyphs.split('data-ref="LED3"')[1]!.split('<g data-ref=')[0]!;
    expect(led).toContain(`fill="${DEFAULT_PCBA_THEME.ledTint}"`);
    expect(led).toContain('fill-opacity="0.82"');
  });
});

describe('renderPcbaSvg', () => {
  const result = renderPcbaSvg(FRONT_LAYERS, { labels: true });
  const svg = result.svg;

  it('renders the front side by default with a flipped viewBox', () => {
    expect(result.side).toBe('front');
    expect(result.components).toBe(2); // R1 + U1 (TP1 skipped)
    expect(svg).toContain('data-units="mm"');
    const viewBox = /viewBox="([^"]+)"/.exec(svg)![1]!.split(' ').map(Number);
    expect(viewBox[1]).toBeLessThan(0); // y flipped
    expect(svg).toContain('scale(1,-1)');
  });

  it('paints substrate, mask film with openings, pads, silk and holes', () => {
    expect(svg).toContain(`fill="${DEFAULT_PCBA_THEME.board}"`); // substrate
    expect(svg).toContain(`fill="${DEFAULT_PCBA_THEME.clad}"`); // mask film
    expect(svg).toContain(`fill="${DEFAULT_PCBA_THEME.pads}"`); // pads
    expect(svg).toContain(`fill="${DEFAULT_PCBA_THEME.silk}"`); // silkscreen
    expect(svg).toContain(`fill="${DEFAULT_PCBA_THEME.hole}"`); // drills
    expect(svg).toContain('<mask id="pcba-open"'); // openings punched via mask
    expect(svg).toContain('<clipPath id="pcba-clip"');
    expect(svg).toContain(`stroke="${DEFAULT_PCBA_THEME.outline}"`);
  });

  it('ghosts copper through the mask film in a darker mask tone', () => {
    // the overlay rides the same openings mask so pads stay revealed
    expect(svg).toContain(`<g mask="url(#pcba-open)" fill="${DEFAULT_PCBA_THEME.maskCopper}">`);
    const themed = renderPcbaSvg(FRONT_LAYERS, { theme: mergeTheme({ maskCopper: '#123abc' }) });
    expect(themed.svg).toContain('fill="#123abc"');
  });

  it('never paints raw copper through mask openings (no orange halo)', () => {
    // with a mask film, copper exists only as pad finish + the dark
    // through-film ghost — the pour must not leak into the opening rings
    expect(svg).not.toContain(`fill="${DEFAULT_PCBA_THEME.copper}"`);
    // without a mask gerber the bare-board fallback shows raw copper
    const noMask = FRONT_LAYERS.filter((l) => l.info.kind !== 'mask');
    expect(renderPcbaSvg(noMask).svg).toContain(`fill="${DEFAULT_PCBA_THEME.copper}"`);
  });

  it('draws stylized component glyphs with pin-1 markers and labels', () => {
    expect(svg).toContain('data-ref="R1"');
    const glyphs = svg.split('<g id="components">')[1]!.split('</g></g>')[0]!;
    expect(glyphs).toContain('data-ref="U1"');
    expect(glyphs).not.toContain('TP1'); // single pad = test point, no glyph
    const u1 = glyphs.split('data-ref="U1"')[1]!.split('<g data-ref=')[0]!;
    expect(u1).toContain(`fill="${DEFAULT_PCBA_THEME.pin1}"`); // pin-1 dot
    expect(u1).toContain(`fill="${DEFAULT_PCBA_THEME.body}"`);
    expect(u1).toContain(`fill="${DEFAULT_PCBA_THEME.lead}"`); // metal leads
    expect(svg).toMatch(/<text[^>]*>U1<\/text>/); // refdes label
  });

  it('applies a custom theme', () => {
    const themed = renderPcbaSvg(FRONT_LAYERS, {
      theme: mergeTheme({ pads: '#ff0000', clad: '#00ff00' }),
    });
    expect(themed.svg).toContain('fill="#ff0000"');
    expect(themed.svg).toContain('fill="#00ff00"');
  });

  it('skips labels on request', () => {
    expect(renderPcbaSvg(FRONT_LAYERS, { labels: false }).svg).not.toContain('<text');
  });

  it('styles synthetic labels with the theme label font', () => {
    // single quotes are legal inside a double-quoted attribute
    expect(svg).toMatch(/<text[^>]*font-family="'OCR A Std', 'Courier New', monospace"/);
  });

  it('auto-hides labels when silkscreen carries the refdes, shows them without silk', () => {
    // with silk: the silkscreen gerber already draws the refdes — a synthetic
    // label on top would double it
    expect(renderPcbaSvg(FRONT_LAYERS).svg).not.toContain('<text');
    const noSilk = FRONT_LAYERS.filter((l) => l.info.kind !== 'silkscreen');
    expect(renderPcbaSvg(noSilk).svg).toMatch(/<text[^>]*>U1<\/text>/);
  });

  it('renders the back side mirrored', () => {
    const back = [
      layer('demo-Edge_Cuts.gbr', EDGE),
      layer('demo-B_Cu.gbr', F_CU),
      layer('demo-B_Mask.gbr', F_MASK),
    ];
    const result = renderPcbaSvg(back);
    expect(result.side).toBe('back');
    expect(result.svg).toContain('scale(-1,-1)');
    expect(result.svg).toContain('data-ref="R1"');
  });

  it('warns when the copper has no X2 attributes', () => {
    const plain = FRONT_LAYERS.map((l) =>
      l.info.name === 'demo-F_Cu.gbr'
        ? layer(l.info.name, F_CU.replace(/%TO\.P,[^*]*\*%(\r?\n)?/g, '').replace(/%TD\*%(\r?\n)?/g, ''))
        : l,
    );
    const result = renderPcbaSvg(plain);
    expect(result.components).toBe(0);
    expect(result.warnings.join(' ')).toContain('%TO.P');
  });
});

describe('themes', () => {
  it('resolves builtin themes by name', () => {
    expect(loadPcbaTheme('purple-enig').theme.clad).toBe('#5e3d99');
    expect(loadPcbaTheme().name).toBe('green-enig');
  });

  it('merges a theme JSON file over the defaults', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcba-theme-'));
    const file = path.join(dir, 'my-theme.json');
    fs.writeFileSync(file, JSON.stringify({ pads: '#123456', labels: false }));
    const { theme, name } = loadPcbaTheme(file);
    expect(theme.pads).toBe('#123456');
    expect(theme.board).toBe(DEFAULT_PCBA_THEME.board); // untouched key
    expect(theme.labels).toBe(false);
    expect(name).toBe('my-theme.json');
  });

  it('throws on an unknown theme name that is not a file', () => {
    expect(() => loadPcbaTheme('definitely-not-a-theme')).toThrow();
  });
});

describe('renderPcbaFromFiles', () => {
  it('renders from a directory of gerber files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcba-files-'));
    const files: Array<[string, string]> = [
      ['demo-Edge_Cuts.gbr', EDGE],
      ['demo-F_Cu.gbr', F_CU],
      ['demo-F_Mask.gbr', F_MASK],
      ['demo-F_Silkscreen.gbr', F_SILK],
      ['demo.drl', DRILL],
    ];
    for (const [name, content] of files) fs.writeFileSync(path.join(dir, name), content);

    const result = renderPcbaFromFiles([dir], { theme: 'black-hasl' });
    expect(result.themeName).toBe('black-hasl');
    expect(result.layers).toHaveLength(5);
    expect(result.svg).toContain('data-ref="U1"');
    expect(result.components).toBe(2);
  });

  it('auto-discovers a sibling netlist next to the gerber directory', () => {
    const build = fs.mkdtempSync(path.join(os.tmpdir(), 'pcba-build-'));
    const gerbers = path.join(build, 'gerbers');
    fs.mkdirSync(gerbers);
    const files: Array<[string, string]> = [
      ['demo-Edge_Cuts.gbr', EDGE],
      ['demo-F_Cu.gbr', F_CU],
      ['demo-F_Mask.gbr', F_MASK],
      ['demo-F_Silkscreen.gbr', F_SILK],
      ['demo.drl', DRILL],
    ];
    for (const [name, content] of files) fs.writeFileSync(path.join(gerbers, name), content);
    fs.writeFileSync(
      path.join(build, 'demo.net'),
      '(export (version "E")\n  (components\n    (comp (ref "U1") (value "mcu") (footprint "Package_DFN_QFN:QFN-24-1EP_4x4mm_P0.5mm_EP2.6x2.6mm"))\n  )\n)\n',
    );

    // no netlistPath passed — the sibling build/demo.net is discovered
    const result = renderPcbaFromFiles([gerbers]);
    const u1 = result.svg.split('<g id="components">')[1]!.split('</g></g>')[0].split('data-ref="U1"')[1]!;
    expect(u1).toContain('width="4"'); // named dims applied

    // discovery can be disabled
    const bare = renderPcbaFromFiles([gerbers], { discoverNetlist: false });
    const u1bare = bare.svg.split('<g id="components">')[1]!.split('</g></g>')[0].split('data-ref="U1"')[1]!;
    expect(u1bare).not.toContain('width="4"'); // heuristic body only
  });

  it('sizes component bodies from the netlist footprints', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcba-netlist-'));
    const files: Array<[string, string]> = [
      ['demo-Edge_Cuts.gbr', EDGE],
      ['demo-F_Cu.gbr', F_CU],
      ['demo-F_Mask.gbr', F_MASK],
      ['demo-F_Silkscreen.gbr', F_SILK],
      ['demo.drl', DRILL],
      ['demo.net', '(export (version "E")\n  (components\n    (comp (ref "R1") (value "1kohm") (footprint "Resistor_SMD:R_0603_1608Metric"))\n  )\n)\n'],
    ];
    for (const [name, content] of files) fs.writeFileSync(path.join(dir, name), content);

    const result = renderPcbaFromFiles([dir], { netlistPath: path.join(dir, 'demo.net') });
    const glyphs = result.svg.split('<g id="components">')[1]!.split('</g></g>')[0]!;
    const r1 = glyphs.split('data-ref="R1"')[1]!.split('<g data-ref=')[0]!;
    expect(r1).toContain('width="1.6"'); // the real 0603 body
    expect(r1).toContain('height="0.8"');
  });

  it('classifies a 2-pad Y-reference as a crystal without a netlist', () => {
    const gerber = `%FSLAX36Y36*%
%MOMM*%
%ADD10R,1.2X1.0*%
D10*
%TO.P,Y1,1*%
X3000000Y3000000D03*
%TD*%
%TO.P,Y1,2*%
X5200000Y3000000D03*
%TD*%
M02*
`;
    const { components } = extractComponents([layer('demo-F_Cu.gbr', gerber)], 'front');
    expect(components.find((c) => c.ref === 'Y1')?.kind).toBe('crystal');
    const { glyphs } = renderComponentGlyphsOf(components);
    expect(glyphs.split('data-ref="Y1"')[1]!.split('<g data-ref=')[0]!).toContain('#b9bec4'); // metal can
  });

  it('separates qfp from qfn by pad length when no name is known', () => {
    const ring = (padW: number, padH: number, ref: string) => {
      const pads: string[] = [];
      const spots: Array<[number, number]> = [
        [8.5, 11], [9.5, 11], [10.5, 11],
        [8.5, 7], [9.5, 7], [10.5, 7],
        [7.5, 7], [7.5, 9], [7.5, 11],
        [11.5, 7], [11.5, 9], [11.5, 11],
      ];
      for (const [x, y] of spots) pads.push(`%TO.P,${ref},${x}${y}*%\nX${Math.round(x * 1e6)}Y${Math.round(y * 1e6)}D03*\n%TD*%\n`);
      return `%FSLAX36Y36*%\n%MOMM*%\n%ADD10R,${padW}X${padH}*%\nD10*\n${pads.join('')}M02*\n`;
    };
    // long protruding pads (1.5) -> gull wings; short flush pads (0.6) -> leadless
    const qfp = extractComponents([layer('demo-F_Cu.gbr', ring(0.5, 1.5, 'U5'))], 'front');
    expect(qfp.components[0]!.kind).toBe('qfp');
    const qfn = extractComponents([layer('demo-F_Cu.gbr', ring(0.5, 0.6, 'U6'))], 'front');
    expect(qfn.components[0]!.kind).toBe('qfn');
  });
});
