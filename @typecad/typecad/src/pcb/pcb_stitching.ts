/**
 * Via stitching: a clearance-aware grid of vias tying a net across layers.
 *
 * Candidates are placed on a rectangular grid over the stitching region
 * (board outline inset by a margin, or an explicit area). Each candidate is
 * checked against the board's existing copper — built with the same
 * obstacle model the autorouter uses — and skipped when it would violate
 * clearance on any layer the stitch spans:
 *
 * - different-net copper → board clearance + the stitch via radius
 * - same-net pads/vias (holes) → hole-to-hole rule + the stitch via radius
 *   (drill-to-drill spacing applies regardless of net)
 * - same-net zones and tracks → no constraint; connecting through the pour
 *   is the entire point of stitching
 */

import type { PCB } from './pcb.js';
import { getPcbState } from './pcb.js';
import { ObstacleBuilder } from '../routing/shared/obstacle_builder.js';
import { parseAsList, Sym } from '../sexpr/index.js';
import { getFootprintBounds } from './footprint_bounds.js';
import type { SExpr } from '../sexpr/types.js';
import type { IRoutingObstacle } from '../routing/shared/routing_grid.js';
import type { PcbInternalState } from './pcb_state.js';

/** Options for `pcb.stitch()`. */
export interface IStitchOptions {
  /**
   * The layers the stitching vias span, top → bottom (default: every copper
   * layer, i.e. through vias). Must be declared copper layers.
   */
  layers?: string[];
  /** Grid spacing in mm. Default 1.5. */
  pitch?: number;
  /** Stitch via pad diameter in mm. Default: rules min_via_diameter. */
  size?: number;
  /** Stitch via drill in mm. Default: rules min_through_hole_diameter. */
  drill?: number;
  /** Restrict stitching to a region (default: the board outline); accepts bounds-style rectangles (e.g. `pcb.board`). */
  area?: import('./pcb_interfaces.js').IBoundsLike;
  /** Inset from the board edge in mm. Default 0.5. */
  margin?: number;
}

/** Distance from a point to an axis-aligned box (0 when inside). */
function distToBox(px: number, py: number, minX: number, minY: number, maxX: number, maxY: number): number {
  const dx = Math.max(minX - px, 0, px - maxX);
  const dy = Math.max(minY - py, 0, py - maxY);
  return Math.hypot(dx, dy);
}

/**
 * Eager validation for a stitch declaration: checks everything that does not
 * depend on board state that may not exist yet (outline, components).
 * @throws {RangeError} on an empty net, invalid pitch, or undeclared layers.
 */
export function validateStitchRequest(pcb: PCB, net: string, options: IStitchOptions = {}): void {
  if (!net) throw new RangeError('stitch() requires a net name');

  const pitch = options.pitch ?? 1.5;
  if (!Number.isFinite(pitch) || pitch <= 0) {
    throw new RangeError(`stitch() pitch must be positive, got ${pitch}`);
  }
  const boardLayers = pcb.copperLayers;
  const layers = options.layers ?? [boardLayers[0], boardLayers[boardLayers.length - 1]];
  const undeclared = layers.filter((l) => !boardLayers.includes(l));
  if (undeclared.length > 0) {
    throw new RangeError(
      `stitch() layer${undeclared.length === 1 ? '' : 's'} ${undeclared.map((l) => `"${l}"`).join(', ')} not declared ` +
        `on this board (declared: ${boardLayers.join(', ')})`,
    );
  }

  // Stitch vias sit pitch apart on a grid; a pitch below size + clearance
  // would violate clearance between neighboring stitches.
  const rules = pcb.rules;
  const size = options.size ?? rules.min_via_diameter;
  const pitchValue = options.pitch ?? 1.5;
  if (pitchValue < size + rules.min_clearance) {
    throw new RangeError(
      `stitch() pitch ${pitchValue}mm is too small for ${size}mm vias with ${rules.min_clearance}mm clearance ` +
        `(need at least ${(size + rules.min_clearance).toFixed(3)}mm)`,
    );
  }
}

/**
 * Materialize every declared stitch request, placing vias against the full
 * board contents. Called from createBoard, where all components are known —
 * including ones only passed to `create()` — so no `pcb.add()` is required
 * for stitching to see a part. Repeated create() calls replace previously
 * placed stitch vias instead of duplicating them.
 * @throws {RangeError} when a request has no derivable region (no outline
 *   and no explicit area) or its region is empty.
 */
export function materializeStitches(pcb: PCB): void {
  const state = getPcbState(pcb);
  for (const request of state.stitchRequests) {
    // Remove a previous create()'s vias so repeated creates don't accumulate.
    if (request.placedUuids.length > 0) {
      const old = new Set(request.placedUuids);
      state.stagedComponents = state.stagedComponents.filter((c) => !c.uuid || !old.has(c.uuid));
      state.components = state.components.filter((c) => !c.uuid || !old.has(c.uuid));
      request.placedUuids = [];
    }
    const before = new Set(request.placedUuids);
    placeStitchVias(pcb, request.net, request.options, request.placedUuids);
    // Placement happens after collectBoardComponents already merged
    // stagedComponents into components, so promote the new vias into
    // state.components for buildComponentMaps/renderVias.
    for (const c of getPcbState(pcb).stagedComponents) {
      if (c.via === true && c.uuid && request.placedUuids.includes(c.uuid) && !before.has(c.uuid)) {
        state.components.push(c);
      }
    }
  }
}

/** Placement core: runs the clearance-aware grid for one request. */
function placeStitchVias(pcb: PCB, net: string, options: IStitchOptions, placedUuids: string[]): void {
  const boardLayers = pcb.copperLayers;
  const layers = options.layers ?? [boardLayers[0], boardLayers[boardLayers.length - 1]];
  // The vias physically span every layer between the first and last entry.
  const firstIdx = Math.min(...layers.map((l) => boardLayers.indexOf(l)));
  const lastIdx = Math.max(...layers.map((l) => boardLayers.indexOf(l)));
  const spanLayers = boardLayers.slice(firstIdx, lastIdx + 1);

  const rules = pcb.rules;
  const size = options.size ?? rules.min_via_diameter;
  const drill = options.drill ?? rules.min_through_hole_diameter;
  const viaRadius = size / 2;

  // Region: explicit area, or the board outline inset by the margin.
  const state: PcbInternalState = getPcbState(pcb);
  let region = options.area
    ? 'left' in options.area && 'top' in options.area
      ? { x: options.area.left, y: options.area.top, width: options.area.width, height: options.area.height }
      : options.area
    : undefined;
  if (!region) {
    const bounds = state.getOutlineBounds();
    if (!bounds) {
      throw new RangeError('stitch() needs a board region: pass an `area` or call pcb.outline() first');
    }
    const margin = options.margin ?? 0.5;
    region = {
      x: bounds.minX + margin,
      y: bounds.minY + margin,
      width: bounds.maxX - bounds.minX - 2 * margin,
      height: bounds.maxY - bounds.minY - 2 * margin,
    };
  }
  if (region.width <= 0 || region.height <= 0) {
    throw new RangeError(`stitch() region must have positive area, got ${region.width}x${region.height}mm`);
  }

  // Existing copper obstacles come from the same model the router uses.
  // Components that are only net-registered or `pcb.add()`ed (not yet
  // placed/staged — e.g. everything before create()) are invisible to the
  // PCB state, so discover them from the schematic and include their pads.
  // Netless parts (mounting holes and other mechanical footprints) only
  // appear via schematic.components, never through net pins.
  const discovered = new Set<import('../component.js').Component>();
  for (const node of (pcb.schematic as { nodes?: Array<{ nodes?: Array<{ owner?: unknown }> }> }).nodes ?? []) {
    for (const p of (node.nodes ?? []) as Array<{ owner?: unknown }>) {
      if (p.owner) discovered.add(p.owner as import('../component.js').Component);
    }
  }
  for (const c of (pcb.schematic as { components?: unknown[] }).components ?? []) {
    if (c) discovered.add(c as import('../component.js').Component);
  }
  const obstacles: IRoutingObstacle[] = ObstacleBuilder.buildFromPCB(pcb, rules.min_clearance, Array.from(discovered));

  // Component bodies block stitches regardless of net — pads alone leave the
  // body middle open on parts without a center pad (SOICs, connectors) and
  // understate mechanical parts (a mounting hole's pad is drill-sized, while
  // its screw-head zone is the footprint's graphical extent). Prefer the
  // footprint's full bounds (pads + silk/courtyard geometry, rotation-aware);
  // fall back to the pad bounding box when the footprint file can't resolve.
  const bodyBlockers: Array<{ minX: number; minY: number; maxX: number; maxY: number }> = [];
  const seen = new Set<import('../component.js').Component>();
  const considerBody = (c: import('../component.js').Component) => {
    if (seen.has(c) || c.dnp || c.via) return;
    seen.add(c);
    const cx = c.pcb?.x ?? 0;
    const cy = c.pcb?.y ?? 0;
    const fpBounds = getFootprintBounds(c.footprint);
    if (fpBounds) {
      const hw = fpBounds.width / 2;
      const hh = fpBounds.height / 2;
      const rad = ((c.pcb?.rotation ?? 0) * Math.PI) / 180;
      // AABB of the rotated rectangle
      const ex = Math.abs(hw * Math.cos(rad)) + Math.abs(hh * Math.sin(rad));
      const ey = Math.abs(hw * Math.sin(rad)) + Math.abs(hh * Math.cos(rad));
      bodyBlockers.push({ minX: cx - ex, minY: cy - ey, maxX: cx + ex, maxY: cy + ey });
      return;
    }
    const body = ObstacleBuilder.buildFromComponent(c, rules.min_clearance);
    if (body) bodyBlockers.push(body.bounds);
  };
  getPcbState(pcb).components.forEach(considerBody);
  getPcbState(pcb).stagedComponents.forEach(considerBody);
  discovered.forEach(considerBody);

  // Text also blocks: a stitch via punched through silkscreen text makes it
  // unreadable. Silk lives on outer layers, so a box only blocks stitches
  // spanning that side.
  const textBlockers = collectTextBoxes(pcb, spanLayers, discovered);

  const placed = pcb.via.bind(pcb);

  const pitch = options.pitch ?? 1.5;
  const spanEnds = [spanLayers[0], spanLayers[spanLayers.length - 1]];

  for (let gx = 0; gx * pitch <= region.width; gx++) {
    for (let gy = 0; gy * pitch <= region.height; gy++) {
      const x = region.x + gx * pitch;
      const y = region.y + gy * pitch;

      let blocked = false;
      for (const b of bodyBlockers) {
        if (distToBox(x, y, b.minX, b.minY, b.maxX, b.maxY) < viaRadius + rules.min_clearance) {
          blocked = true;
          break;
        }
      }
      if (!blocked) {
        for (const t of textBlockers) {
          if (distToBox(x, y, t.minX, t.minY, t.maxX, t.maxY) < viaRadius) {
            blocked = true;
            break;
          }
        }
      }
      if (blocked) continue;

      for (const obs of obstacles) {
        // Only obstacles on a layer the stitch spans matter
        if (!obs.layers.some((l) => spanLayers.includes(l))) continue;
        // Outline obstacles cover the whole board as an inverted boundary;
        // the region + margin already keeps stitches off the board edge.
        if (obs.type === 'outline') continue;

        // Zone obstacles carry their net as the internal `net:NAME`
        // identifier — normalize both sides before comparing.
        const obsNet = obs.net !== undefined ? obs.net.replace(/^net:/, '') : undefined;
        const sameNet = obsNet === net;
        // holes: pads and vias (vias are modeled as pad obstacles)
        const isHole = obs.type === 'pad';
        if (sameNet && !isHole) continue; // same-net pours/tracks: connect freely

        // Required center-to-copper distance
        const required =
          viaRadius + (sameNet ? rules.min_hole_to_hole : Math.max(rules.min_clearance, obs.clearance ?? 0));
        const d = distToBox(x, y, obs.bounds.minX, obs.bounds.minY, obs.bounds.maxX, obs.bounds.maxY);
        if (d < required) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;

      const viaComponent = placed({ at: { x, y }, size, drill, net });
      // pcb.via() defaults to a through span; honor the requested span so
      // the emitted copper matches the layers collision-checked above.
      if (viaComponent.viaData) {
        viaComponent.viaData.layers = [...spanEnds];
      }
      if (viaComponent.uuid) placedUuids.push(viaComponent.uuid);
    }
  }
}

/**
 * Conservative glyph advance as a fraction of font size — wide faces like
 * OCR-A approach 1.0; over-blocking a stitch candidate is harmless.
 */
const GLYPH_ADVANCE = 0.95;
/** Descender allowance below the text baseline, as a fraction of the size. */
const DESCENDER = 0.25;

/**
 * Bounding boxes of board text that stitching must not punch through:
 * `pcb.text()` elements (absolute positions) and component text — explicit
 * layouts and text entries (footprint-relative, transformed like pads) as
 * well as the footprint's default Reference/Value positions (parsed from the
 * footprint). Only boxes on a side the stitch spans are returned.
 */
function collectTextBoxes(
  pcb: PCB,
  spanLayers: string[],
  discovered: Set<import('../component.js').Component>,
): Array<{ minX: number; minY: number; maxX: number; maxY: number }> {
  const state = getPcbState(pcb);
  const spansFront = spanLayers.includes('F.Cu');
  const spansBack = spanLayers.includes('B.Cu');

  const boxes: Array<{ minX: number; minY: number; maxX: number; maxY: number }> = [];

  const sideOf = (layer: string | undefined): 'F' | 'B' | undefined => {
    if (layer === undefined) return 'F';
    if (layer.startsWith('B.')) return 'B';
    if (layer.startsWith('F.')) return 'F';
    return undefined; // inner/user layers carry no silkscreen text
  };

  const pushBox = (
    origin: { x: number; y: number },
    rotationDeg: number,
    text: string,
    width: number,
    height: number,
    side: 'F' | 'B' | undefined,
  ) => {
    if (!text || side === undefined) return;
    if ((side === 'F' && !spansFront) || (side === 'B' && !spansBack)) return;
    const w = Math.max(text.length * width * GLYPH_ADVANCE, width);
    const h = height;
    // KiCad's default text justification is CENTER: the `at` point anchors
    // the middle of the text, not its corner (verified against a rendered
    // board). 0.75h half-extent covers caps + descenders conservatively.
    const hx = w / 2;
    const hy = h * 0.75;
    const corners = [
      { x: -hx, y: -hy },
      { x: hx, y: -hy },
      { x: hx, y: hy },
      { x: -hx, y: hy },
    ];
    const rad = (-rotationDeg * Math.PI) / 180; // KiCad rotates clockwise
    const pts = corners.map((c) => ({
      x: origin.x + c.x * Math.cos(rad) - c.y * Math.sin(rad),
      y: origin.y + c.x * Math.sin(rad) + c.y * Math.cos(rad),
    }));
    boxes.push({
      minX: Math.min(...pts.map((p) => p.x)),
      minY: Math.min(...pts.map((p) => p.y)),
      maxX: Math.max(...pts.map((p) => p.x)),
      maxY: Math.max(...pts.map((p) => p.y)),
    });
  };

  // 1. pcb.text() elements — absolute positions
  for (const t of state.grTexts) {
    const side = sideOf(t.layer ?? 'F.SilkS');
    pushBox({ x: t.x, y: t.y }, t.rotation ?? 0, t.text, t.width ?? 1.27, t.height ?? 1.27, side);
  }

  // 2. Component text — layouts/text entries are footprint-relative
  const transform = (c: import('../component.js').Component, px: number, py: number) => {
    const x = px;
    let y = py;
    if (c.pcb?.side === 'back') y = -y;
    const rad = (-(c.pcb?.rotation ?? 0) * Math.PI) / 180;
    const rx = x * Math.cos(rad) - y * Math.sin(rad);
    const ry = x * Math.sin(rad) + y * Math.cos(rad);
    return { x: (c.pcb?.x ?? 0) + rx, y: (c.pcb?.y ?? 0) + ry };
  };

  const seen = new Set<import('../component.js').Component>();
  const allComponents = [...state.components, ...state.stagedComponents, ...discovered];
  for (const c of allComponents) {
    if (seen.has(c) || c.dnp || c.via) continue;
    seen.add(c);
    const side = c.pcb?.side === 'back' ? 'B' : 'F';

    // Properties (Reference/Value) whose text is explicitly placed or
    // explicitly hidden — the footprint-default box must not be added for these.
    const explicitBoxProps = new Set<string>();

    const pushLayoutBox = (
      prop: 'Reference' | 'Value',
      layout:
        | {
            x?: number;
            y?: number;
            rotation?: number;
            layer?: string;
            width?: number;
            height?: number;
            fontSize?: number;
            show?: boolean;
          }
        | undefined,
      text: string,
      defaultLayer: string,
    ) => {
      if (!layout) return;
      if (layout.show === false) {
        // Hidden: nothing visible to avoid, and the default box must go too
        explicitBoxProps.add(prop);
        return;
      }
      if (layout.x === undefined || layout.y === undefined) return; // merge keeps the footprint's position → template box applies
      const fontSize = layout.height ?? layout.width ?? layout.fontSize ?? 1.0;
      const width = layout.width ?? layout.fontSize ?? fontSize;
      pushBox(
        transform(c, layout.x, layout.y),
        (layout.rotation ?? 0) + (c.pcb?.rotation ?? 0),
        text,
        width,
        fontSize,
        sideOf(layout.layer ?? (side === 'B' ? 'B.SilkS' : defaultLayer)),
      );
      explicitBoxProps.add(prop);
    };
    pushLayoutBox('Reference', c.referenceLayout, c.reference ?? '', 'F.SilkS');
    pushLayoutBox('Value', c.valueLayout, c.value ?? '', 'F.Fab');
    if (c.fabLayout) {
      const fab = c.fabLayout;
      if (fab.show !== false && fab.x !== undefined && fab.y !== undefined) {
        const fontSize = fab.height ?? fab.width ?? fab.fontSize ?? 1.0;
        const width = fab.width ?? fab.fontSize ?? fontSize;
        pushBox(
          transform(c, fab.x, fab.y),
          (fab.rotation ?? 0) + (c.pcb?.rotation ?? 0),
          (c.fabLayout as { text?: string }).text ?? c.reference ?? '',
          width,
          fontSize,
          sideOf(fab.layer ?? (side === 'B' ? 'B.SilkS' : 'F.Fab')),
        );
      }
    }

    // Explicit text entries (component.text)
    for (const item of (c.text ?? []) as Array<{
      property: string;
      text?: string;
      x?: number;
      y?: number;
      rotation?: number;
      layer?: string;
      width?: number;
      height?: number;
      fontSize?: number;
      show?: boolean;
    }>) {
      const isTemplateProp = item.property === 'Reference' || item.property === 'Value';
      if (item.show === false) {
        // Hidden: nothing to avoid, and a Reference/Value default box must not appear either
        if (isTemplateProp) explicitBoxProps.add(item.property);
        continue;
      }
      if (isTemplateProp && (item.x === undefined || item.y === undefined)) {
        // Merges onto the footprint's own position → the template-default box below covers it
        continue;
      }
      const fontSize = item.height ?? item.fontSize ?? 1.0;
      const width = item.width ?? item.fontSize ?? fontSize;
      const text =
        item.text ??
        (item.property === 'Reference' ? (c.reference ?? '') : item.property === 'Value' ? (c.value ?? '') : '');
      pushBox(
        transform(c, item.x ?? 0, item.y ?? 0),
        (item.rotation ?? 0) + (c.pcb?.rotation ?? 0),
        text,
        width,
        fontSize,
        sideOf(item.layer ?? (side === 'B' ? 'B.SilkS' : 'F.SilkS')),
      );
      if (isTemplateProp) explicitBoxProps.add(item.property);
    }

    // Default Reference/Value positions from the footprint itself
    try {
      const footprintSexpr = c.footprint_lib(c.footprint);
      const parsed = parseAsList(footprintSexpr);
      const collect = (node: SExpr) => {
        if (!Array.isArray(node)) return;
        const head = node[0];
        if (Sym.isSym(head) && head.name === 'property' && typeof node[1] === 'string') {
          const propName = node[1];
          if (propName !== 'Reference' && propName !== 'Value') return;
          // Explicitly placed or explicitly hidden above — no default box
          if (explicitBoxProps.has(propName)) return;
          const text = propName === 'Reference' ? (c.reference ?? '') : (c.value ?? '');
          let px = 0;
          let py = 0;
          let rotation = 0;
          let sizeH = 1;
          let sizeW = 1;
          let layer: string | undefined;
          for (const child of node) {
            if (!Array.isArray(child) || !Sym.isSym(child[0])) continue;
            const tag = child[0].name;
            if (tag === 'at') {
              px = parseFloat(String(child[1])) || 0;
              py = parseFloat(String(child[2])) || 0;
              rotation = child.length > 3 ? parseFloat(String(child[3])) || 0 : 0;
            } else if (tag === 'layer' && typeof child[1] === 'string') {
              layer = child[1];
            } else if (tag === 'effects' && Array.isArray(child[1])) {
              for (const eff of child) {
                if (Array.isArray(eff) && Sym.isSym(eff[0]) && eff[0].name === 'font') {
                  for (const f of eff) {
                    if (Array.isArray(f) && Sym.isSym(f[0]) && f[0].name === 'size') {
                      sizeH = parseFloat(String(f[1])) || 1;
                      sizeW = parseFloat(String(f[2])) || 1;
                    }
                  }
                }
              }
            }
          }
          const effectiveLayer = layer ?? (side === 'B' ? 'B.SilkS' : 'F.SilkS');
          pushBox(transform(c, px, py), rotation + (c.pcb?.rotation ?? 0), text, sizeW, sizeH, sideOf(effectiveLayer));
        }
        for (const child of node) {
          if (Array.isArray(child)) collect(child);
        }
      };
      collect(parsed);
    } catch {
      // Unparseable footprint: text position unknown, skip
    }
  }

  return boxes;
}
