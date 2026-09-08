import { describe, it, expect } from 'vitest';
import { resolveNet } from '../src/pcb/pcb_net_resolver.js';
import { Schematic } from '../src/schematic.js';
import { Pin } from '../src/pin.js';

describe('Net Resolver', () => {
  it('should return net 0 (unconnected) when no schematic is provided', () => {
    const result = resolveNet(undefined, 'R1', '1');
    expect(result.found).toBe(false);
    expect(result.netCode).toBe(0);
    expect(result.netName).toBe('');
  });

  it('should return net 0 when pin is not in any schematic net', () => {
    const sch = new Schematic('test');
    const result = resolveNet(sch, 'R1', '1');
    expect(result.found).toBe(false);
    expect(result.netCode).toBe(0);
    expect(result.netName).toBe('');
  });

  it('should resolve a pin in a schematic net', () => {
    const sch = new Schematic('test');
    const pin = new Pin('R1', '1');
    sch.named('VCC').net(pin);

    const result = resolveNet(sch, 'R1', '1');
    expect(result.found).toBe(true);
    expect(result.netCode).toBe(1);
    expect(result.netName).toBe('VCC');
    expect(result.schematicNetCode).toBe(1);
    expect(result.schematicNetName).toBe('VCC');
  });

  it('should resolve a different pin in the same net', () => {
    const sch = new Schematic('test');
    const pin1 = new Pin('R1', '1');
    const pin2 = new Pin('R2', '2');
    sch.named('SIGNAL').net(pin1, pin2);

    const result = resolveNet(sch, 'R2', '2');
    expect(result.found).toBe(true);
    expect(result.netCode).toBe(1);
    expect(result.netName).toBe('SIGNAL');
  });

  it('should only match the correct pin number', () => {
    const sch = new Schematic('test');
    const pin1 = new Pin('R1', '1');
    sch.named('NET').net(pin1);

    // Pin 2 of R1 is not in the net
    const result = resolveNet(sch, 'R1', '2');
    expect(result.found).toBe(false);
  });

  it('should use fallbackNetName when pin is not in schematic', () => {
    const result = resolveNet(undefined, 'U1', 'VCC', undefined, undefined, '+5V');
    expect(result.found).toBe(false);
    expect(result.netCode).toBe(0); // No board map, defaults to 0
    expect(result.netName).toBe(''); // No board map match
  });

  it('should resolve fallbackNetName in board map', () => {
    const boardMap = new Map<string, number>();
    boardMap.set('+5v', 42);

    const result = resolveNet(undefined, 'U1', 'VCC', undefined, boardMap, '+5V');
    expect(result.found).toBe(false);
    expect(result.netCode).toBe(42);
    expect(result.netName).toBe('+5V');
  });

  it('should resolve via by UUID', () => {
    const sch = new Schematic('test');
    const viaUuid = 'abc-123-via-uuid';
    const pin = new Pin('VIA', '1', 'passive', undefined, undefined);
    pin.uuid = viaUuid;
    sch.named('VIA_NET').net(pin);

    const result = resolveNet(sch, 'VIA', '1', viaUuid);
    expect(result.found).toBe(true);
    expect(result.netCode).toBe(1);
    expect(result.netName).toBe('VIA_NET');
  });

  it('should map schematic net code to board net code via lookup key', () => {
    const sch = new Schematic('test');
    const pin = new Pin('R1', '1');
    sch.named('GND').net(pin);

    // Board has GND mapped to code 99
    const boardMap = new Map<string, number>();
    boardMap.set('gnd', 99);

    const result = resolveNet(sch, 'R1', '1', undefined, boardMap);
    expect(result.found).toBe(true);
    // Board map overrides the net code
    expect(result.netCode).toBe(99);
    // But name stays from schematic
    expect(result.netName).toBe('GND');
  });

  it('should handle /GND style net names from board', () => {
    const sch = new Schematic('test');
    const pin = new Pin('R1', '1');
    sch.named('/GND').net(pin);

    const boardMap = new Map<string, number>();
    boardMap.set('gnd', 99);

    const result = resolveNet(sch, 'R1', '1', undefined, boardMap);
    expect(result.found).toBe(true);
    // Stripped / prefix for lookup
    expect(result.netCode).toBe(99);
    expect(result.netName).toBe('/GND');
  });

  it('should return unique codes for different nets', () => {
    const sch = new Schematic('test');
    const pin1 = new Pin('R1', '1');
    const pin2 = new Pin('R2', '1');
    const pin3 = new Pin('R3', '1');

    sch.named('NET_A').net(pin1);
    sch.named('NET_B').net(pin2);
    sch.named('NET_C').net(pin3);

    const resultA = resolveNet(sch, 'R1', '1');
    const resultB = resolveNet(sch, 'R2', '1');
    const resultC = resolveNet(sch, 'R3', '1');

    expect(resultA.netCode).toBe(1);
    expect(resultB.netCode).toBe(2);
    expect(resultC.netCode).toBe(3);
    expect(resultA.netName).toBe('NET_A');
    expect(resultB.netName).toBe('NET_B');
    expect(resultC.netName).toBe('NET_C');
  });

  it('should be case-insensitive for fallback net name lookup', () => {
    const boardMap = new Map<string, number>();
    boardMap.set('vcc', 10);

    const result = resolveNet(undefined, 'U1', '1', undefined, boardMap, 'VCC');
    expect(result.found).toBe(false);
    expect(result.netCode).toBe(10);
    expect(result.netName).toBe('VCC');
  });

  it('should preserve net code when board map lacks the entry', () => {
    const sch = new Schematic('test');
    const pin = new Pin('R1', '1');
    sch.named('UNMAPPED').net(pin);

    const boardMap = new Map<string, number>();
    boardMap.set('other_net', 999);

    const result = resolveNet(sch, 'R1', '1', undefined, boardMap);
    expect(result.found).toBe(true);
    // Schematic net code is preserved since board map doesn't contain this net
    expect(result.netCode).toBe(1);
    expect(result.netName).toBe('UNMAPPED');
  });
});
