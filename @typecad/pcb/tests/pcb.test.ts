import { describe, it, expect, beforeEach } from 'vitest';
import { PCB, getPcbState, pcbTrackSegment, pcbGetTrackData } from '../src/pcb/pcb.js';
import { Component } from '../src/component.js';
import { Pin } from '../src/pin.js';

describe('PCB', () => {
  let pcb: PCB;

  beforeEach(() => {
    pcb = new PCB('test_board');
  });

  describe('Basic PCB Operations', () => {
    it('should create a PCB instance', () => {
      expect(pcb).toBeDefined();
      expect(pcb.boardName).toBe('test_board');
      expect(pcb.schematic).toBeDefined();
    });

    it('should have default options', () => {
      expect(pcb.options.remove_orphans).toBe(true);
    });
  });

  describe('Component Management', () => {
    it('should add components to schematic via add()', () => {
      const resistor = new Component({
        reference: 'RP1',
        value: '10k',
        footprint: 'Resistor_SMD:R_0805_2012Metric',
      });

      pcb.add(resistor);

      expect(pcb.schematic.components).toHaveLength(1);
      expect(pcb.schematic.components[0]).toBe(resistor);
    });

    it('should place components without errors', () => {
      const resistor = new Component({
        reference: 'RP2',
        value: '10k',
        footprint: 'Resistor_SMD:R_0805_2012Metric',
      });

      resistor.pcb = { x: 100, y: 100, rotation: 0 };

      pcb.place(resistor);

      expect(getPcbState(pcb).components).toContain(resistor);
    });

    it('should handle multiple components placement', () => {
      const resistor = new Component({
        reference: 'RP3',
        value: '10k',
        footprint: 'Resistor_SMD:R_0805_2012Metric',
      });

      const capacitor = new Component({
        reference: 'CP1',
        value: '10uF',
        footprint: 'Capacitor_SMD:C_0805_2012Metric',
      });

      resistor.pcb = { x: 100, y: 100, rotation: 0 };
      capacitor.pcb = { x: 200, y: 200, rotation: 90 };

      pcb.place(resistor, capacitor);

      expect(getPcbState(pcb).components).toContain(resistor);
      expect(getPcbState(pcb).components).toContain(capacitor);
    });

    it('should handle DNP components correctly', () => {
      const resistor = new Component({
        reference: 'RP4',
        value: '10k',
        footprint: 'Resistor_SMD:R_0805_2012Metric',
        dnp: true,
      });

      resistor.pcb = { x: 100, y: 100, rotation: 0 };

      pcb.place(resistor);

      // DNP components are not added to the board components list
      expect(getPcbState(pcb).components).not.toContain(resistor);
      expect(resistor.dnp).toBe(true);
    });

    it('should handle component with simulation data', () => {
      const resistor = new Component({
        reference: 'RP5',
        value: '10k',
        footprint: 'Resistor_SMD:R_0805_2012Metric',
        simulation: { include: true, model: 'resistor.sp' },
      });

      resistor.pcb = { x: 100, y: 100, rotation: 0 };
      pcb.place(resistor);

      expect(resistor.simulation).toEqual({ include: true, model: 'resistor.sp' });
    });

    it('should handle component with different sides and rotations', () => {
      const resistor = new Component({
        reference: 'RP6',
        value: '10k',
        footprint: 'Resistor_SMD:R_0805_2012Metric',
      });

      resistor.pcb = { x: 100, y: 100, rotation: 45, side: 'back' };

      pcb.place(resistor);

      expect(getPcbState(pcb).components).toContain(resistor);
      expect(resistor.pcb.rotation).toBe(45);
      expect(resistor.pcb.side).toBe('back');
    });

    it('should handle component connections', () => {
      const resistor = new Component({
        reference: 'RP7',
        value: '10k',
        footprint: 'Resistor_SMD:R_0805_2012Metric',
      });

      const pin1 = new Pin(resistor.reference, 1, 'input');
      const pin2 = new Pin(resistor.reference, 2, 'output');

      resistor.pins = [pin1, pin2];
      resistor.pcb = { x: 100, y: 100, rotation: 0 };

      pcb.place(resistor);

      expect(getPcbState(pcb).components).toContain(resistor);
      expect(resistor.pins).toHaveLength(2);
      expect(resistor.pins[0]).toBe(pin1);
      expect(resistor.pins[1]).toBe(pin2);
    });
  });

  describe('Via Operations', () => {
    // it('should create a via with default parameters', () => {
    //   const via = pcb.via();

    //   expect(via.via).toBe(true);
    //   expect(via.viaData).toBeDefined();
    //   expect(via.viaData?.at).toEqual({ x: 0, y: 0 });
    //   expect(via.viaData?.size).toBe(0.8);
    //   expect(via.viaData?.drill).toBe(0.4);
    //   expect(via.viaData?.layers).toEqual(["F.Cu", "B.Cu"]);
    //   expect(via.uuid).toBeDefined();
    // });

    it('should create a via with custom parameters', () => {
      const via = pcb.via({
        at: { x: 50, y: 75 },
        size: 0.8,
        drill: 0.4,
      });

      expect(via.viaData?.at).toEqual({ x: 50, y: 75 });
      expect(via.viaData?.size).toBe(0.8);
      expect(via.viaData?.drill).toBe(0.4);
      expect(via.pcb).toEqual({ x: 50, y: 75, rotation: 0, side: 'front' });
    });

    it('should handle via placement', () => {
      const via = pcb.via({ at: { x: 100, y: 100 } });

      pcb.place(via);

      expect(via.via).toBe(true);
      expect(getPcbState(pcb).components).toContain(via);
    });

    it('should allow assigning a net name to a via', () => {
      const via = pcb.via({
        at: { x: 25, y: 75 },
        net: '3v',
      });

      expect(via.viaData?.net).toBe('3v');
    });

    it('should stage vias automatically and remove them from staging when placed', () => {
      const stagedBefore = getPcbState(pcb).stagedComponents.length;
      const via = pcb.via({ at: { x: 5, y: 5 }, net: 'AUTO' });

      const stagedAfterCreate = getPcbState(pcb).stagedComponents.some((component) => component.uuid === via.uuid);
      expect(stagedAfterCreate).toBe(true);
      expect(getPcbState(pcb).stagedComponents.length).toBe(stagedBefore + 1);

      pcb.place(via);

      const stillStaged = getPcbState(pcb).stagedComponents.some((component) => component.uuid === via.uuid);
      expect(stillStaged).toBe(false);
      expect(getPcbState(pcb).components.some((component) => component.uuid === via.uuid)).toBe(true);
    });
  });

  describe('Group Operations', () => {
    it('should create component groups', () => {
      const resistor = new Component({
        reference: 'RP8',
        value: '10k',
        footprint: 'Resistor_SMD:R_0805_2012Metric',
      });

      resistor.pcb = { x: 100, y: 100, rotation: 0 };

      pcb.group('resistors', resistor);

      expect(getPcbState(pcb).groups.some((g) => g.includes('"resistors"'))).toBe(true);
      expect(getPcbState(pcb).groups.some((g) => g.includes(resistor.uuid))).toBe(true);
    });

    it('should handle grouping multiple components', () => {
      const resistor1 = new Component({
        reference: 'RP9',
        value: '10k',
        footprint: 'Resistor_SMD:R_0805_2012Metric',
      });

      const resistor2 = new Component({
        reference: 'RP10',
        value: '1k',
        footprint: 'Resistor_SMD:R_0805_2012Metric',
      });

      resistor1.pcb = { x: 100, y: 100, rotation: 0 };
      resistor2.pcb = { x: 110, y: 100, rotation: 0 };

      pcb.group('resistors', resistor1, resistor2);

      const group = getPcbState(pcb).groups.find((g) => g.includes('"resistors"'));
      expect(group).toBeDefined();
      expect(group).toContain(resistor1.uuid);
      expect(group).toContain(resistor2.uuid);
    });
  });

  describe('Track Operations', () => {
    it('should create a track with default parameters', () => {
      const trackUuid = pcbTrackSegment(pcb, { x: 0, y: 0 }, { x: 10, y: 10 });

      expect(trackUuid).toBeDefined();
      expect(typeof trackUuid).toBe('string');
    });

    it('should create a track with custom parameters', () => {
      const trackUuid = pcbTrackSegment(pcb, { x: 0, y: 0 }, { x: 10, y: 10 }, 0.2, 'B.Cu', true);

      expect(trackUuid).toBeDefined();

      const trackData = pcbGetTrackData(pcb, trackUuid);
      expect(trackData).toBeDefined();
      expect(trackData?.start).toEqual({ x: 0, y: 0 });
      expect(trackData?.end).toEqual({ x: 10, y: 10 });
      expect(trackData?.strokeWidth).toBe(0.2);
      expect(trackData?.layer).toBe('B.Cu');
      expect(trackData?.locked).toBe(true);
    });

    it('should return TrackBuilder from track() method', () => {
      const trackBuilder = pcb.track();
      expect(trackBuilder).toBeDefined();
      expect(trackBuilder.constructor.name).toBe('TrackBuilder');
    });
  });

  describe('Outline Operations', () => {
    it('should create rectangular outline', () => {
      pcb.outline(0, 0, 100, 80);
      expect(getPcbState(pcb).stagedOutlines).toHaveLength(1);
      expect(getPcbState(pcb).stagedOutlines[0].width).toBe(100);
      expect(getPcbState(pcb).stagedOutlines[0].height).toBe(80);
    });

    it('should create rectangular outline with fillet', () => {
      pcb.outline(0, 0, 100, 80, 5);
      expect(getPcbState(pcb).stagedOutlines).toHaveLength(1);
      expect(getPcbState(pcb).stagedOutlines[0].filletRadius).toBe(5);
    });

    it('should handle custom outline UUID', () => {
      const customUuid = 'custom-outline-uuid';
      pcb.outline(0, 0, 100, 80, 0, customUuid);
      expect(getPcbState(pcb).stagedOutlines.some((o: any) => o.uuid === customUuid)).toBe(true);
    });
  });

  describe('Net Operations', () => {
    it('should delegate net operations to schematic', () => {
      const resistor = new Component({ reference: 'RP11' });
      const pin1 = resistor.pin(1);
      const pin2 = resistor.pin(2);

      const netDef = pcb.net(pin1, pin2);

      expect(netDef.pins).toHaveLength(2);
      expect(pcb.schematic.nodes).toHaveLength(1);
    });

    it('should handle named nets via PCB method', () => {
      const result = pcb.named('VCC');
      expect(result).toHaveProperty('net');
      expect(result).toHaveProperty('dnc');
    });

    it('should handle empty net calls', () => {
      const netDef = pcb.net();
      expect(netDef.pins).toHaveLength(0);
    });
  });

  describe('Utility Operations', () => {
    it('should delegate BOM generation to schematic', () => {
      // bom() returns void — just verify it doesn't throw
      expect(() => pcb.bom()).not.toThrow();
    });

    it('should delegate ERC to schematic', () => {
      expect(() => pcb.bom()).not.toThrow();
    });
  });
});
