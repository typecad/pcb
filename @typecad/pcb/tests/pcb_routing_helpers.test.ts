import { describe, it, expect } from 'vitest';
import { pinToIdentifier, pinsMatch, connectionMatches, validatePin } from '../src/pcb/pcb_routing_helpers.js';
import { Pin } from '../src/pin.js';
import { RoutingError } from '../src/utils/errors.js';

describe('pinToIdentifier', () => {
  it('should format as reference.number', () => {
    const pin = new Pin('U1', 5);
    expect(pinToIdentifier(pin)).toBe('U1.5');
  });

  it('should handle string pin numbers', () => {
    const pin = new Pin('U1', 'A1');
    expect(pinToIdentifier(pin)).toBe('U1.A1');
  });
});

describe('pinsMatch', () => {
  it('should match identical pins', () => {
    const p1 = new Pin('R1', 1);
    const p2 = new Pin('R1', 1);
    expect(pinsMatch(p1, p2)).toBe(true);
  });

  it('should not match different references', () => {
    const p1 = new Pin('R1', 1);
    const p2 = new Pin('R2', 1);
    expect(pinsMatch(p1, p2)).toBe(false);
  });

  it('should not match different pin numbers', () => {
    const p1 = new Pin('R1', 1);
    const p2 = new Pin('R1', 2);
    expect(pinsMatch(p1, p2)).toBe(false);
  });

  it('should match string equivalent numbers', () => {
    const p1 = new Pin('R1', '1');
    const p2 = new Pin('R1', 1);
    expect(pinsMatch(p1, p2)).toBe(true);
  });
});

describe('connectionMatches', () => {
  const p1 = new Pin('R1', 1);
  const p2 = new Pin('R2', 2);
  const p3 = new Pin('R3', 3);
  const p4 = new Pin('R4', 4);

  it('should match same-order connections', () => {
    expect(connectionMatches(p1, p2, p1, p2)).toBe(true);
  });

  it('should match reversed-order connections', () => {
    expect(connectionMatches(p1, p2, p2, p1)).toBe(true);
  });

  it('should not match different connections', () => {
    expect(connectionMatches(p1, p2, p3, p4)).toBe(false);
  });

  it('should not match partial connections', () => {
    expect(connectionMatches(p1, p2, p1, p3)).toBe(false);
  });
});

describe('validatePin', () => {
  it('should return true for valid pin', () => {
    const pin = new Pin('R1', 1);
    expect(validatePin(pin, 'test')).toBe(true);
  });

  it('should throw RoutingError for null', () => {
    expect(() => validatePin(null as any, 'test')).toThrow(RoutingError);
  });

  it('should throw RoutingError for undefined', () => {
    expect(() => validatePin(undefined as any, 'test')).toThrow(RoutingError);
  });

  it('should throw RoutingError for non-object', () => {
    expect(() => validatePin('not a pin' as any, 'test')).toThrow(RoutingError);
  });

  it('should include context in error message', () => {
    expect(() => validatePin(null as any, 'MyContext')).toThrow(/MyContext/);
  });
});
