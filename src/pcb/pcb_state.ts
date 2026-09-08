import { type Component } from '../component.js';
import type { SExpr } from '../sexpr/types.js';
import type {
  IPcbOptions,
  IGrLine,
  IGrCircle,
  IGrRect,
  IGrPoly,
  IOutline,
  IGrTextOptions,
  IFilledZone,
  IKeepoutZone,
} from './pcb_interfaces.js';

export class PcbInternalState {
  /**
   * Nets the autorouter has successfully staged tracks for. Rip-up-and-
   * reroute only touches these — a net the user routed manually (or not at
   * all) is never ripped without consent, and every ripped net is always
   * re-routed afterwards.
   */
  routerRoutedNets: Set<string> = new Set();
  offsetStack: { x: number; y: number }[] = [];
  currentOffset: { x: number; y: number } = { x: 0, y: 0 };
  pcb: string = '';
  components: Component[] = [];
  stagedComponents: Component[] = [];
  groups: string[] = [];
  outlines: IOutline[] = [];
  stagedOutlines: IOutline[] = [];
  readonly options: IPcbOptions;
  existingBoardElements: SExpr[] = [];
  grTexts: IGrTextOptions[] = [];
  zones: IFilledZone[] = [];
  keepoutZones: IKeepoutZone[] = [];
  /**
   * Declared plane layers (`pcb.plane(net, layer)`). Materialized into
   * board-covering zones at create() time, when the board outline extent is
   * known. Plane layers are excluded from default autorouting.
   */
  planes: Array<{ net: string; layer: string; zoneUuid?: string }> = [];
  /**
   * Declared stitch requests (`pcb.stitch()`). Materialized into vias at
   * create() time, when every component is visible; `placedUuids` tracks
   * the previous create()'s vias for replacement on re-create.
   */
  stitchRequests: Array<{ net: string; options: import('./pcb_stitching.js').IStitchOptions; placedUuids: string[] }> =
    [];
  /**
   * Set once createBoard has written the board. Autorouting after this point
   * can never reach the board file (staging state is consumed by the write),
   * so the routing API treats it as a usage error and throws instead of
   * silently returning a failed result.
   */
  boardWritten = false;
  grLines: IGrLine[] = [];
  grCircles: IGrCircle[] = [];
  grRects: IGrRect[] = [];
  grPolys: IGrPoly[] = [];

  constructor(options: IPcbOptions) {
    this.options = options;
  }

  pushOffset(x: number, y: number): void {
    this.offsetStack.push({ ...this.currentOffset });
    this.currentOffset.x += x;
    this.currentOffset.y += y;
  }

  popOffset(): void {
    const prev = this.offsetStack.pop();
    if (prev) {
      this.currentOffset = prev;
    } else {
      this.currentOffset = { x: 0, y: 0 };
    }
  }

  getOffset(): { x: number; y: number } {
    return { ...this.currentOffset };
  }

  /**
   * Computes the bounding box of all board outlines (line and arc elements)
   * across both `outlines` and `stagedOutlines`. Used by {@link board}
   * to determine the board's physical extent.
   *
   * @returns `{ minX, minY, maxX, maxY }` in mm, or `null` if no outlines exist.
   */
  getOutlineBounds(): { minX: number; minY: number; maxX: number; maxY: number } | null {
    const allOutlines = [...this.outlines, ...this.stagedOutlines];
    if (allOutlines.length === 0) return null;

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    for (const outline of allOutlines) {
      for (const el of outline.elements) {
        if (el.type === 'line') {
          minX = Math.min(minX, el.start.x, el.end.x);
          minY = Math.min(minY, el.start.y, el.end.y);
          maxX = Math.max(maxX, el.start.x, el.end.x);
          maxY = Math.max(maxY, el.start.y, el.end.y);
        } else if (el.type === 'arc') {
          minX = Math.min(minX, el.start.x, el.mid.x, el.end.x);
          minY = Math.min(minY, el.start.y, el.mid.y, el.end.y);
          maxX = Math.max(maxX, el.start.x, el.mid.x, el.end.x);
          maxY = Math.max(maxY, el.start.y, el.mid.y, el.end.y);
        } else if (el.type === 'circle') {
          const r = Math.hypot(el.end.x - el.center.x, el.end.y - el.center.y);
          minX = Math.min(minX, el.center.x - r);
          minY = Math.min(minY, el.center.y - r);
          maxX = Math.max(maxX, el.center.x + r);
          maxY = Math.max(maxY, el.center.y + r);
        } else if (el.type === 'rect') {
          minX = Math.min(minX, el.start.x, el.end.x);
          minY = Math.min(minY, el.start.y, el.end.y);
          maxX = Math.max(maxX, el.start.x, el.end.x);
          maxY = Math.max(maxY, el.start.y, el.end.y);
        } else if (el.type === 'poly') {
          for (const pt of el.points) {
            minX = Math.min(minX, pt.x);
            minY = Math.min(minY, pt.y);
            maxX = Math.max(maxX, pt.x);
            maxY = Math.max(maxY, pt.y);
          }
        }
      }
    }

    if (minX === Infinity) return null;

    return { minX, minY, maxX, maxY };
  }
}
