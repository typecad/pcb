import { describe, it, expect } from 'vitest';
import { s, sym, nameOf, serialize } from '../src/sexpr/index.js';
import type { SExpr } from '../src/sexpr/types.js';
import {
    renderOutlinesAndTracks,
    renderKeepoutZones,
} from '../src/pcb/pcb_board_serializer.js';
import type { IGrLine, IGrArc, IKeepoutZone, IOutline } from '../src/pcb/pcb_interfaces.js';

function makeContext() {
    return {
        state: {
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
                x: 0, y: 0, width: 10, height: 10,
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
                x: 0, y: 0, width: 20, height: 10,
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
                x: 0, y: 0, width: 10, height: 5,
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
                polygon: [{ x: 0, y: 0 }, { x: 5, y: 5 }],
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
});
