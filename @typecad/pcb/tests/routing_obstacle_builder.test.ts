import { describe, it, expect } from 'vitest';
import { ObstacleBuilder } from '../src/routing/shared/obstacle_builder.js';
import type { IRoutingObstacle } from '../src/routing/shared/routing_grid.js';
import type { IFilledZone, IKeepoutZone, IGrLine, IOutline } from '../src/pcb/pcb_interfaces.js';

describe('ObstacleBuilder', () => {
  describe('buildFromZone', () => {
    it('should return null for zone without polygon', () => {
      const zone: IFilledZone = {
        polygon: [],
        layers: ['F.Cu'],
        net: 'VCC',
        clearance: 0.2,
        uuid: 'z1',
      };
      expect(ObstacleBuilder.buildFromZone(zone)).toBeNull();
    });

    it('should build obstacle from zone polygon', () => {
      const zone: IFilledZone = {
        polygon: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
          { x: 0, y: 10 },
        ],
        layers: ['F.Cu', 'B.Cu'],
        net: 'GND',
        clearance: 0.3,
        uuid: 'z2',
      };
      const obs = ObstacleBuilder.buildFromZone(zone);
      expect(obs).not.toBeNull();
      expect(obs!.type).toBe('zone');
      expect(obs!.bounds).toEqual({ minX: 0, maxX: 10, minY: 0, maxY: 10 });
      expect(obs!.layers).toEqual(['F.Cu', 'B.Cu']);
      expect(obs!.net).toBe('GND');
    });
  });

  describe('buildFromKeepoutZone', () => {
    it('should return null when tracks are allowed', () => {
      const zone: IKeepoutZone = {
        polygon: [
          { x: 0, y: 0 },
          { x: 10, y: 10 },
        ],
        layers: ['F.Cu'],
        uuid: 'k1',
        restrictions: { tracks: false },
      };
      expect(ObstacleBuilder.buildFromKeepoutZone(zone)).toBeNull();
    });

    it('should return null for zone without polygon', () => {
      const zone: IKeepoutZone = {
        polygon: [],
        layers: ['F.Cu'],
        uuid: 'k2',
        restrictions: { tracks: true },
      };
      expect(ObstacleBuilder.buildFromKeepoutZone(zone)).toBeNull();
    });

    it('should build keepout obstacle with high priority', () => {
      const zone: IKeepoutZone = {
        polygon: [
          { x: 5, y: 5 },
          { x: 15, y: 5 },
          { x: 15, y: 15 },
          { x: 5, y: 15 },
        ],
        layers: ['F.Cu'],
        uuid: 'k3',
        restrictions: { tracks: true, vias: true },
      };
      const obs = ObstacleBuilder.buildFromKeepoutZone(zone);
      expect(obs).not.toBeNull();
      expect(obs!.type).toBe('keepout');
      expect(obs!.priority).toBe(10);
      expect(obs!.clearance).toBe(0);
    });
  });

  describe('buildFromTrack', () => {
    it('should build obstacle from horizontal track', () => {
      const track: IGrLine = {
        start: { x: 0, y: 5 },
        end: { x: 10, y: 5 },
        strokeWidth: 0.2,
        layer: 'F.Cu',
        uuid: 't1',
      };
      const obs = ObstacleBuilder.buildFromTrack(track, 0.2, 0.2);
      expect(obs.type).toBe('track');
      expect(obs.bounds.minX).toBeCloseTo(0);
      expect(obs.bounds.maxX).toBeCloseTo(10);
      expect(obs.bounds.minY).toBeLessThan(5);
      expect(obs.bounds.maxY).toBeGreaterThan(5);
      expect(obs.segment).toBeDefined();
      expect(obs.segment!.width).toBe(0.2);
    });

    it('should build obstacle from vertical track', () => {
      const track: IGrLine = {
        start: { x: 5, y: 0 },
        end: { x: 5, y: 10 },
        strokeWidth: 0.25,
        layer: 'B.Cu',
        uuid: 't2',
      };
      const obs = ObstacleBuilder.buildFromTrack(track, 0.25, 0.2);
      expect(obs.type).toBe('track');
      expect(obs.layers).toEqual(['B.Cu']);
    });

    it('should handle degenerate point track', () => {
      const track: IGrLine = {
        start: { x: 5, y: 5 },
        end: { x: 5, y: 5 },
        strokeWidth: 0.2,
        layer: 'F.Cu',
        uuid: 't3',
      };
      const obs = ObstacleBuilder.buildFromTrack(track, 0.2, 0.2);
      expect(obs.type).toBe('track');
      expect(obs.bounds.minX).toBeCloseTo(4.9);
      expect(obs.bounds.maxX).toBeCloseTo(5.1);
    });

    it('should build obstacle from diagonal track', () => {
      const track: IGrLine = {
        start: { x: 0, y: 0 },
        end: { x: 10, y: 10 },
        strokeWidth: 0.5,
        layer: 'F.Cu',
        uuid: 't4',
      };
      const obs = ObstacleBuilder.buildFromTrack(track, 0.5, 0.2);
      expect(obs.type).toBe('track');
      expect(obs.bounds.minX).toBeLessThan(0);
      expect(obs.bounds.maxX).toBeGreaterThan(10);
    });

    it('should include net info', () => {
      const track: IGrLine = {
        start: { x: 0, y: 0 },
        end: { x: 10, y: 0 },
        strokeWidth: 0.2,
        layer: 'F.Cu',
        uuid: 't5',
        net: 'VCC',
      };
      const obs = ObstacleBuilder.buildFromTrack(track, 0.2, 0.2, 'VCC');
      expect(obs.net).toBe('VCC');
    });

    it('should mark manual routes', () => {
      const track: IGrLine = {
        start: { x: 0, y: 0 },
        end: { x: 10, y: 0 },
        strokeWidth: 0.2,
        layer: 'F.Cu',
        uuid: 't6',
      };
      const obs = ObstacleBuilder.buildFromTrack(track, 0.2, 0.2, undefined, true);
      expect(obs.isManualRoute).toBe(true);
    });
  });

  describe('buildFromOutline', () => {
    it('should build outline obstacle', () => {
      const outline: IOutline = {
        x: 0,
        y: 0,
        width: 100,
        height: 80,
        elements: [],
        uuid: 'o1',
      };
      const obs = ObstacleBuilder.buildFromOutline(outline, 0.5);
      expect(obs).not.toBeNull();
      expect(obs!.type).toBe('outline');
      expect(obs!.bounds).toEqual({ minX: 0, maxX: 100, minY: 0, maxY: 80 });
      expect(obs!.priority).toBe(10);
    });
  });
});
