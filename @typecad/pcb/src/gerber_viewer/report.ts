import { evaluateAperture } from './gerber/apertures.js';
import { computeLayerBounds, type RenderLayer } from './render/svg.js';
import type { DrillImage, GerberImage } from './gerber/types.js';

export interface CopperLayerStats {
  layer: string;
  /** total trace length in file units (arcs measured along the chord) */
  traceLength: number;
  minWidth: number | null;
  maxWidth: number | null;
  flashes: number;
}

export interface DrillStat {
  diameter: number;
  count: number;
  plated: boolean | null;
}

export interface FabReport {
  units: string;
  board: { width: number; height: number } | null;
  copper: CopperLayerStats[];
  drills: DrillStat[];
  holes: number;
  slots: number;
}

/** A DRC violation marker, already mapped into gerber coordinates. */
export interface DrcMarker {
  x: number;
  y: number;
  description: string;
}

interface KicadDrcItem {
  description?: string;
  pos?: { x?: number; y?: number };
}
interface KicadDrcReport {
  violations?: Array<{ description?: string; items?: KicadDrcItem[] }>;
  unconnected_items?: Array<{ description?: string; pos?: { x?: number; y?: number } }>;
}

/**
 * Convert a kicad-cli DRC report into gerber-space markers. DRC positions are
 * board coordinates (y down); gerbers are y up with a plot offset. The offset
 * is solved from the edge layer bounds vs the board file's outline bbox:
 * x_g = x_b + (edgeMinX - boardMinX), y_g = (edgeMinY + boardMaxY) - y_b.
 */
export function computeDrcMarkers(
  report: KicadDrcReport,
  edgeBounds: { minX: number; minY: number; maxX: number; maxY: number } | null,
  boardOutline: { minX: number; minY: number; maxX: number; maxY: number } | null,
): DrcMarker[] {
  const markers: DrcMarker[] = [];
  if (!edgeBounds || !boardOutline) return markers;
  const offX = edgeBounds.minX - boardOutline.minX;
  const offY = edgeBounds.minY + boardOutline.maxY;
  const map = (x: number, y: number, description: string): void => {
    markers.push({ x: x + offX, y: offY - y, description });
  };
  for (const violation of report.violations ?? []) {
    const what = violation.description ?? 'DRC violation';
    for (const item of violation.items ?? []) {
      if (typeof item.pos?.x === 'number' && typeof item.pos?.y === 'number') {
        map(item.pos.x, item.pos.y, item.description ? `${what} — ${item.description}` : what);
      }
    }
  }
  for (const item of report.unconnected_items ?? []) {
    if (typeof item.pos?.x === 'number' && typeof item.pos?.y === 'number') {
      map(item.pos.x, item.pos.y, item.description ?? 'unconnected item');
    }
  }
  return markers;
}

function traceWidth(
  aperture: number,
  img: GerberImage,
  cache: Map<number, ReturnType<typeof evaluateAperture>>,
): number {
  if (!cache.has(aperture)) {
    const def = img.apertures.get(aperture);
    cache.set(
      aperture,
      def
        ? evaluateAperture(def, img.macros)
        : { template: null, primitives: [], extent: { rx: 0, ry: 0 }, warnings: [] },
    );
  }
  const ap = cache.get(aperture)!;
  const t = ap.template;
  if (t?.kind === 'circle') return t.diameter;
  if (t?.kind === 'rect' && Math.abs(t.width - t.height) < 1e-9) return t.width;
  if (t?.kind === 'obround' && Math.abs(t.width - t.height) < 1e-9) return t.width;
  return 2 * Math.min(ap.extent.rx, ap.extent.ry);
}

/** Aggregate fab-relevant stats from the parsed layers (report panel data). */
export function computeFabReport(layers: RenderLayer[]): FabReport {
  const report: FabReport = {
    units: layers[0]?.image.units ?? 'mm',
    board: null,
    copper: [],
    drills: [],
    holes: 0,
    slots: 0,
  };

  for (const layer of layers) {
    if (layer.info.kind === 'edge') {
      const b = computeLayerBounds(layer);
      if (b) report.board = { width: b.maxX - b.minX, height: b.maxY - b.minY };
    }
    if (layer.info.kind === 'copper') {
      const img = layer.image as GerberImage;
      const cache = new Map<number, ReturnType<typeof evaluateAperture>>();
      let traceLength = 0;
      let minWidth: number | null = null;
      let maxWidth: number | null = null;
      let flashes = 0;
      for (const op of img.ops) {
        if (op.type === 'trace') {
          let px = op.from.x;
          let py = op.from.y;
          for (const seg of op.segments) {
            traceLength += Math.hypot(seg.to.x - px, seg.to.y - py);
            px = seg.to.x;
            py = seg.to.y;
          }
          const w = traceWidth(op.aperture, img, cache);
          minWidth = minWidth === null ? w : Math.min(minWidth, w);
          maxWidth = maxWidth === null ? w : Math.max(maxWidth, w);
        } else if (op.type === 'flash') {
          flashes++;
        }
      }
      report.copper.push({
        layer: layer.info.name,
        traceLength: Math.round(traceLength * 1000) / 1000,
        minWidth: minWidth === null ? null : Math.round(minWidth * 1000) / 1000,
        maxWidth: maxWidth === null ? null : Math.round(maxWidth * 1000) / 1000,
        flashes,
      });
    }
    if (layer.info.kind === 'drill') {
      const img = layer.image as DrillImage;
      const plated = layer.info.drillPlated;
      const counts = new Map<number, number>();
      for (const hole of img.holes) counts.set(hole.tool, (counts.get(hole.tool) ?? 0) + 1);
      for (const slot of img.slots) counts.set(slot.tool, (counts.get(slot.tool) ?? 0) + 1);
      for (const [tool, count] of counts) {
        const diameter = img.tools.get(tool)?.diameter ?? 0;
        report.drills.push({
          diameter: Math.round(diameter * 1000) / 1000,
          count,
          plated,
        });
      }
      report.holes += img.holes.length;
      report.slots += img.slots.length;
    }
  }
  report.drills.sort((a, b) => b.diameter - a.diameter);
  return report;
}
