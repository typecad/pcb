import { describe, it, expect } from 'vitest';
import { mapLayerToSide, mirrorChamferDirection, transformSexprLayers } from '../src/pcb/pcb_layer_utils.js';
import { Sym } from '../src/sexpr/index.js';

describe('mapLayerToSide', () => {
  describe('Front to Back', () => {
    it('should map F.Cu to B.Cu', () => {
      expect(mapLayerToSide('F.Cu', 'back')).toBe('B.Cu');
    });

    it('should map F.SilkS to B.SilkS', () => {
      expect(mapLayerToSide('F.SilkS', 'back')).toBe('B.SilkS');
    });

    it('should map F.Mask to B.Mask', () => {
      expect(mapLayerToSide('F.Mask', 'back')).toBe('B.Mask');
    });

    it('should map F.Paste to B.Paste', () => {
      expect(mapLayerToSide('F.Paste', 'back')).toBe('B.Paste');
    });

    it('should map F.Fab to B.Fab', () => {
      expect(mapLayerToSide('F.Fab', 'back')).toBe('B.Fab');
    });

    it('should map F.CrtYd to B.CrtYd', () => {
      expect(mapLayerToSide('F.CrtYd', 'back')).toBe('B.CrtYd');
    });

    it('should map F.Adhes to B.Adhes', () => {
      expect(mapLayerToSide('F.Adhes', 'back')).toBe('B.Adhes');
    });

    it('should map Front.Cu to Back.Cu', () => {
      expect(mapLayerToSide('Front.Cu', 'back')).toBe('Back.Cu');
    });
  });

  describe('Back to Front', () => {
    it('should map B.Cu to F.Cu', () => {
      expect(mapLayerToSide('B.Cu', 'front')).toBe('F.Cu');
    });

    it('should map B.SilkS to F.SilkS', () => {
      expect(mapLayerToSide('B.SilkS', 'front')).toBe('F.SilkS');
    });

    it('should map Back.Cu to Front.Cu', () => {
      expect(mapLayerToSide('Back.Cu', 'front')).toBe('Front.Cu');
    });
  });

  describe('Non-paired layers', () => {
    it('should return Edge.Cuts unchanged', () => {
      expect(mapLayerToSide('Edge.Cuts', 'back')).toBe('Edge.Cuts');
    });

    it('should return Dwgs.User unchanged', () => {
      expect(mapLayerToSide('Dwgs.User', 'back')).toBe('Dwgs.User');
    });

    it('should return In1.Cu unchanged', () => {
      expect(mapLayerToSide('In1.Cu', 'back')).toBe('In1.Cu');
    });
  });

  describe('Edge cases', () => {
    it('should default to front when targetSide is undefined', () => {
      expect(mapLayerToSide('B.Cu', undefined)).toBe('F.Cu');
    });

    it('should return non-X.Y format unchanged', () => {
      expect(mapLayerToSide('just-a-name', 'back')).toBe('just-a-name');
    });
  });
});

describe('mirrorChamferDirection', () => {
  it('should swap top_left <-> bottom_left', () => {
    expect(mirrorChamferDirection('top_left')).toBe('bottom_left');
    expect(mirrorChamferDirection('bottom_left')).toBe('top_left');
  });

  it('should swap top_right <-> bottom_right', () => {
    expect(mirrorChamferDirection('top_right')).toBe('bottom_right');
    expect(mirrorChamferDirection('bottom_right')).toBe('top_right');
  });

  it('should return unknown direction unchanged', () => {
    expect(mirrorChamferDirection('diagonal')).toBe('diagonal');
  });

  it('should round-trip', () => {
    expect(mirrorChamferDirection(mirrorChamferDirection('top_left'))).toBe('top_left');
  });
});

describe('transformSexprLayers', () => {
  it('should transform (layer "...") nodes', () => {
    const sexpr = [Sym.for('layer'), 'F.Cu'];
    transformSexprLayers(sexpr, 'back');
    expect(sexpr[1]).toBe('B.Cu');
  });

  it('should transform nested layer references', () => {
    const sexpr = [
      Sym.for('footprint'),
      [Sym.for('layer'), 'F.Cu'],
      [Sym.for('fp_text'), 'R1', [Sym.for('layer'), 'F.SilkS']],
    ];
    transformSexprLayers(sexpr, 'back');
    expect((sexpr as any[])[1][1]).toBe('B.Cu');
    expect((sexpr as any[])[2][2][1]).toBe('B.SilkS');
  });

  it('should not modify non-array input', () => {
    const result = transformSexprLayers('string' as any, 'back');
    expect(result).toBe('string');
  });
});
