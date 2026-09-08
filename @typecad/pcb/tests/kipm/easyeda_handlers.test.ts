import { describe, it, expect } from 'vitest';
import easyeda_handlers from '../../src/kipm/helpers/easyeda_handlers.js';
import { EeSymbol } from '../../src/kipm/easyeda/parametersEasyeda.js';

describe('easyeda_handlers', () => {
  it('has all expected handler keys', () => {
    const keys = Object.keys(easyeda_handlers);
    expect(keys).toContain('P');
    expect(keys).toContain('R');
    expect(keys).toContain('E');
    expect(keys).toContain('C');
    expect(keys).toContain('A');
    expect(keys).toContain('PL');
    expect(keys).toContain('PG');
    expect(keys).toContain('PT');
  });

  it('has 8 handlers', () => {
    expect(Object.keys(easyeda_handlers)).toHaveLength(8);
  });

  it('all handlers are functions', () => {
    for (const key of Object.keys(easyeda_handlers)) {
      expect(typeof easyeda_handlers[key]).toBe('function');
    }
  });
});

describe('R handler (rectangle)', () => {
  it('adds a rectangle to the symbol', () => {
    const sym = new EeSymbol({ info: { name: 'Test' }, bbox: { x: 0, y: 0 } });
    const rectData = '~10~20~30~40~#000~1~solid~';
    easyeda_handlers.R(rectData, sym);
    expect(sym.rectangles).toHaveLength(1);
    expect(sym.rectangles[0].pos_x).toBe('10');
  });
});

describe('C handler (circle)', () => {
  it('adds a circle to the symbol', () => {
    const sym = new EeSymbol({ info: {}, bbox: { x: 0, y: 0 } });
    const circleData = '~5~5~10~#000~1~~#ff0000~1~false';
    easyeda_handlers.C(circleData, sym);
    expect(sym.circles).toHaveLength(1);
    expect(sym.circles[0].center_x).toBe('5');
    expect(sym.circles[0].radius).toBe('10');
  });
});

describe('E handler (ellipse)', () => {
  it('adds an ellipse to the symbol', () => {
    const sym = new EeSymbol({ info: {}, bbox: { x: 0, y: 0 } });
    const ellipseData = '~5~5~3~4~#000~1~~none~1~false';
    easyeda_handlers.E(ellipseData, sym);
    expect(sym.ellipses).toHaveLength(1);
    expect(sym.ellipses[0].radius_x).toBe('3');
  });
});

describe('A handler (arc)', () => {
  it('adds an arc to the symbol', () => {
    const sym = new EeSymbol({ info: {}, bbox: { x: 0, y: 0 } });
    const arcData = '~M 0 0 A 5 5 0 0 1 10 0~~~#000~1~~none~1~false';
    easyeda_handlers.A(arcData, sym);
    expect(sym.arcs).toHaveLength(1);
  });
});

describe('PL handler (polyline)', () => {
  it('adds a polyline to the symbol', () => {
    const sym = new EeSymbol({ info: {}, bbox: { x: 0, y: 0 } });
    const polylineData = '~0 0 10 10 20 0~#000~1~~none~1~false';
    easyeda_handlers.PL(polylineData, sym);
    expect(sym.polylines).toHaveLength(1);
    expect(sym.polylines[0].points).toBe('0 0 10 10 20 0');
  });
});

describe('PG handler (polygon)', () => {
  it('adds a polygon to the symbol', () => {
    const sym = new EeSymbol({ info: {}, bbox: { x: 0, y: 0 } });
    const polygonData = '~0 0 10 10 20 0~#000~1~~none~1~false';
    easyeda_handlers.PG(polygonData, sym);
    expect(sym.polygons).toHaveLength(1);
  });
});

describe('PT handler (path)', () => {
  it('adds a path to the symbol', () => {
    const sym = new EeSymbol({ info: {}, bbox: { x: 0, y: 0 } });
    const pathData = '~M0 0L10 10~#000~1~~none~1~false';
    easyeda_handlers.PT(pathData, sym);
    expect(sym.paths).toHaveLength(1);
    expect(sym.paths[0].paths).toBe('M0 0L10 10');
  });
});

describe('P handler (pin)', () => {
  it('adds a pin to the symbol', () => {
    const sym = new EeSymbol({ info: {}, bbox: { x: 0, y: 0 } });
    const pinData = 'show~0~1~100~200~0~5~false^^0~0^^M0 0h10~#000^^show~0~0~0~VCC~start~sans~7^^^^show~0~0^^0~';
    easyeda_handlers.P(pinData, sym);
    expect(sym.pins).toHaveLength(1);
    expect(sym.pins[0].name.text).toBe('VCC');
  });
});
