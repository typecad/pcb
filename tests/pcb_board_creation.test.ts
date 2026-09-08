import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isComponentLike, isTrackBuilderLike } from '../src/pcb/pcb_board_creation.js';
import { Component } from '../src/component.js';
import { TrackBuilder } from '../src/pcb/pcb_track_builder.js';

const loggerMock = vi.hoisted(() => {
  const m = { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), log: vi.fn(), success: vi.fn() };
  return { default: m, ...m };
});
vi.mock('../src/utils/logging.js', () => loggerMock);

describe('isComponentLike', () => {
  it('returns true for real Component instance', () => {
    const comp = new Component({ footprint: 'Resistor_SMD:R_0603', reference: 'R1' });
    expect(isComponentLike(comp)).toBe(true);
  });

  it('returns true for duck-typed object matching Component shape', () => {
    const duckTyped = {
      footprint: 'Resistor_SMD:R_0603',
      pcb: { x: 0, y: 0 },
      dnp: false,
      via: false,
      pins: [],
    };
    expect(isComponentLike(duckTyped)).toBe(true);
  });

  it('returns true for duck-typed object even when instanceof fails (dual-package scenario)', () => {
    const fakePrototype = {};
    const duckTyped = Object.create(fakePrototype);
    duckTyped.footprint = 'Resistor_SMD:R_0603';
    duckTyped.pcb = { x: 0, y: 0 };
    duckTyped.dnp = false;
    duckTyped.via = false;
    duckTyped.pins = [];

    expect(duckTyped).not.toBeInstanceOf(Component);
    expect(isComponentLike(duckTyped)).toBe(true);
  });

  it('returns false for object missing footprint', () => {
    const obj = { pcb: { x: 0, y: 0 }, dnp: false, via: false, pins: [] };
    expect(isComponentLike(obj)).toBe(false);
  });

  it('returns false for object with non-string footprint', () => {
    const obj = { footprint: 42, pcb: { x: 0, y: 0 }, dnp: false, via: false, pins: [] };
    expect(isComponentLike(obj)).toBe(false);
  });

  it('returns false for object missing pcb', () => {
    const obj = { footprint: 'Lib:Fp', dnp: false, via: false, pins: [] };
    expect(isComponentLike(obj)).toBe(false);
  });

  it('returns false for object with null pcb', () => {
    const obj = { footprint: 'Lib:Fp', pcb: null, dnp: false, via: false, pins: [] };
    expect(isComponentLike(obj)).toBe(false);
  });

  it('returns false for object missing dnp', () => {
    const obj = { footprint: 'Lib:Fp', pcb: { x: 0, y: 0 }, via: false, pins: [] };
    expect(isComponentLike(obj)).toBe(false);
  });

  it('returns false for object missing via', () => {
    const obj = { footprint: 'Lib:Fp', pcb: { x: 0, y: 0 }, dnp: false, pins: [] };
    expect(isComponentLike(obj)).toBe(false);
  });

  it('returns false for object missing pins', () => {
    const obj = { footprint: 'Lib:Fp', pcb: { x: 0, y: 0 }, dnp: false, via: false };
    expect(isComponentLike(obj)).toBe(false);
  });

  it('returns false for object with non-array pins', () => {
    const obj = { footprint: 'Lib:Fp', pcb: { x: 0, y: 0 }, dnp: false, via: false, pins: {} };
    expect(isComponentLike(obj)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isComponentLike(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isComponentLike(undefined)).toBe(false);
  });

  it('returns false for string', () => {
    expect(isComponentLike('Component')).toBe(false);
  });

  it('returns false for number', () => {
    expect(isComponentLike(42)).toBe(false);
  });
});

describe('isTrackBuilderLike', () => {
  it('returns true for duck-typed object with from/to/route methods', () => {
    const duckTyped = {
      from: vi.fn(),
      to: vi.fn(),
      route: vi.fn(),
    };
    expect(isTrackBuilderLike(duckTyped)).toBe(true);
  });

  it('returns true for duck-typed object even when instanceof fails (dual-package scenario)', () => {
    const fakePrototype = {};
    const duckTyped = Object.create(fakePrototype);
    duckTyped.from = () => duckTyped;
    duckTyped.to = () => duckTyped;
    duckTyped.route = () => {};

    expect(duckTyped).not.toBeInstanceOf(TrackBuilder);
    expect(isTrackBuilderLike(duckTyped)).toBe(true);
  });

  it('returns false for object missing from', () => {
    const obj = { to: vi.fn(), route: vi.fn() };
    expect(isTrackBuilderLike(obj)).toBe(false);
  });

  it('returns false for object with non-function from', () => {
    const obj = { from: 'not-a-function', to: vi.fn(), route: vi.fn() };
    expect(isTrackBuilderLike(obj)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isTrackBuilderLike(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isTrackBuilderLike(undefined)).toBe(false);
  });
});
