import { describe, it, expect, beforeEach, vi } from 'vitest'
import fs from 'node:fs'
import { PCB } from '../src/pcb/pcb.js'
import { Component } from '../src/component.js'
import { Pin } from '../src/pin.js'
// Import the router directly from source to avoid loading compiled dist/commonjs artifacts in the test runner
import { createBoard } from '../src/pcb/pcb_board_creation.js'


describe('Autoroute integration', () => {
  const buildDir = './build';
  const boardName = 'test_autoroute';

  beforeEach(() => {
    try { fs.rmSync(`${buildDir}/${boardName}.kicad_pcb`); } catch (e) { /* ignore */ }
    try { fs.mkdirSync(buildDir); } catch (e) { /* ignore */ }
  });

  it('routes a 3-pin net (MST) and writes segments to the board file', async () => {
    const pcb = new PCB(boardName);
    // Register the MAST router implementation

    // Create three simple components, each with one pin
    const c1 = new Component({ reference: 'U1' });
    c1.pins = [new Pin('U1', 1, 'passive', c1)];
    c1.pcb = { x: 10, y: 10 } as any;

    const c2 = new Component({ reference: 'U2' });
    c2.pins = [new Pin('U2', 1, 'passive', c2)];
    c2.pcb = { x: 30, y: 30 } as any;

    const c3 = new Component({ reference: 'J1' });
    c3.pins = [new Pin('J1', 1, 'passive', c3)];
    c3.pcb = { x: 50, y: 50 } as any;

    // Add and place components on the PCB
    pcb.add(c1, c2, c3);
    pcb.place(c1, c2, c3);

    // Define a named net connecting the three pins
    pcb.Schematic.named('VCC').net(c1.pins[0], c2.pins[0], c3.pins[0]);

    // Avoid invoking external KiCad CLI by mocking footprint_lib to return a tiny footprint with a single pad
    const simpleFootprint = '(footprint (pad "1" smd rect (at 0 0) (size 1 1) (layers "F.Cu")))';
    vi.spyOn(c1, 'footprint_lib').mockReturnValue(simpleFootprint as any);
    vi.spyOn(c2, 'footprint_lib').mockReturnValue(simpleFootprint as any);
    vi.spyOn(c3, 'footprint_lib').mockReturnValue(simpleFootprint as any);

    // Run routing (provide explicit from/to to invoke autoroute correctly)
    const result = await pcb.route({ from: c1.pins[0], to: [c2.pins[0], c3.pins[0]], net: 'VCC' });
    expect(result.success).toBe(true);

    // Ensure some staged outlines/tracks were created
    expect(pcb.stagedOutlines.length).toBeGreaterThan(0);

    // Create/write the board file
    await createBoard(pcb);

    // Validate the written board file contains segments and staged element UUIDs
    const contents = fs.readFileSync(`${buildDir}/${boardName}.kicad_pcb`, 'utf8');
    expect(contents.includes('(segment') || contents.includes('(gr_line')).toBeTruthy();

    // Check that at least one staged element UUID is present
    const stagedElementUuids = pcb.stagedOutlines.flatMap((o: any) => (o.elements ?? []).map((el: any) => el.uuid)).filter(Boolean);
    expect(stagedElementUuids.length).toBeGreaterThan(0);
    const foundAny = stagedElementUuids.some((u: string) => contents.includes(u));
    expect(foundAny).toBeTruthy();
  });
});
