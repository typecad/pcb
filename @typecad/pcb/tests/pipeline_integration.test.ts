import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Schematic } from '../src/schematic.js';
import { Component } from '../src/component.js';
import { Pin } from '../src/pin.js';
import { Power } from '../src/buses.js';

describe('Pipeline Integration', () => {
  const tmpDir = path.join(os.tmpdir(), `typecad-pipeline-test-${Date.now()}`);
  let originalCwd: string;

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    originalCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Schematic netlist generation', () => {
    it('should produce a valid .net file with components and nets', () => {
      const schematic = new Schematic('integration_test');

      // Create a simple voltage divider: R1 -- R2 in series, VCC at top, GND at bottom
      const r1 = new Component({
        reference: 'XRA1',
        value: '10k',
        footprint: 'Resistor_SMD:R_0603_1608Metric',
      });

      const r2 = new Component({
        reference: 'XRB1',
        value: '4.7k',
        footprint: 'Resistor_SMD:R_0603_1608Metric',
      });

      // Create pins
      const r1p1 = r1.pin(1);
      const r1p2 = r1.pin(2);
      const r2p1 = r2.pin(1);
      const r2p2 = r2.pin(2);

      // Wire up the nets
      schematic.named('VCC').net(r1p1);
      schematic.net(r1p2, r2p1); // unnamed net (midpoint)
      schematic.named('GND').net(r2p2);

      // Generate netlist
      schematic.create(r1, r2);

      // Read and verify the output
      const netPath = path.join(tmpDir, 'build', 'integration_test.net');
      expect(fs.existsSync(netPath)).toBe(true);

      const content = fs.readFileSync(netPath, 'utf8');

      // Verify S-expression structure
      expect(content).toContain('(export (version "E")');
      expect(content).toContain('(tool "typeCAD');
      expect(content).toContain(`(ref "${r1.reference}")`);
      expect(content).toContain(`(ref "${r2.reference}")`);
      expect(content).toContain(`(value "10k")`);
      expect(content).toContain(`(value "4.7k")`);
      expect(content).toContain('(footprint "Resistor_SMD:R_0603_1608Metric")');

      // Verify named nets appear in output
      expect(content).toContain('(name "VCC")');
      expect(content).toContain('(name "GND")');

      // Verify net connections reference correct components
      expect(content).toContain(`(node (ref "${r1.reference}") (pin "1")`);
      expect(content).toContain(`(node (ref "${r2.reference}") (pin "2")`);
    });

    it('should handle Power bus integration with netlist output', () => {
      const schematic = new Schematic('power_test');

      // Create a voltage regulator
      const reg = new Component({
        reference: 'XUA1',
        value: 'AMS1117-3.3',
        footprint: 'Package_TO_SOT_SMD:SOT-223-3_TabPin2',
      });

      // Create a load
      const mcu = new Component({
        reference: 'XUB1',
        value: 'ESP32',
        footprint: 'RF_Module:ESP32-WROOM-32',
      });

      // Power pins with voltage/current specs
      const regOut = new Pin(reg.reference, 2, 'power_out', reg, {
        maximum_voltage: 3.4,
        current: 1.0,
      });

      const mcuVcc = new Pin(mcu.reference, 1, 'power_in', mcu, {
        maximum_voltage: 3.6,
        current: 0.5,
      });

      // Connect via Power bus
      const power = new Power({ power: regOut, gnd: new Pin(reg.reference, 1, 'power_out', reg) });
      schematic.named('3V3').net(regOut, mcuVcc);

      // Generate netlist
      schematic.create(reg, mcu);

      const netPath = path.join(tmpDir, 'build', 'power_test.net');
      expect(fs.existsSync(netPath)).toBe(true);

      const content = fs.readFileSync(netPath, 'utf8');
      expect(content).toContain('(name "3V3")');
      expect(content).toContain(`(ref "${reg.reference}")`);
      expect(content).toContain(`(ref "${mcu.reference}")`);

      // Verify pin types are recorded
      expect(content).toContain('(pintype "power_out")');
      expect(content).toContain('(pintype "power_in")');
    });

    it('should include optional component fields when provided', () => {
      const schematic = new Schematic('fields_test');

      const comp = new Component({
        reference: 'XRC1',
        value: '100nF',
        footprint: 'Capacitor_SMD:C_0402_1005Metric',
        datasheet: 'https://example.com/datasheet.pdf',
        description: 'Ceramic capacitor',
        voltage: '25V',
        wattage: 'N/A',
        mpn: 'GRM155R71E104KA87D',
      });

      schematic.add(comp);
      schematic.create(comp);

      const netPath = path.join(tmpDir, 'build', 'fields_test.net');
      const content = fs.readFileSync(netPath, 'utf8');

      expect(content).toContain('(field (name "Datasheet") "https://example.com/datasheet.pdf")');
      expect(content).toContain('(field (name "Description") "Ceramic capacitor")');
      expect(content).toContain('(field (name "Voltage") "25V")');
      expect(content).toContain('(field (name "Wattage") "N/A")');
      expect(content).toContain('(field (name "MPN") "GRM155R71E104KA87D")');
    });

    it('should merge nets when a pin is connected to multiple nets', () => {
      const schematic = new Schematic('merge_test');

      const r1 = new Component({ reference: 'XRD1', value: '1k' });
      const r2 = new Component({ reference: 'XRE1', value: '2k' });
      const r3 = new Component({ reference: 'XRF1', value: '3k' });

      const r1p1 = r1.pin(1);
      const r2p1 = r2.pin(1);
      const r3p1 = r3.pin(1);

      // Connect r1p1 and r2p1 to a named net
      schematic.named('SHARED').net(r1p1, r2p1);

      // Also connect r2p1 and r3p1 to another net — r2p1 is shared, so nets should merge
      schematic.net(r2p1, r3p1);

      // The shared pin (r2p1) should cause the second net to merge with "SHARED"
      expect(schematic.merged_nets.length).toBeGreaterThan(0);

      schematic.create(r1, r2, r3);

      const netPath = path.join(tmpDir, 'build', 'merge_test.net');
      const content = fs.readFileSync(netPath, 'utf8');

      // All three pins should be on the same net
      expect(content).toContain('(name "SHARED")');
      expect(content).toContain(`(node (ref "${r1.reference}") (pin "1")`);
      expect(content).toContain(`(node (ref "${r3.reference}") (pin "1")`);
    });
  });
});
