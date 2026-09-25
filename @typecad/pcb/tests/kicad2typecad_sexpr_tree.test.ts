import { describe, it, expect } from 'vitest';
import { SExprNode } from '../src/kicad2typecad/sexpr_tree.js';

describe('SExprNode', () => {
  describe('parse', () => {
    it('should parse a simple list', () => {
      const node = SExprNode.parse('(test "hello" 42)');
      expect(node.name).toBe('test');
    });

    it('should throw for non-array root', () => {
      expect(() => SExprNode.parse('just-a-symbol')).toThrow();
    });
  });

  describe('name', () => {
    it('should return the first element as name', () => {
      const node = SExprNode.parse('(footprint "R_0603")');
      expect(node.name).toBe('footprint');
    });
  });

  describe('is', () => {
    it('should return true for matching name', () => {
      const node = SExprNode.parse('(pad "1")');
      expect(node.is('pad')).toBe(true);
    });

    it('should return false for non-matching name', () => {
      const node = SExprNode.parse('(pad "1")');
      expect(node.is('via')).toBe(false);
    });
  });

  describe('child', () => {
    it('should find a child by name', () => {
      const node = SExprNode.parse('(footprint (pad "1") (pad "2"))');
      const child = node.child('pad');
      expect(child).not.toBeNull();
      expect(child!.name).toBe('pad');
    });

    it('should return null when no child found', () => {
      const node = SExprNode.parse('(footprint "test")');
      expect(node.child('pad')).toBeNull();
    });
  });

  describe('children', () => {
    it('should return all children with given name', () => {
      const node = SExprNode.parse('(root (child "1") (child "2") (other "3"))');
      const children = node.children('child');
      expect(children).toHaveLength(2);
    });

    it('should return all children when no name given', () => {
      const node = SExprNode.parse('(root (a) (b) (c))');
      expect(node.children()).toHaveLength(3);
    });
  });

  describe('hasChild', () => {
    it('should return true when child exists', () => {
      const node = SExprNode.parse('(root (nested "value"))');
      expect(node.hasChild('nested')).toBe(true);
    });

    it('should return false when child does not exist', () => {
      const node = SExprNode.parse('(root "value")');
      expect(node.hasChild('nested')).toBe(false);
    });
  });

  describe('findAll', () => {
    it('should find nested nodes', () => {
      const node = SExprNode.parse('(root (a (target "1")) (b (target "2")))');
      const targets = node.findAll('target');
      expect(targets).toHaveLength(2);
    });
  });

  describe('getString', () => {
    it('should get string at index', () => {
      const node = SExprNode.parse('(pad "1" smd)');
      expect(node.getString(1)).toBe('1');
    });

    it('should return null for out-of-bounds index', () => {
      const node = SExprNode.parse('(pad "1")');
      expect(node.getString(5)).toBeNull();
    });
  });

  describe('getNumber', () => {
    it('should get number at index', () => {
      const node = SExprNode.parse('(at 10 20 90)');
      expect(node.getNumber(1)).toBe(10);
      expect(node.getNumber(2)).toBe(20);
      expect(node.getNumber(3)).toBe(90);
    });

    it('should return fallback for non-number', () => {
      const node = SExprNode.parse('(at "not-a-number")');
      expect(node.getNumber(1, 42)).toBe(42);
    });
  });

  describe('stringValue', () => {
    it('should return string value for string nodes', () => {
      const root = SExprNode.parse('(root (layer "F.Cu"))');
      const layer = root.child('layer');
      expect(layer!.stringValue).toBe('F.Cu');
    });
  });

  describe('toArray', () => {
    it('should return raw array', () => {
      const node = SExprNode.parse('(test 1 2 3)');
      const arr = node.toArray();
      expect(Array.isArray(arr)).toBe(true);
    });
  });

  describe('length', () => {
    it('should return the number of elements', () => {
      const node = SExprNode.parse('(test "a" "b" "c")');
      expect(node.length).toBe(4);
    });
  });
});
