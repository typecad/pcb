import { describe, it, expect, beforeEach } from 'vitest';
import { NetManager } from '../src/net_manager.js';
import { Pin } from '../src/pin.js';

describe('NetManager', () => {
  let nm: NetManager;

  function pin(ref: string, num: number | string): Pin {
    return new Pin(ref, num);
  }

  beforeEach(() => {
    nm = new NetManager('net');
  });

  describe('addNet - auto-naming', () => {
    it('should auto-name nets with prefix + counter', () => {
      const def = nm.addNet([pin('R1', 1)]);
      expect(def.name).toBe('net1');
      expect(def.code).toBe(1);
    });

    it('should increment code counter for each net', () => {
      nm.addNet([pin('R1', 1)]);
      const def2 = nm.addNet([pin('R2', 1)]);
      expect(def2.name).toBe('net2');
      expect(def2.code).toBe(2);
    });

    it('should track all pins in the net definition', () => {
      const p1 = pin('R1', 1);
      const p2 = pin('R1', 2);
      const def = nm.addNet([p1, p2]);
      expect(def.pins).toHaveLength(2);
      expect(def.connections).toHaveLength(2);
      expect(def.connections[0]).toEqual({ reference: 'R1', pin: '1', type: 'passive' });
      expect(def.connections[1]).toEqual({ reference: 'R1', pin: '2', type: 'passive' });
    });
  });

  describe('addNet - named nets', () => {
    it('should use chained name when set', () => {
      nm.setChainedName('VCC');
      const def = nm.addNet([pin('R1', 1)]);
      expect(def.name).toBe('VCC');
    });

    it('should reset chained name after use', () => {
      nm.setChainedName('VCC');
      nm.addNet([pin('R1', 1)]);
      const def2 = nm.addNet([pin('R2', 1)]);
      expect(def2.name).toBe('net2');
    });
  });

  describe('net merging', () => {
    it('should merge nets when a pin already belongs to a named net', () => {
      nm.setChainedName('VCC');
      nm.addNet([pin('R1', 1)]);

      nm.setChainedName('net');
      const def2 = nm.addNet([pin('R1', 1), pin('R2', 1)]);

      expect(nm.nodes).toHaveLength(1);
      expect(nm.nodes[0].name).toBe('VCC');
      expect(def2.name).toBe('VCC');
    });

    it('should preserve the named net when merging named + auto', () => {
      nm.setChainedName('GND');
      nm.addNet([pin('R1', 2)]);

      const def2 = nm.addNet([pin('R2', 2), pin('R1', 2)]);
      expect(def2.name).toBe('GND');
    });

    it('should record merged_nets entries', () => {
      nm.addNet([pin('R1', 1)]);
      nm.addNet([pin('R1', 1), pin('R2', 1)]);

      expect(nm.merged_nets.length).toBeGreaterThan(0);
    });
  });

  describe('deduplication', () => {
    it('should deduplicate pins within the same net', () => {
      const p1 = pin('R1', 1);
      const def = nm.addNet([p1, p1]);
      const node = nm.nodes.find((n) => n.name === def.name);
      expect(node!.nodes.filter((p) => p.reference === 'R1' && p.number === '1')).toHaveLength(1);
    });

    it('should deduplicate pins when merging nets', () => {
      nm.addNet([pin('R1', 1)]);
      nm.addNet([pin('R1', 1), pin('R2', 1)]);
      const node = nm.nodes[0];
      const r1Pins = node.nodes.filter((p) => p.reference === 'R1' && p.number === '1');
      expect(r1Pins).toHaveLength(1);
    });
  });

  describe('validation', () => {
    it('should throw for invalid pin objects', () => {
      expect(() => nm.addNet([null as any])).toThrow(/Invalid object/);
    });

    it('should throw for non-Pin objects', () => {
      expect(() => nm.addNet([42 as any])).toThrow(/Invalid object/);
    });
  });

  describe('custom prefix', () => {
    it('should use custom net prefix', () => {
      const custom = new NetManager('n');
      const def = custom.addNet([pin('R1', 1)]);
      expect(def.name).toBe('n1');
    });
  });

  describe('renderNets', () => {
    it('should return an S-expression string for nets', () => {
      nm.addNet([pin('R1', 1)]);
      const rendered = nm.renderNets();
      expect(rendered).toContain('(net');
      expect(rendered).toContain('"net1"');
      expect(rendered).toContain('"R1"');
    });
  });

  describe('pin type in connections', () => {
    it('should reflect pin type in connection info', () => {
      const p = pin('U1', 5);
      p.type = 'power_in';
      const def = nm.addNet([p]);
      expect(def.connections[0].type).toBe('power_in');
    });

    it('should default to passive for unset pin type', () => {
      const def = nm.addNet([pin('R1', 1)]);
      expect(def.connections[0].type).toBe('passive');
    });
  });
});
