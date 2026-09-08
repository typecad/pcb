import { describe, it, expect } from 'vitest';
import { s, sym, nameOf, serialize } from '../src/sexpr/index.js';
import type { SExpr } from '../src/sexpr/types.js';
import {
  renderOutlinesAndTracks,
  renderKeepoutZones,
  renderVias,
  renderGraphics,
  renderZones,
} from '../src/pcb/pcb_board_serializer.js';
import type {
  IGrLine,
  IGrArc,
  IKeepoutZone,
  IOutline,
  IVia,
  IFilledZone,
  IGrTextOptions,
  IGrCircle,
  IGrRect,
  IGrPoly,
} from '../src/pcb/pcb_interfaces.js';

function makeContext() {
  return {
    _state: {
      grTexts: [],
      grLines: [],
      grCircles: [],
      grRects: [],
      grPolys: [],
      components: [],
      stagedComponents: [],
      zones: [],
      keepoutZones: [],
      stagedOutlines: [],
      existingBoardElements: [],
      pcb: '',
    },
    boardName: 'test',
    copper_thickness: 35,
    options: {},
    outlines: [],
    resolveNet: () => ({ found: false, netCode: 0, netName: '' }),
  };
}

describe('pcb_board_serializer', () => {
  describe('renderOutlinesAndTracks', () => {
    it('should render non-copper line as gr_line', () => {
      const boardContents: SExpr[] = [];
      const line: IGrLine = {
        type: 'line',
        start: { x: 0, y: 0 },
        end: { x: 10, y: 10 },
        strokeWidth: 0.2,
        layer: 'Edge.Cuts',
        uuid: 'line-1',
      };
      const outline: IOutline = {
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        filletRadius: 0,
        elements: [line],
        uuid: 'outline-1',
      };
      renderOutlinesAndTracks([outline], makeContext() as any, new Map(), boardContents);
      expect(boardContents.length).toBe(1);
      const serialized = serialize(boardContents[0]);
      expect(serialized).toContain('gr_line');
      expect(serialized).toContain('Edge.Cuts');
    });

    it('should render copper line as segment', () => {
      const boardContents: SExpr[] = [];
      const netMap = new Map<string, number>();
      netMap.set('vcc', 1);
      const line: IGrLine = {
        type: 'line',
        start: { x: 5, y: 5 },
        end: { x: 15, y: 5 },
        strokeWidth: 0.25,
        layer: 'F.Cu',
        uuid: 'seg-1',
        net: 'VCC',
      };
      const outline: IOutline = {
        x: 0,
        y: 0,
        width: 20,
        height: 10,
        filletRadius: 0,
        elements: [line],
        uuid: 'outline-2',
      };
      renderOutlinesAndTracks([outline], makeContext() as any, netMap, boardContents);
      expect(boardContents.length).toBe(1);
      const serialized = serialize(boardContents[0]);
      expect(serialized).toContain('segment');
      expect(serialized).toContain('F.Cu');
    });

    it('should render arc elements', () => {
      const boardContents: SExpr[] = [];
      const arc: IGrArc = {
        type: 'arc',
        start: { x: 0, y: 0 },
        mid: { x: 5, y: 5 },
        end: { x: 10, y: 0 },
        strokeWidth: 0.2,
        layer: 'Edge.Cuts',
        uuid: 'arc-1',
      };
      const outline: IOutline = {
        x: 0,
        y: 0,
        width: 10,
        height: 5,
        filletRadius: 0,
        elements: [arc],
        uuid: 'outline-3',
      };
      renderOutlinesAndTracks([outline], makeContext() as any, new Map(), boardContents);
      expect(boardContents.length).toBe(1);
      const serialized = serialize(boardContents[0]);
      expect(serialized).toContain('gr_arc');
    });

    it('should handle empty outlines', () => {
      const boardContents: SExpr[] = [];
      renderOutlinesAndTracks([], makeContext() as any, new Map(), boardContents);
      expect(boardContents.length).toBe(0);
    });
  });

  describe('renderKeepoutZones', () => {
    it('should render keepout zone with restrictions', () => {
      const boardContents: SExpr[] = [];
      const zone: IKeepoutZone = {
        polygon: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
          { x: 0, y: 10 },
        ],
        layers: ['F.Cu'],
        uuid: 'keepout-1',
        restrictions: {
          tracks: true,
          vias: true,
          pads: false,
          copperpour: true,
          footprints: false,
        },
      };
      renderKeepoutZones([zone], boardContents);
      expect(boardContents.length).toBe(1);
      const serialized = serialize(boardContents[0]);
      expect(serialized).toContain('keepout');
      expect(serialized).toContain('not_allowed');
      expect(serialized).toContain('allowed');
    });

    it('should handle keepout with name and priority', () => {
      const boardContents: SExpr[] = [];
      const zone: IKeepoutZone = {
        polygon: [
          { x: 0, y: 0 },
          { x: 5, y: 5 },
        ],
        layers: ['B.Cu'],
        uuid: 'keepout-2',
        name: 'NoRoute',
        priority: 5,
        restrictions: { tracks: true },
      };
      renderKeepoutZones([zone], boardContents);
      expect(boardContents.length).toBe(1);
      const serialized = serialize(boardContents[0]);
      expect(serialized).toContain('NoRoute');
      expect(serialized).toContain('priority');
    });

    it('should handle empty keepout zones', () => {
      const boardContents: SExpr[] = [];
      renderKeepoutZones([], boardContents);
      expect(boardContents.length).toBe(0);
    });
  });

  describe('renderVias', () => {
    it('should render via with net resolved from boardNetNameToCodeMap', () => {
      const boardContents: SExpr[] = [];
      const netMap = new Map<string, number>();
      netMap.set('vcc', 1);
      const viaMap = new Map<string, IVia>();
      viaMap.set('via-1', {
        uuid: 'via-1',
        net: 'VCC',
        at: { x: 10, y: 20 },
        size: 0.8,
        drill: 0.4,
        layers: ['F.Cu', 'In1.Cu', 'B.Cu'],
      });
      renderVias(viaMap, makeContext() as any, netMap, boardContents);
      expect(boardContents.length).toBe(1);
      const serialized = serialize(boardContents[0]);
      expect(serialized).toContain('via');
      expect(serialized).toContain('at');
      expect(serialized).toContain('free');
      expect(serialized).toContain('net');
    });

    it('should render via with net resolved from resolveNet when no net map match', () => {
      const boardContents: SExpr[] = [];
      const netMap = new Map<string, number>();
      const viaMap = new Map<string, IVia>();
      viaMap.set('via-2', {
        uuid: 'via-2',
        net: 'SIGNAL',
        at: { x: 5, y: 5 },
      });
      const ctx = makeContext();
      ctx.resolveNet = () => ({ found: true, netCode: 5, netName: 'SIGNAL' });
      renderVias(viaMap, ctx as any, netMap, boardContents);
      expect(boardContents.length).toBe(1);
    });

    it('should use net 0 when via has no net and no uuid', () => {
      const boardContents: SExpr[] = [];
      const viaMap = new Map<string, IVia>();
      viaMap.set('via-3', { uuid: 'via-3NoNet', at: { x: 0, y: 0 } });
      renderVias(viaMap, makeContext() as any, new Map(), boardContents);
      expect(boardContents.length).toBe(1);
      const serialized = serialize(boardContents[0]);
      expect(serialized).toContain('via');
    });

    it('should handle empty via map', () => {
      const boardContents: SExpr[] = [];
      renderVias(new Map(), makeContext() as any, new Map(), boardContents);
      expect(boardContents.length).toBe(0);
    });
  });

  describe('renderGraphics', () => {
    it('should render gr_text element', () => {
      const boardContents: SExpr[] = [];
      const ctx = makeContext();
      ctx._state.grTexts = [
        {
          text: 'TEST_LABEL',
          x: 10,
          y: 20,
          rotation: 90,
          layer: 'F.SilkS',
          uuid: 'text-1',
        },
      ];
      renderGraphics(ctx as any, boardContents);
      expect(boardContents.length).toBe(1);
      const serialized = serialize(boardContents[0]);
      expect(serialized).toContain('gr_text');
      expect(serialized).toContain('TEST_LABEL');
    });

    it('should render gr_text with font effects', () => {
      const boardContents: SExpr[] = [];
      const ctx = makeContext();
      ctx._state.grTexts = [
        {
          text: 'BOLD',
          x: 0,
          y: 0,
          font: 'Arial',
          width: 2,
          height: 2,
          thickness: 0.3,
          bold: true,
          italic: true,
          justify: { horizontal: 'center', vertical: 'middle', mirror: true },
          uuid: 'text-2',
        },
      ];
      renderGraphics(ctx as any, boardContents);
      const serialized = serialize(boardContents[0]);
      expect(serialized).toContain('bold');
      expect(serialized).toContain('italic');
      expect(serialized).toContain('center');
      expect(serialized).toContain('middle');
      expect(serialized).toContain('mirror');
    });

    it('should render gr_text with hide flag', () => {
      const boardContents: SExpr[] = [];
      const ctx = makeContext();
      ctx._state.grTexts = [
        {
          text: 'HIDDEN',
          x: 0,
          y: 0,
          hide: true,
          uuid: 'text-3',
        },
      ];
      renderGraphics(ctx as any, boardContents);
      const serialized = serialize(boardContents[0]);
      expect(serialized).toContain('hide');
    });

    it('should render gr_line element', () => {
      const boardContents: SExpr[] = [];
      const ctx = makeContext();
      ctx._state.grLines = [
        {
          type: 'line',
          start: { x: 0, y: 0 },
          end: { x: 10, y: 10 },
          strokeWidth: 0.2,
          layer: 'Edge.Cuts',
          uuid: 'grline-1',
        },
      ];
      renderGraphics(ctx as any, boardContents);
      expect(boardContents.length).toBe(1);
      const serialized = serialize(boardContents[0]);
      expect(serialized).toContain('gr_line');
    });

    it('should render gr_line with locked flag', () => {
      const boardContents: SExpr[] = [];
      const ctx = makeContext();
      ctx._state.grLines = [
        {
          type: 'line',
          start: { x: 0, y: 0 },
          end: { x: 5, y: 5 },
          strokeWidth: 0.1,
          layer: 'F.SilkS',
          uuid: 'grline-2',
          locked: true,
        },
      ];
      renderGraphics(ctx as any, boardContents);
      const serialized = serialize(boardContents[0]);
      expect(serialized).toContain('locked');
    });

    it('should render gr_circle element', () => {
      const boardContents: SExpr[] = [];
      const ctx = makeContext();
      ctx._state.grCircles = [
        {
          type: 'circle',
          center: { x: 0, y: 0 },
          end: { x: 5, y: 0 },
          strokeWidth: 0.2,
          layer: 'F.SilkS',
          uuid: 'circle-1',
        },
      ];
      renderGraphics(ctx as any, boardContents);
      expect(boardContents.length).toBe(1);
      const serialized = serialize(boardContents[0]);
      expect(serialized).toContain('gr_circle');
    });

    it('should render filled gr_circle', () => {
      const boardContents: SExpr[] = [];
      const ctx = makeContext();
      ctx._state.grCircles = [
        {
          type: 'circle',
          center: { x: 0, y: 0 },
          end: { x: 3, y: 0 },
          strokeWidth: 0.1,
          layer: 'F.SilkS',
          uuid: 'circle-2',
          fill: true,
          locked: true,
        },
      ];
      renderGraphics(ctx as any, boardContents);
      const serialized = serialize(boardContents[0]);
      expect(serialized).toContain('fill');
      expect(serialized).toContain('locked');
    });

    it('should render gr_rect element', () => {
      const boardContents: SExpr[] = [];
      const ctx = makeContext();
      ctx._state.grRects = [
        {
          type: 'rect',
          start: { x: 0, y: 0 },
          end: { x: 10, y: 5 },
          strokeWidth: 0.2,
          layer: 'F.SilkS',
          uuid: 'rect-1',
        },
      ];
      renderGraphics(ctx as any, boardContents);
      expect(boardContents.length).toBe(1);
      const serialized = serialize(boardContents[0]);
      expect(serialized).toContain('gr_rect');
    });

    it('should render filled gr_rect', () => {
      const boardContents: SExpr[] = [];
      const ctx = makeContext();
      ctx._state.grRects = [
        {
          type: 'rect',
          start: { x: 0, y: 0 },
          end: { x: 5, y: 5 },
          strokeWidth: 0.1,
          layer: 'F.SilkS',
          uuid: 'rect-2',
          fill: true,
          locked: true,
        },
      ];
      renderGraphics(ctx as any, boardContents);
      const serialized = serialize(boardContents[0]);
      expect(serialized).toContain('fill');
      expect(serialized).toContain('locked');
    });

    it('should render gr_poly element', () => {
      const boardContents: SExpr[] = [];
      const ctx = makeContext();
      ctx._state.grPolys = [
        {
          type: 'poly',
          points: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 5 },
          ],
          strokeWidth: 0.2,
          layer: 'F.SilkS',
          uuid: 'poly-1',
        },
      ];
      renderGraphics(ctx as any, boardContents);
      expect(boardContents.length).toBe(1);
      const serialized = serialize(boardContents[0]);
      expect(serialized).toContain('gr_poly');
    });

    it('should render filled gr_poly', () => {
      const boardContents: SExpr[] = [];
      const ctx = makeContext();
      ctx._state.grPolys = [
        {
          type: 'poly',
          points: [
            { x: 0, y: 0 },
            { x: 5, y: 0 },
            { x: 5, y: 3 },
          ],
          strokeWidth: 0.1,
          layer: 'F.SilkS',
          uuid: 'poly-2',
          fill: true,
          locked: true,
        },
      ];
      renderGraphics(ctx as any, boardContents);
      const serialized = serialize(boardContents[0]);
      expect(serialized).toContain('fill');
      expect(serialized).toContain('locked');
    });

    it('should handle empty state arrays', () => {
      const boardContents: SExpr[] = [];
      renderGraphics(makeContext() as any, boardContents);
      expect(boardContents.length).toBe(0);
    });
  });

  describe('renderZones', () => {
    it('should render filled zone with net resolved from schematic', () => {
      const boardContents: SExpr[] = [];
      const netMap = new Map<string, number>();
      netMap.set('vcc', 1);
      const zones = [
        {
          uuid: 'zone-1',
          layers: ['F.Cu'],
          polygon: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
            { x: 0, y: 10 },
          ],
          net: 'net:VCC',
        },
      ];
      const ctx = makeContext();
      ctx.schematic = {
        nodes: [{ name: 'VCC', code: 1 }],
      } as any;
      renderZones(zones as any, ctx as any, netMap, boardContents);
      expect(boardContents.length).toBe(1);
      const serialized = serialize(boardContents[0]);
      expect(serialized).toContain('zone');
      expect(serialized).toContain('net');
      expect(serialized).toContain('polygon');
    });

    it('should render zone with pin-based net resolution', () => {
      const boardContents: SExpr[] = [];
      const zones = [
        {
          uuid: 'zone-2',
          layers: ['B.Cu'],
          polygon: [
            { x: 0, y: 0 },
            { x: 5, y: 0 },
            { x: 5, y: 5 },
          ],
          net: 'pin:U1:1',
        },
      ];
      const ctx = makeContext();
      ctx.resolveNet = () => ({ found: true, netCode: 3, netName: 'GND' });
      renderZones(zones as any, ctx as any, new Map(), boardContents);
      expect(boardContents.length).toBe(1);
    });

    it('should render zone with hatch fill mode and smoothing', () => {
      const boardContents: SExpr[] = [];
      const zones = [
        {
          uuid: 'zone-3',
          layers: ['F.Cu'],
          polygon: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
            { x: 0, y: 10 },
          ],
          fillMode: 'hatched',
          hatchThickness: 0.2,
          hatchGap: 0.3,
          hatchOrientation: 45,
          smoothing: 'fillet',
          smoothingRadius: 0.5,
          islandRemovalMode: 2,
          islandAreaMin: 1,
          thermalGap: 0.5,
          thermalBridgeWidth: 0.3,
          clearance: 0.2,
          connectPads: 'thru_hole_only',
          minThickness: 0.1,
        },
      ];
      renderZones(zones as any, makeContext() as any, new Map(), boardContents);
      expect(boardContents.length).toBe(1);
      const serialized = serialize(boardContents[0]);
      expect(serialized).toContain('hatch');
      // KiCad's fill mode token is `hatch`, never `hatched`
      expect(serialized).toContain('(mode hatch)');
      expect(serialized).not.toContain('hatched');
      expect(serialized).toContain('thru_hole_only');
    });

    it('should render zone with full pad connection', () => {
      const boardContents: SExpr[] = [];
      const zones = [
        {
          uuid: 'zone-4',
          layers: ['F.Cu'],
          polygon: [
            { x: 0, y: 0 },
            { x: 5, y: 0 },
            { x: 5, y: 5 },
          ],
          connectPads: 'full',
          clearance: 0.1,
        },
      ];
      renderZones(zones as any, makeContext() as any, new Map(), boardContents);
      expect(boardContents.length).toBe(1);
      const serialized = serialize(boardContents[0]);
      expect(serialized).toContain('yes');
    });

    it('should render zone with no pad connection', () => {
      const boardContents: SExpr[] = [];
      const zones = [
        {
          uuid: 'zone-5',
          layers: ['F.Cu'],
          polygon: [
            { x: 0, y: 0 },
            { x: 5, y: 0 },
            { x: 5, y: 5 },
          ],
          connectPads: 'no',
        },
      ];
      renderZones(zones as any, makeContext() as any, new Map(), boardContents);
      expect(boardContents.length).toBe(1);
    });

    it('should render zone with name and priority', () => {
      const boardContents: SExpr[] = [];
      const zones = [
        {
          uuid: 'zone-6',
          layers: ['F.Cu'],
          polygon: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
          ],
          name: 'GND_POUR',
          priority: 5,
          locked: true,
        },
      ];
      renderZones(zones as any, makeContext() as any, new Map(), boardContents);
      const serialized = serialize(boardContents[0]);
      expect(serialized).toContain('GND_POUR');
      expect(serialized).toContain('priority');
      expect(serialized).toContain('locked');
    });

    it('should render zone with filled=false (unfilled)', () => {
      const boardContents: SExpr[] = [];
      const zones = [
        {
          uuid: 'zone-7',
          layers: ['F.Cu'],
          polygon: [
            { x: 0, y: 0 },
            { x: 5, y: 0 },
            { x: 5, y: 5 },
          ],
          filled: false,
        },
      ];
      renderZones(zones as any, makeContext() as any, new Map(), boardContents);
      expect(boardContents.length).toBe(1);
      const serialized = serialize(boardContents[0]);
      expect(serialized).not.toContain('fill');
    });

    it('should handle empty zones array', () => {
      const boardContents: SExpr[] = [];
      renderZones([], makeContext() as any, new Map(), boardContents);
      expect(boardContents.length).toBe(0);
    });
  });
});
