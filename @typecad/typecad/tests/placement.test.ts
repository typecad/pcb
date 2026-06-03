import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Component, type ComponentInit } from '../src/component.js';
import { below, above, rightOf, leftOf, sameAs, board, PlacementValue, isPlacementValue } from '../src/placement.js';
import type { PlacementBuilder, BoardBounds, SameAsResult, PlacementNumber } from '../src/placement.js';
import { PcbInternalState } from '../src/pcb/pcb_state.js';
import { Schematic } from '../src/schematic.js';
import { PCB } from '../src/pcb/pcb.js';
import { clearFootprintBoundsCache, getFootprintBounds } from '../src/pcb/footprint_bounds.js';

function makeComponentAt(x: number, y: number, bounds?: { width: number; height: number }): Component {
    const c = new Component({ footprint: 'Test:TestFP', pcb: { x, y } });
    if (bounds) {
        vi.spyOn(c, 'bounds', 'get').mockReturnValue(bounds);
    } else {
        vi.spyOn(c, 'bounds', 'get').mockReturnValue(null);
    }
    return c;
}

describe('placement', () => {
    describe('below()', () => {
        it('without target: returns PlacementValue that resolves edge-to-edge', () => {
            const src = makeComponentAt(10, 20, { width: 4, height: 6 });
            const result = below(src).by(3);
            expect(isPlacementValue(result)).toBe(true);
            const pv = result as PlacementValue;
            expect(pv.resolveWithFootprint('Test:TargetFP')).toBe(20 + 3 + 3 + 0);
        });

        it('PlacementValue resolves with target bounds', () => {
            const src = makeComponentAt(10, 20, { width: 4, height: 6 });
            const result = below(src).by(3) as PlacementValue;
            expect(result.resolveWithFootprint('Test:TargetFP')).toBe(20 + 3 + 3 + 0);
        });

        it('with target component: returns resolved number edge-to-edge', () => {
            const src = makeComponentAt(10, 20, { width: 4, height: 6 });
            const tgt = makeComponentAt(0, 0, { width: 2, height: 4 });
            const result = below(src).by(3, tgt);
            expect(typeof result).toBe('number');
            expect(result).toBe(20 + 3 + 3 + 2);
        });

        it('uses default gap of 2mm', () => {
            const c = makeComponentAt(10, 20, { width: 4, height: 6 });
            const result = (below(c).by() as PlacementValue).resolveWithFootprint('Test:FP');
            expect(result).toBe(20 + 3 + 2 + 0);
        });

        it('falls back to zero size when source bounds are null', () => {
            const c = makeComponentAt(10, 20);
            const result = (below(c).by(5) as PlacementValue).resolveWithFootprint('Test:FP');
            expect(result).toBe(20 + 0 + 5 + 0);
        });
    });

    describe('above()', () => {
        it('without target: returns PlacementValue', () => {
            const c = makeComponentAt(10, 20, { width: 4, height: 6 });
            const result = above(c).by(3);
            expect(isPlacementValue(result)).toBe(true);
        });

        it('with target component: returns resolved number', () => {
            const src = makeComponentAt(10, 20, { width: 4, height: 6 });
            const tgt = makeComponentAt(0, 0, { width: 2, height: 4 });
            const result = above(src).by(3, tgt);
            expect(result).toBe(20 - 3 - 3 - 2);
        });

        it('resolves PlacementValue edge-to-edge', () => {
            const c = makeComponentAt(10, 20, { width: 4, height: 6 });
            const result = (above(c).by(3) as PlacementValue).resolveWithFootprint('Test:FP');
            expect(result).toBe(20 - 3 - 3 - 0);
        });

        it('uses default gap of 2mm', () => {
            const c = makeComponentAt(10, 20, { width: 4, height: 6 });
            const result = (above(c).by() as PlacementValue).resolveWithFootprint('Test:FP');
            expect(result).toBe(20 - 3 - 2 - 0);
        });

        it('falls back to zero size when bounds are null', () => {
            const c = makeComponentAt(10, 20);
            const result = (above(c).by(5) as PlacementValue).resolveWithFootprint('Test:FP');
            expect(result).toBe(20 - 0 - 5 - 0);
        });
    });

    describe('rightOf()', () => {
        it('without target: returns PlacementValue', () => {
            const c = makeComponentAt(10, 20, { width: 4, height: 6 });
            const result = rightOf(c).by(3);
            expect(isPlacementValue(result)).toBe(true);
        });

        it('with target component: returns resolved number', () => {
            const src = makeComponentAt(10, 20, { width: 4, height: 6 });
            const tgt = makeComponentAt(0, 0, { width: 8, height: 2 });
            const result = rightOf(src).by(3, tgt);
            expect(result).toBe(10 + 2 + 3 + 4);
        });

        it('resolves PlacementValue edge-to-edge', () => {
            const c = makeComponentAt(10, 20, { width: 4, height: 6 });
            const result = (rightOf(c).by(3) as PlacementValue).resolveWithFootprint('Test:FP');
            expect(result).toBe(10 + 2 + 3 + 0);
        });

        it('uses default gap of 2mm', () => {
            const c = makeComponentAt(10, 20, { width: 4, height: 6 });
            const result = (rightOf(c).by() as PlacementValue).resolveWithFootprint('Test:FP');
            expect(result).toBe(10 + 2 + 2 + 0);
        });
    });

    describe('leftOf()', () => {
        it('without target: returns PlacementValue', () => {
            const c = makeComponentAt(10, 20, { width: 4, height: 6 });
            const result = leftOf(c).by(3);
            expect(isPlacementValue(result)).toBe(true);
        });

        it('with target component: returns resolved number', () => {
            const src = makeComponentAt(10, 20, { width: 4, height: 6 });
            const tgt = makeComponentAt(0, 0, { width: 8, height: 2 });
            const result = leftOf(src).by(3, tgt);
            expect(result).toBe(10 - 2 - 3 - 4);
        });

        it('resolves PlacementValue edge-to-edge', () => {
            const c = makeComponentAt(10, 20, { width: 4, height: 6 });
            const result = (leftOf(c).by(3) as PlacementValue).resolveWithFootprint('Test:FP');
            expect(result).toBe(10 - 2 - 3 - 0);
        });

        it('uses default gap of 2mm', () => {
            const c = makeComponentAt(10, 20, { width: 4, height: 6 });
            const result = (leftOf(c).by() as PlacementValue).resolveWithFootprint('Test:FP');
            expect(result).toBe(10 - 2 - 2 - 0);
        });
    });

    describe('sameAs()', () => {
        it('returns x and y of component', () => {
            const c = makeComponentAt(15, 25);
            const result = sameAs(c);
            expect(result.x).toBe(15);
            expect(result.y).toBe(25);
        });

        it('reflects live position changes', () => {
            const c = makeComponentAt(15, 25);
            const result = sameAs(c);
            c.pcb.x = 50;
            expect(result.x).toBe(50);
        });
    });

    describe('board()', () => {
        it('returns zero bounds when no outlines defined', () => {
            const pcb = new PCB('test', { schematic: new Schematic('test') });
            const b = board(pcb);
            expect(b.width).toBe(0);
            expect(b.height).toBe(0);
            expect(b.center).toEqual({ x: 0, y: 0 });
        });

        it('computes bounds from outlines', () => {
            const pcb = new PCB('test', { schematic: new Schematic('test') });
            pcb.outline(10, 20, 30, 40);

            const b = board(pcb);
            expect(b.left).toBe(10);
            expect(b.top).toBe(20);
            expect(b.right).toBe(40);
            expect(b.bottom).toBe(60);
            expect(b.width).toBe(30);
            expect(b.height).toBe(40);
            expect(b.center).toEqual({ x: 25, y: 40 });
        });

        it('computes corner positions', () => {
            const pcb = new PCB('test', { schematic: new Schematic('test') });
            pcb.outline(10, 20, 30, 40);

            const b = board(pcb);
            expect(b.topLeft).toEqual({ x: 10, y: 20 });
            expect(b.topRight).toEqual({ x: 40, y: 20 });
            expect(b.bottomLeft).toEqual({ x: 10, y: 60 });
            expect(b.bottomRight).toEqual({ x: 40, y: 60 });
        });

        it('handles filleted corners', () => {
            const pcb = new PCB('test', { schematic: new Schematic('test') });
            pcb.outline(0, 0, 100, 100, 5);

            const b = board(pcb);
            expect(b.left).toBeCloseTo(0, 0);
            expect(b.top).toBeCloseTo(0, 0);
            expect(b.right).toBeCloseTo(100, 0);
            expect(b.bottom).toBeCloseTo(100, 0);
        });

        it('fromLeft returns PlacementValue for edge-to-edge margin', () => {
            const pcb = new PCB('test', { schematic: new Schematic('test') });
            pcb.outline(0, 0, 100, 80);
            const b = board(pcb);

            const pv = b.fromLeft(5);
            expect(isPlacementValue(pv)).toBe(true);
            expect(pv.resolveWithFootprint('Nonexistent:FP')).toBe(5 + 0);
        });

        it('fromRight returns PlacementValue for edge-to-edge margin', () => {
            const pcb = new PCB('test', { schematic: new Schematic('test') });
            pcb.outline(0, 0, 100, 80);
            const b = board(pcb);

            const pv = b.fromRight(5);
            expect(pv.resolveWithFootprint('Nonexistent:FP')).toBe(100 - 5 - 0);
        });

        it('fromTop returns PlacementValue for edge-to-edge margin', () => {
            const pcb = new PCB('test', { schematic: new Schematic('test') });
            pcb.outline(10, 20, 30, 40);
            const b = board(pcb);

            const pv = b.fromTop(3);
            expect(pv.resolveWithFootprint('Nonexistent:FP')).toBe(20 + 3 + 0);
        });

        it('fromBottom returns PlacementValue for edge-to-edge margin', () => {
            const pcb = new PCB('test', { schematic: new Schematic('test') });
            pcb.outline(10, 20, 30, 40);
            const b = board(pcb);

            const pv = b.fromBottom(3);
            expect(pv.resolveWithFootprint('Nonexistent:FP')).toBe(60 - 3 - 0);
        });

        it('from* methods use default margin of 2mm', () => {
            const pcb = new PCB('test', { schematic: new Schematic('test') });
            pcb.outline(0, 0, 100, 80);
            const b = board(pcb);

            expect((b.fromLeft() as PlacementValue).resolveWithFootprint('Nonexistent:FP')).toBe(2);
            expect((b.fromRight() as PlacementValue).resolveWithFootprint('Nonexistent:FP')).toBe(98);
            expect((b.fromTop() as PlacementValue).resolveWithFootprint('Nonexistent:FP')).toBe(2);
            expect((b.fromBottom() as PlacementValue).resolveWithFootprint('Nonexistent:FP')).toBe(78);
        });

        it('from* resolves with actual target bounds', () => {
            const pcb = new PCB('test', { schematic: new Schematic('test') });
            pcb.outline(0, 0, 100, 80);
            const b = board(pcb);

            const c = new Component({
                footprint: 'Test:FP',
                pcb: {
                    x: b.fromRight(5),
                    y: b.fromBottom(3),
                },
            });

            expect(typeof c.pcb.x).toBe('number');
            expect(typeof c.pcb.y).toBe('number');
        });
    });

    describe('integration: Component constructor resolves PlacementValue', () => {
        it('resolves below() PlacementValue during construction', () => {
            const src = new Component({ footprint: 'Test:SrcFP', pcb: { x: 10, y: 20 } });
            vi.spyOn(src, 'bounds', 'get').mockReturnValue({ width: 4, height: 6 });

            const tgt = new Component({
                footprint: 'Test:TgtFP',
                pcb: {
                    x: sameAs(src).x,
                    y: below(src).by(5),
                },
            });
            vi.spyOn(tgt, 'bounds', 'get').mockReturnValue({ width: 2, height: 4 });

            expect(typeof tgt.pcb.x).toBe('number');
            expect(typeof tgt.pcb.y).toBe('number');
            expect(tgt.pcb.x).toBe(10);
        });

        it('resolves rightOf() PlacementValue during construction', () => {
            const src = new Component({ footprint: 'Test:SrcFP', pcb: { x: 10, y: 20 } });
            vi.spyOn(src, 'bounds', 'get').mockReturnValue({ width: 4, height: 6 });

            const tgt = new Component({
                footprint: 'Test:TgtFP',
                pcb: {
                    x: rightOf(src).by(3),
                    y: sameAs(src).y,
                },
            });

            expect(typeof tgt.pcb.x).toBe('number');
            expect(tgt.pcb.y).toBe(20);
        });

        it('places component at board center', () => {
            const pcb = new PCB('test', { schematic: new Schematic('test') });
            pcb.outline(0, 0, 100, 80);

            const b = board(pcb);
            const c = makeComponentAt(b.center.x, b.center.y);

            expect(c.pcb.x).toBe(50);
            expect(c.pcb.y).toBe(40);
        });
    });
});

describe('PcbInternalState.getOutlineBounds', () => {
    function makeState(): PcbInternalState {
        return new PcbInternalState({ schematic: new Schematic('test') });
    }

    it('returns null when no outlines exist', () => {
        const state = makeState();
        expect(state.getOutlineBounds()).toBeNull();
    });

    it('computes bounds from a single outline', () => {
        const state = makeState();
        state.stagedOutlines.push({
            uuid: 'test',
            x: 10, y: 20, width: 30, height: 40, filletRadius: 0,
            elements: [
                { type: 'line', uuid: 'a', layer: 'Edge.Cuts', strokeWidth: 0.05, start: { x: 10, y: 20 }, end: { x: 40, y: 20 }, locked: false },
                { type: 'line', uuid: 'b', layer: 'Edge.Cuts', strokeWidth: 0.05, start: { x: 40, y: 20 }, end: { x: 40, y: 60 }, locked: false },
                { type: 'line', uuid: 'c', layer: 'Edge.Cuts', strokeWidth: 0.05, start: { x: 40, y: 60 }, end: { x: 10, y: 60 }, locked: false },
                { type: 'line', uuid: 'd', layer: 'Edge.Cuts', strokeWidth: 0.05, start: { x: 10, y: 60 }, end: { x: 10, y: 20 }, locked: false },
            ]
        });

        const bounds = state.getOutlineBounds()!;
        expect(bounds.minX).toBe(10);
        expect(bounds.minY).toBe(20);
        expect(bounds.maxX).toBe(40);
        expect(bounds.maxY).toBe(60);
    });

    it('computes bounds across multiple outlines', () => {
        const state = makeState();
        state.outlines.push({
            uuid: 'a', x: 0, y: 0, width: 10, height: 10, filletRadius: 0,
            elements: [
                { type: 'line', uuid: 'a1', layer: 'Edge.Cuts', strokeWidth: 0.05, start: { x: 0, y: 0 }, end: { x: 10, y: 10 }, locked: false },
            ]
        });
        state.stagedOutlines.push({
            uuid: 'b', x: 50, y: 50, width: 10, height: 10, filletRadius: 0,
            elements: [
                { type: 'line', uuid: 'b1', layer: 'Edge.Cuts', strokeWidth: 0.05, start: { x: 50, y: 50 }, end: { x: 60, y: 60 }, locked: false },
            ]
        });

        const bounds = state.getOutlineBounds()!;
        expect(bounds.minX).toBe(0);
        expect(bounds.minY).toBe(0);
        expect(bounds.maxX).toBe(60);
        expect(bounds.maxY).toBe(60);
    });

    it('handles arc elements', () => {
        const state = makeState();
        state.stagedOutlines.push({
            uuid: 'arc-test', x: 0, y: 0, width: 10, height: 10, filletRadius: 5,
            elements: [
                { type: 'arc', uuid: 'a1', layer: 'Edge.Cuts', strokeWidth: 0.05, start: { x: 5, y: 0 }, mid: { x: 10, y: 5 }, end: { x: 5, y: 10 } },
            ]
        });

        const bounds = state.getOutlineBounds()!;
        expect(bounds.minX).toBe(5);
        expect(bounds.minY).toBe(0);
        expect(bounds.maxX).toBe(10);
        expect(bounds.maxY).toBe(10);
    });
});
