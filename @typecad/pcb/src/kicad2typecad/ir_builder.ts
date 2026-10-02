import { SExprNode } from './sexpr_tree.js';
import { Sym } from '../sexpr/index.js';
import { decodeCodeMetadata } from './codec.js';
import type {
  KicadIR,
  KicadFootprintIR,
  KicadSegmentIR,
  KicadTextIR,
  KicadViaIR,
  KicadNetIR,
  KicadOutlineIR,
  KicadStackupIR,
  KicadStackupLayerIR,
  KicadZoneIR,
  ReferencePropertyIR,
  CodeMetadata,
  LegacyCodeMetadata,
  TextLayoutIR,
  FabLayoutIR,
  UnsupportedElementIR,
  KicadBoardGraphicIR,
} from './types.js';

function getSymName(item: unknown): string {
  if (Sym.isSym(item)) return item.name;
  if (typeof item === 'string') return item.replace(/[`"]/g, '');
  return '';
}

/** `(fill yes)` on a graphic item, else undefined. */
function parseFillFlag(node: SExprNode | null): boolean | undefined {
  if (!node) return undefined;
  if (node.getString(1) === 'yes' || node.stringValue === 'yes') return true;
  if (node.getString(1) === 'no' || node.stringValue === 'no') return false;
  return undefined;
}

/** Whether the node carries a bare atom child like zone-level `locked`. */
function hasBareAtom(node: SExprNode, name: string): boolean {
  for (let i = 1; i < node.length; i++) {
    if (getSymName(node.rawAt(i)) === name) return true;
  }
  return false;
}

/**
 * Whether a text node is hidden. KiCad writes both a bare `hide` atom
 * (older boards) and a `(hide yes)` list child (KiCad 7+).
 */
function isHidden(node: SExprNode): boolean {
  if (hasBareAtom(node, 'hide')) return true;
  return node.child('hide')?.stringValue === 'yes';
}

/** A parsed `(net ...)` reference: number, name, or both. */
interface NetRef {
  number?: number;
  name?: string;
}

/**
 * Parse the `(net ...)` child forms a segment/via/zone can carry:
 * `(net 5 "GND")` (net table era), `(net "GND")` (kicad-cli resave),
 * `(net 5)` (bare code), `(net 0 "")` (unconnected).
 */
function parseNetRef(node: SExprNode | null): NetRef | null {
  if (!node) return null;
  if (node.rawAt(2) !== undefined) {
    const number = node.getNumber(1, NaN);
    if (!Number.isFinite(number)) return null;
    return { number, name: node.getString(2) || undefined };
  }
  const firstRaw = node.rawAt(1);
  if (typeof firstRaw === 'number') return { number: firstRaw };
  const first = node.getString(1) ?? '';
  if (/^-?\d+$/.test(first)) return { number: parseInt(first, 10) };
  if (first !== '') return { name: first };
  return null;
}

/**
 * Tessellate a KiCad `(arc (start x y) (mid x y) (end x y))` into a polyline
 * through the circumcircle of the three points, so arc-backed zone outlines
 * survive import as polygon points.
 */
function tessellateArc(
  start: { x: number; y: number },
  mid: { x: number; y: number },
  end: { x: number; y: number },
  stepDeg = 12,
): Array<{ x: number; y: number }> {
  const d = 2 * (start.x * (mid.y - end.y) + mid.x * (end.y - start.y) + end.x * (start.y - mid.y));
  // Collinear points: fall back to a straight segment.
  if (Math.abs(d) < 1e-12) return [start, end];
  const ux =
    ((start.x ** 2 + start.y ** 2) * (mid.y - end.y) +
      (mid.x ** 2 + mid.y ** 2) * (end.y - start.y) +
      (end.x ** 2 + end.y ** 2) * (start.y - mid.y)) /
    d;
  const uy =
    ((start.x ** 2 + start.y ** 2) * (end.x - mid.x) +
      (mid.x ** 2 + mid.y ** 2) * (start.x - end.x) +
      (end.x ** 2 + end.y ** 2) * (mid.x - start.x)) /
    d;
  const r = Math.hypot(start.x - ux, start.y - uy);
  const a0 = Math.atan2(start.y - uy, start.x - ux);
  const am = Math.atan2(mid.y - uy, mid.x - ux);
  const a1 = Math.atan2(end.y - uy, end.x - ux);

  // Sweep from start to end passing through mid (clockwise or not).
  const ccwFromStart = (am - a0 + Math.PI * 2) % (Math.PI * 2) < Math.PI;
  const ccwToEnd = (a1 - a0 + Math.PI * 2) % (Math.PI * 2) < Math.PI;
  let sweep = a1 - a0;
  if (ccwFromStart !== ccwToEnd) sweep += sweep > 0 ? -Math.PI * 2 : Math.PI * 2;

  const steps = Math.max(2, Math.ceil(Math.abs(sweep) / ((stepDeg * Math.PI) / 180)));
  const points: Array<{ x: number; y: number }> = [];
  for (let i = 1; i <= steps; i++) {
    const a = a0 + (sweep * i) / steps;
    points.push({ x: ux + r * Math.cos(a), y: uy + r * Math.sin(a) });
  }
  return points;
}

/** Round to the KiCad file precision (nm) so tessellated points stay clean. */
function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/**
 * Expand KiCad zone-layer wildcards to explicit layer names:
 * `*.Cu` → every copper layer (count from the stackup, default 2),
 * `F&B.Cu` → `['F.Cu', 'B.Cu']`. Plain tokens pass through untouched.
 */
function expandLayerTokens(layers: string[], copperCount: number): string[] {
  const expanded: string[] = [];
  for (const token of layers) {
    if (token === '*.Cu') {
      const names = ['F.Cu'];
      for (let i = 1; i <= Math.max(0, copperCount - 2); i++) names.push(`In${i}.Cu`);
      if (copperCount >= 2) names.push('B.Cu');
      for (const name of names) if (!expanded.includes(name)) expanded.push(name);
    } else if (/^[FB]&B?\.Cu$/.test(token)) {
      for (const name of token.split('&')) if (!expanded.includes(name)) expanded.push(name);
    } else if (!expanded.includes(token)) {
      expanded.push(token);
    }
  }
  return expanded;
}

/**
 * Builds a typed KicadIR from a parsed S-expression tree.
 * Replaces the monolithic parsing functions in cli.ts with
 * SExprNode-based key access instead of raw array indexing.
 */
export class KicadIRBuilder {
  build(tree: SExprNode): KicadIR {
    const nets = this.parseNets(tree);
    const stackup = this.parseStackup(tree);
    const zones = this.parseZones(tree, nets);

    // Wildcard layer tokens (`*.Cu`, `F&B.Cu`) only make sense against the
    // board's actual copper count; expand them once the stackup is known.
    const copperCount = stackup?.copperLayerCount ?? 2;
    for (const zone of zones) zone.layers = expandLayerTokens(zone.layers, copperCount);

    return {
      version: tree.child('version')?.stringValue || '0',
      generator: tree.child('generator')?.stringValue || '',
      footprints: this.parseFootprints(tree),
      textElements: this.parseTextElements(tree),
      segments: this.parseSegments(tree),
      vias: this.parseVias(tree),
      outlines: this.parseOutlines(tree),
      nets,
      stackup,
      zones,
      boardGraphics: this.parseBoardGraphics(tree),
      unsupported: this.countUnsupported(tree),
    };
  }

  /**
   * Count top-level board elements the importer does not consume, plus
   * zones embedded inside footprints (only direct board children are read).
   * Groups are intentional: their members are top-level siblings and are
   * imported individually, so a group is a flatten, not a loss.
   */
  private countUnsupported(tree: SExprNode): UnsupportedElementIR[] {
    const unsupported: UnsupportedElementIR[] = [];
    const push = (type: string, count: number, reason: string) => {
      if (count > 0) unsupported.push({ type, count, reason });
    };

    let footprintZoneCount = 0;
    let footprintGraphicCount = 0;
    let footprintUserTextCount = 0;
    const FP_GRAPHIC = ['fp_line', 'fp_rect', 'fp_circle', 'fp_arc', 'fp_poly', 'fp_curve', 'fp_text_box'];
    for (const fp of tree.children('footprint')) {
      footprintZoneCount += fp.children('zone').length;
      for (const child of fp.children()) {
        if (FP_GRAPHIC.includes(child.name)) footprintGraphicCount++;
      }
      // fp_text user annotations beyond reference/value (those two plus the
      // ${REFERENCE} fab text become the layout properties)
      for (const ft of fp.children('fp_text')) {
        const kind = ft.getString(1)?.toLowerCase();
        if (kind !== 'reference' && kind !== 'value') footprintUserTextCount++;
      }
    }

    // Blind/buried vias: an explicit type token, or a layer span that is not
    // the full F.Cu–B.Cu through span.
    // Footprints dropped for non-finite coordinates (nan/1e400) — corrupt or
    // hand-edited boards. parseFootprint returns null for them.
    let invalidFootprints = 0;
    for (const fp of tree.children('footprint')) {
      const atNode = fp.child('at');
      if (atNode && ![1, 2].every((i) => Number.isFinite(atNode.getNumber(i, NaN)))) invalidFootprints++;
    }

    let blindBuriedVias = 0;
    for (const via of tree.children('via')) {
      const typeToken = via.getString(1);
      const isTyped = typeToken === 'blind' || typeToken === 'micro';
      const layersNode = via.child('layers');
      let span = '';
      if (layersNode) {
        const names: string[] = [];
        for (let i = 1; i < layersNode.length; i++) names.push(layersNode.getString(i) ?? '');
        span = names.sort().join('|');
      }
      if (isTyped || (layersNode && span !== '' && span !== 'B.Cu|F.Cu')) blindBuriedVias++;
    }

    push(
      'invalid footprint',
      invalidFootprints,
      'footprints with non-finite coordinates (nan/Infinity) were dropped rather than applied',
    );
    push('dimension', tree.children('dimension').length, 'dimensions are not imported');
    push(
      'bezier',
      tree.children('bezier').length + tree.children('gr_curve').length,
      'bezier curves are not imported (Edge.Cuts beziers are dropped)',
    );
    push(
      'board graphic',
      tree.children('image').length + tree.children('gr_bbox').length + tree.children('gr_text_box').length,
      'images, bounding boxes and text boxes are not imported',
    );
    push('title block', tree.children('title_block').length, 'title block metadata is not imported');
    push('board property', tree.children('property').length, 'board-level properties are not imported');
    push('embedded fonts', tree.children('embedded_fonts').length, 'embedded font declarations are not imported');
    push('footprint-embedded zone', footprintZoneCount, 'zones inside footprints are not imported');
    push(
      'footprint graphic',
      footprintGraphicCount,
      'per-footprint graphic edits (custom silk drawn in the board editor) are not imported',
    );
    push(
      'footprint user text',
      footprintUserTextCount,
      'footprint user text annotations are not imported (reference/value layouts are)',
    );
    push(
      'blind/buried via',
      blindBuriedVias,
      'vias with a limited layer span are imported as through vias (the standalone via API cannot express spans)',
    );
    return unsupported;
  }

  // === Footprints ===

  private parseFootprints(tree: SExprNode): KicadFootprintIR[] {
    const rawFootprints = tree.findAll('footprint');
    return rawFootprints.map((fp) => this.parseFootprint(fp)).filter((f): f is KicadFootprintIR => f !== null);
  }

  private parseFootprint(node: SExprNode): KicadFootprintIR | null {
    // Extract footprint name from the second element
    const footprintName = node.getString(1);
    if (!footprintName) return null;

    // Position. Validate the RAW x/y tokens: getNumber's fallback silently
    // maps `nan` to 0 (which would move a real part to the board origin on
    // apply) and `1e400` parses to Infinity (a valid JS number that poisons
    // the round-trip). Non-finite coordinates mean a corrupt or hand-edited
    // board — drop the footprint instead of guessing.
    const atNode = node.child('at');
    // getNumber(i, NaN) funnels every hostile form into a non-finite: a bare
    // `nan` token (parsed as a symbol), an unparseable string, NaN, or
    // Infinity from `1e400`.
    if (atNode && ![1, 2].every((i) => Number.isFinite(atNode.getNumber(i, NaN)))) return null;
    const x = atNode?.getNumber(1) ?? 0;
    const y = atNode?.getNumber(2) ?? 0;
    const rotation = atNode?.getNumber(3, 0) ?? 0;

    // Side
    const layerNode = node.child('layer');
    const layer = layerNode?.stringValue || 'F.Cu';
    const side: 'front' | 'back' = layer.startsWith('B.') ? 'back' : 'front';

    // Reference property
    const refPropNode = node.children('property').find((p) => {
      const name = p.getString(1);
      return name === 'Reference';
    });
    const reference = refPropNode?.getString(2) || '?';
    const referenceProperty = refPropNode ? this.extractPropertyPositioning(refPropNode) : null;

    // Code property (for metadata: uuid, variable name, etc.)
    const codePropNode = node.children('property').find((p) => {
      const name = p.getString(1);
      return name === 'Code';
    });
    const codeValue = codePropNode?.getString(2);
    const codeMetadata = codeValue ? decodeCodeMetadata(codeValue) : null;

    // Extract UUID from the footprint's uuid child node
    let uuid = '';
    const uuidNode = node.child('uuid');
    if (uuidNode) {
      uuid = uuidNode.stringValue || '';
    }
    // If no uuid child, try to get from codeMetadata
    if (!uuid && codeMetadata) {
      uuid = (codeMetadata as CodeMetadata).u || '';
    }
    if (!uuid) {
      // Fallback: generate a deterministic pseudo-uuid from footprint name + reference
      uuid = `${footprintName}:${reference}`;
    }

    // Value property (may exist on some footprints)
    const valuePropNode = node.children('property').find((p) => {
      const name = p.getString(1);
      return name === 'Value';
    });
    const valueProperty = valuePropNode ? this.extractPropertyPositioning(valuePropNode) : null;

    let referenceLayout: TextLayoutIR | undefined;
    let valueLayout: TextLayoutIR | undefined;
    let fabLayout: FabLayoutIR | undefined;

    const fpTextNodes = node.children('fp_text');
    for (const ft of fpTextNodes) {
      const textType = ft.getString(1)?.toLowerCase();
      if (textType === 'reference') {
        referenceLayout = this.extractFpTextLayout(ft) ?? undefined;
      } else if (textType === 'value') {
        valueLayout = this.extractFpTextLayout(ft) ?? undefined;
      } else if (textType === 'user') {
        const textContent = ft.getString(2);
        if (textContent === '${REFERENCE}') {
          const layout = this.extractFpTextLayout(ft);
          if (layout) fabLayout = { ...layout, text: textContent };
        }
      }
    }

    if (!referenceLayout && refPropNode) {
      const propLayout = this.propertyToTextLayout(refPropNode);
      if (propLayout) referenceLayout = propLayout;
    }
    if (!valueLayout && valuePropNode) {
      const propLayout = this.propertyToTextLayout(valuePropNode);
      if (propLayout) valueLayout = propLayout;
    }

    return {
      footprintName,
      reference,
      position: { x, y, rotation },
      side,
      uuid,
      codeMetadata,
      referenceProperty,
      valueProperty,
      referenceLayout,
      valueLayout,
      fabLayout,
    };
  }

  /**
   * Extract position + layer + font info from a property node's children.
   * Properties have format: (property "Name" "Value" (at x y rot) (layer "...") ...)
   */
  private extractPropertyPositioning(node: SExprNode): ReferencePropertyIR | null {
    const atNode = node.child('at');
    if (!atNode) return null;

    const x = atNode.getNumber(1);
    const y = atNode.getNumber(2);
    const rotation = atNode.getNumber(3, 0);

    const layerNode = node.child('layer');
    const layer = layerNode?.stringValue || 'F.SilkS';

    let width = 1;
    let height = 1;
    let thickness = 0.15;

    const effectsNode = node.child('effects');
    if (effectsNode) {
      const fontNode = effectsNode.child('font');
      if (fontNode) {
        const sizeNode = fontNode.child('size');
        if (sizeNode) {
          height = sizeNode.getNumber(1, 1);
          width = sizeNode.getNumber(2, 1);
        }
        const thickNode = fontNode.child('thickness');
        if (thickNode) {
          thickness = thickNode.getNumber(1, 0.15);
        }
      }
    }

    return { x, y, rotation, layer, width, height, thickness };
  }

  private propertyToTextLayout(node: SExprNode): TextLayoutIR | null {
    const atNode = node.child('at');
    if (!atNode) return null;
    const x = atNode.getNumber(1);
    const y = atNode.getNumber(2);
    if (isNaN(x) || isNaN(y)) return null;
    const rotation = atNode.getNumber(3, 0);
    const layerNode = node.child('layer');
    const layer = layerNode?.stringValue || undefined;
    const hideNode = node.child('hide');
    const show = hideNode?.stringValue !== 'yes';
    let width: number | undefined;
    let height: number | undefined;
    let thickness: number | undefined;
    const effectsNode = node.child('effects');
    if (effectsNode) {
      const fontNode = effectsNode.child('font');
      if (fontNode) {
        const sizeNode = fontNode.child('size');
        if (sizeNode) {
          height = sizeNode.getNumber(1, NaN);
          width = sizeNode.getNumber(2, NaN);
          if (isNaN(height)) height = undefined;
          if (isNaN(width)) width = undefined;
        }
        const thickNode = fontNode.child('thickness');
        if (thickNode) {
          thickness = thickNode.getNumber(1, NaN);
          if (isNaN(thickness)) thickness = undefined;
        }
      }
    }
    return { x, y, rotation, layer, width, height, thickness, show };
  }

  private extractFpTextLayout(node: SExprNode): TextLayoutIR | null {
    const atNode = node.child('at');
    if (!atNode) return null;

    const x = atNode.getNumber(1);
    const y = atNode.getNumber(2);
    if (isNaN(x) || isNaN(y)) return null;

    const rotation = atNode.getNumber(3, 0);
    const layerNode = node.child('layer');
    const layer = layerNode?.stringValue || undefined;

    let width: number | undefined;
    let height: number | undefined;
    let thickness: number | undefined;
    let bold = false;
    let italic = false;
    let show = true;
    let justify: TextLayoutIR['justify'];

    const effectsNode = node.child('effects');
    if (effectsNode) {
      const fontNode = effectsNode.child('font');
      if (fontNode) {
        const sizeNode = fontNode.child('size');
        if (sizeNode) {
          height = sizeNode.getNumber(1, NaN);
          width = sizeNode.getNumber(2, NaN);
          if (isNaN(height)) height = undefined;
          if (isNaN(width)) width = undefined;
        }
        const thickNode = fontNode.child('thickness');
        if (thickNode) {
          thickness = thickNode.getNumber(1, NaN);
          if (isNaN(thickness)) thickness = undefined;
        }
        const fontRaw = fontNode.toArray();
        for (let i = 1; i < fontRaw.length; i++) {
          const item = fontRaw[i];
          const name = getSymName(item);
          if (name === 'bold') bold = true;
          if (name === 'italic') italic = true;
        }
      }

      const justifyNode = effectsNode.child('justify');
      if (justifyNode) {
        justify = {};
        const justifyRaw = justifyNode.toArray();
        for (let i = 1; i < justifyRaw.length; i++) {
          const item = justifyRaw[i];
          const name = getSymName(item);
          if (name === 'left' || name === 'right' || name === 'center') {
            justify.horizontal = name;
          } else if (name === 'top' || name === 'bottom' || name === 'middle') {
            justify.vertical = name;
          } else if (name === 'mirror') {
            justify.mirror = true;
          }
        }
        if (!justify.horizontal && !justify.vertical && !justify.mirror) justify = undefined;
      }

      if (isHidden(effectsNode)) show = false;
    }

    if (isHidden(node)) show = false;

    return {
      x,
      y,
      rotation,
      layer,
      width,
      height,
      thickness,
      bold,
      italic,
      justify,
      show,
    };
  }

  // === Segments ===

  private parseSegments(tree: SExprNode): KicadSegmentIR[] {
    const segments = tree
      .findAll('segment')
      .map((node) => this.parseSegment(node))
      .filter((s): s is KicadSegmentIR => s !== null);

    // Arc-shaped tracks: copper the segment parser cannot express. They are
    // tessellated into straight segments on the same net/width/layer so the
    // imported copper follows the drawn path. Only direct board children —
    // zone outlines embed their own (arc ...) vertices.
    for (const arcNode of tree.children('arc')) {
      const start = arcNode.child('start');
      const mid = arcNode.child('mid');
      const end = arcNode.child('end');
      if (!start || !mid || !end) continue;
      const width = arcNode.child('width')?.getNumber(1, 0.2) ?? 0.2;
      const layer = arcNode.child('layer')?.stringValue || 'F.Cu';
      const netRef = parseNetRef(arcNode.child('net'));

      const points = [
        { x: start.getNumber(1), y: start.getNumber(2) },
        ...tessellateArc(
          { x: start.getNumber(1), y: start.getNumber(2) },
          { x: mid.getNumber(1), y: mid.getNumber(2) },
          { x: end.getNumber(1), y: end.getNumber(2) },
        ).map((p) => ({ x: round6(p.x), y: round6(p.y) })),
      ];
      for (let i = 0; i < points.length - 1; i++) {
        segments.push({
          start: points[i],
          end: points[i + 1],
          width,
          layer,
          net: netRef?.number,
          netName: netRef?.name || undefined,
        });
      }
    }

    return segments;
  }

  private parseSegment(node: SExprNode): KicadSegmentIR | null {
    const startNode = node.child('start');
    const endNode = node.child('end');
    if (!startNode || !endNode) return null;

    const startX = startNode.getNumber(1);
    const startY = startNode.getNumber(2);
    const endX = endNode.getNumber(1);
    const endY = endNode.getNumber(2);

    if (![startX, startY, endX, endY].every(Number.isFinite)) return null;

    const width = node.child('width')?.getNumber(1, 0.2) ?? 0.2;
    const layer = node.child('layer')?.stringValue || 'F.Cu';
    const netRef = parseNetRef(node.child('net'));

    return {
      start: { x: startX, y: startY },
      end: { x: endX, y: endY },
      width,
      layer,
      net: netRef?.number,
      netName: netRef?.name || undefined,
    };
  }

  // === Nets ===

  private parseNets(tree: SExprNode): KicadNetIR[] {
    const byKey = new Map<string, KicadNetIR>();
    for (const raw of tree.findAll('net').map((node) => this.parseNet(node))) {
      if (raw === null) continue;
      // findAll is recursive, so the same net appears on every pad/via/zone
      // referencing it — dedupe by (number, name).
      const key = `${raw.number}|${raw.name}`;
      if (!byKey.has(key)) byKey.set(key, raw);
    }
    return [...byKey.values()];
  }

  private parseNet(node: SExprNode): KicadNetIR | null {
    // typeCAD-authored boards: (net <code> "<name>"). kicad-cli --save-board
    // resaves (zone-fill round-trip) strip the net table and inline the name
    // as (net "<name>"); bare (net <code>) also occurs.
    if (node.rawAt(2) !== undefined) {
      const number = node.getNumber(1, NaN);
      if (isNaN(number)) return null;
      return { number, name: node.getString(2) || '' };
    }
    const first = node.getString(1) ?? '';
    if (/^-?\d+$/.test(first)) return { number: parseInt(first, 10), name: '' };
    if (first !== '') return { number: -1, name: first };
    return null;
  }

  // === Vias ===

  private parseVias(tree: SExprNode): KicadViaIR[] {
    return tree
      .findAll('via')
      .map((node) => this.parseVia(node))
      .filter((v): v is KicadViaIR => v !== null);
  }

  private parseVia(node: SExprNode): KicadViaIR | null {
    const atNode = node.child('at');
    if (!atNode) return null;

    const x = atNode.getNumber(1);
    const y = atNode.getNumber(2);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

    const sizeNode = node.child('size');
    const drillNode = node.child('drill');
    const size = sizeNode?.getNumber(1, NaN);
    const drill = drillNode?.getNumber(1, NaN);

    if (!Number.isFinite(size as number) || !Number.isFinite(drill as number)) return null;

    const netRef = parseNetRef(node.child('net'));

    return {
      at: { x, y },
      size: size as number,
      drill: drill as number,
      net: netRef?.number,
      netName: netRef?.name || undefined,
    };
  }

  // === Outlines ===

  // === Zones ===

  /**
   * Parse top-level `(zone ...)` blocks: filled copper pours and rule
   * areas. Footprint-embedded zones are intentionally skipped (only direct
   * board children are read).
   */
  private parseZones(tree: SExprNode, nets: KicadNetIR[]): KicadZoneIR[] {
    return tree
      .children('zone')
      .map((node) => this.parseZone(node, nets))
      .filter((z): z is KicadZoneIR => z !== null);
  }

  private parseZone(node: SExprNode, nets: KicadNetIR[]): KicadZoneIR | null {
    const polygonNode = node.child('polygon');
    const ptsNode = polygonNode?.child('pts');
    const polygon: Array<{ x: number; y: number }> = [];
    if (ptsNode) {
      // Zone outlines can interleave `xy` vertices with arc segments; arcs
      // are tessellated so the imported polygon follows the drawn outline.
      for (const item of ptsNode.children()) {
        if (item.name === 'xy') {
          const x = item.getNumber(1);
          const y = item.getNumber(2);
          if (Number.isFinite(x) && Number.isFinite(y)) polygon.push({ x, y });
        } else if (item.name === 'arc') {
          const start = item.child('start');
          const mid = item.child('mid');
          const end = item.child('end');
          if (start && mid && end) {
            for (const p of tessellateArc(
              { x: start.getNumber(1), y: start.getNumber(2) },
              { x: mid.getNumber(1), y: mid.getNumber(2) },
              { x: end.getNumber(1), y: end.getNumber(2) },
            )) {
              polygon.push({ x: round6(p.x), y: round6(p.y) });
            }
          }
        }
      }
    }
    if (polygon.length < 3) return null;

    // KiCad writes `(layers ...)` on multi-layer zones and collapses a
    // single-layer zone to `(layer "...")`; typeCAD's own writer always
    // emits the plural form. Accept both.
    const layers: string[] = [];
    const layersNode = node.child('layers') ?? node.child('layer');
    if (layersNode) {
      for (let i = 1; i < layersNode.length; i++) {
        const l = layersNode.getString(i);
        if (l) layers.push(l);
      }
    }

    // Net: prefer the net_name child, then an inline `(net "NAME")` (the
    // form kicad-cli --save-board writes), then the net number → name map.
    let netName: string | null = node.child('net_name')?.stringValue ?? null;
    if (!netName) {
      const netChild = node.child('net');
      const inlineName = netChild && netChild.rawAt(2) === undefined ? (netChild.getString(1) ?? '') : '';
      if (inlineName !== '' && !/^-?\d+$/.test(inlineName)) {
        netName = inlineName;
      } else {
        const netNum = netChild?.getNumber(1, NaN) ?? NaN;
        if (Number.isFinite(netNum) && netNum > 0) {
          netName = nets.find((n) => n.number === netNum)?.name ?? null;
        }
      }
    }
    if (netName === '') netName = null;

    const zone: KicadZoneIR = {
      layers,
      netName,
      name: node.child('name')?.stringValue ?? null,
      priority: node.child('priority')?.getNumber(1, NaN) ?? null,
      // Zone lock is a bare `locked` atom (not a list child), or `(locked yes)`
      locked: hasBareAtom(node, 'locked') || node.child('locked')?.stringValue === 'yes',
      polygon,
    };

    // Rule area
    const keepoutNode = node.child('keepout');
    if (keepoutNode) {
      const notAllowed = (tag: string) => keepoutNode.child(tag)?.stringValue === 'not_allowed';
      zone.keepout = {
        tracks: notAllowed('tracks'),
        vias: notAllowed('vias'),
        pads: notAllowed('pads'),
        copperpour: notAllowed('copperpour'),
        footprints: notAllowed('footprints'),
      };
    }
    const enabled = node.child('placement')?.child('enabled')?.stringValue;
    if (enabled !== undefined) zone.placement = enabled === 'yes';

    // Fill block. `0` is a legitimate value for every field here (e.g. KiCad
    // writes `(island_removal_mode 0)` for "never remove islands"), so guard
    // with Number.isFinite instead of truthiness.
    const finite = (n: number): number | undefined => (Number.isFinite(n) ? n : undefined);
    const fillNode = node.child('fill');
    if (fillNode && fillNode.getString(1) !== 'no' && fillNode.stringValue !== 'no') {
      const modeToken = fillNode.child('mode')?.stringValue;
      zone.fill = {
        mode: modeToken === 'hatch' || modeToken === 'segment' ? 'hatched' : 'solid',
        thermalGap: finite(fillNode.child('thermal_gap')?.getNumber(1, NaN) ?? NaN),
        thermalBridgeWidth: finite(fillNode.child('thermal_bridge_width')?.getNumber(1, NaN) ?? NaN),
        islandRemovalMode: finite(fillNode.child('island_removal_mode')?.getNumber(1, NaN) ?? NaN),
        islandAreaMin: finite(fillNode.child('island_area_min')?.getNumber(1, NaN) ?? NaN),
        smoothing: (fillNode.child('smoothing')?.stringValue as 'chamfer' | 'fillet' | 'none') || undefined,
        smoothingRadius: finite(fillNode.child('radius')?.getNumber(1, NaN) ?? NaN),
        hatchThickness: finite(fillNode.child('hatch_thickness')?.getNumber(1, NaN) ?? NaN),
        hatchGap: finite(fillNode.child('hatch_gap')?.getNumber(1, NaN) ?? NaN),
        hatchOrientation: finite(fillNode.child('hatch_orientation')?.getNumber(1, NaN) ?? NaN),
        // kicad-cli resaves drop (arc_segments 16) — it is KiCad's default,
        // so an absent token means 16; otherwise every resave ping-pongs the
        // source between with/without the property.
        arcSegments: finite(fillNode.child('arc_segments')?.getNumber(1, NaN) ?? 16) ?? 16,
      };
    }

    zone.minThickness = finite(node.child('min_thickness')?.getNumber(1, NaN) ?? NaN);
    const fatNode = node.child('filled_areas_thickness');
    if (fatNode) zone.filledAreasThickness = (fatNode.stringValue ?? fatNode.getString(1)) === 'yes';

    const connectPadsNode = node.child('connect_pads');
    if (connectPadsNode) {
      const kind = connectPadsNode.getString(1);
      zone.connectPads =
        kind === 'thru_hole_only'
          ? 'thru_hole_only'
          : kind === 'yes' || kind === 'true'
            ? 'full'
            : kind === 'no'
              ? 'no'
              : null;
      const clearance = connectPadsNode.child('clearance')?.getNumber(1, NaN);
      if (Number.isFinite(clearance)) zone.clearance = clearance;
    }

    const hatchNode = node.child('hatch');
    if (hatchNode) {
      zone.hatchStyle = hatchNode.getString(1) ?? undefined;
      zone.hatchPitch = finite(hatchNode.getNumber(2, NaN));
    }

    return zone;
  }

  private parseOutlines(tree: SExprNode): KicadOutlineIR[] {
    return tree
      .findAll('gr_rect')
      .concat(tree.findAll('gr_line'))
      .concat(tree.findAll('gr_arc'))
      .concat(tree.findAll('gr_circle'))
      .concat(tree.findAll('gr_poly'))
      .map((node) => this.parseOutline(node))
      .filter((o): o is KicadOutlineIR => o !== null);
  }

  private parseOutline(node: SExprNode): KicadOutlineIR | null {
    const elementType = node.name;
    const validTypes = ['gr_rect', 'gr_line', 'gr_arc', 'gr_circle', 'gr_poly'];
    if (!validTypes.includes(elementType)) return null;

    // Only process Edge.Cuts layer outlines
    const layerNode = node.child('layer');
    const layer = layerNode?.stringValue || '';
    if (layer !== 'Edge.Cuts') return null;

    const startNode = node.child('start');
    const endNode = node.child('end');
    const centerNode = node.child('center');
    const midNode = node.child('mid');

    const start = startNode ? { x: startNode.getNumber(1), y: startNode.getNumber(2) } : undefined;
    const end = endNode ? { x: endNode.getNumber(1), y: endNode.getNumber(2) } : undefined;
    const center = centerNode ? { x: centerNode.getNumber(1), y: centerNode.getNumber(2) } : undefined;
    const mid = midNode ? { x: midNode.getNumber(1), y: midNode.getNumber(2) } : undefined;

    let type: 'rect' | 'line' | 'arc' | 'circle' | 'poly';
    switch (elementType) {
      case 'gr_rect':
        type = 'rect';
        if (start && end) {
          const width = Math.abs(end.x - start.x);
          const height = Math.abs(end.y - start.y);
          return { type, start, end, width, height };
        }
        return null;
      case 'gr_line':
        type = 'line';
        if (start && end) return { type, start, end };
        return null;
      case 'gr_arc':
        type = 'arc';
        if (start && end) return { type, start, end, center, mid };
        return null;
      case 'gr_circle':
        type = 'circle';
        if (center && end) return { type, center, end };
        return null;
      case 'gr_poly': {
        type = 'poly';
        const ptsNode = node.child('pts');
        if (!ptsNode) return null;
        const xyNodes = ptsNode.children('xy');
        const points = xyNodes
          .map((xy) => ({ x: xy.getNumber(1), y: xy.getNumber(2) }))
          .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
        if (points.length < 3) return null;
        return { type, points };
      }
      default:
        return null;
    }
  }

  // === Board graphics (any layer except Edge.Cuts, which feeds outlines) ===

  private parseBoardGraphics(tree: SExprNode): KicadBoardGraphicIR[] {
    const KINDS = ['gr_line', 'gr_rect', 'gr_circle', 'gr_arc', 'gr_poly'];
    const graphics: KicadBoardGraphicIR[] = [];
    for (const node of tree.children()) {
      if (!KINDS.includes(node.name)) continue;
      const layer = node.child('layer')?.stringValue || '';
      if (layer === 'Edge.Cuts' || layer === '') continue;

      // v6 writes (width W); v7+ writes (stroke (width W) (type …))
      const strokeNode = node.child('stroke');
      const width = node.child('width')?.getNumber(1) ?? strokeNode?.child('width')?.getNumber(1) ?? undefined;
      const fillNode = node.child('fill');

      const start = node.child('start');
      const end = node.child('end');
      const center = node.child('center');
      const mid = node.child('mid');
      const point = (n: SExprNode | null) => (n ? { x: n.getNumber(1), y: n.getNumber(2) } : undefined);

      switch (node.name) {
        case 'gr_line':
          graphics.push({ kind: 'line', layer, width, start: point(start), end: point(end) });
          break;
        case 'gr_rect':
          graphics.push({
            kind: 'rect',
            layer,
            width,
            fill: parseFillFlag(fillNode),
            start: point(start),
            end: point(end),
          });
          break;
        case 'gr_circle':
          graphics.push({
            kind: 'circle',
            layer,
            width,
            fill: parseFillFlag(fillNode),
            center: point(center),
            end: point(end),
          });
          break;
        case 'gr_arc':
          graphics.push({ kind: 'arc', layer, width, start: point(start), mid: point(mid), end: point(end) });
          break;
        case 'gr_poly': {
          const pts = node
            .child('pts')
            ?.children('xy')
            .map((xy) => ({ x: xy.getNumber(1), y: xy.getNumber(2) }))
            .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
          if (!pts || pts.length < 3) break;
          graphics.push({ kind: 'poly', layer, width, fill: parseFillFlag(fillNode), points: pts });
          break;
        }
      }
    }
    return graphics;
  }

  // === Stackup ===

  /**
   * Parse the `(setup (stackup ...))` block. Returns null if absent (e.g. a
   * board with no stackup, or one generated without `pcb.stackup()`).
   */
  private parseStackup(tree: SExprNode): KicadStackupIR | null {
    const stackupNode = tree.child('setup')?.child('stackup');
    if (!stackupNode) return null;

    const layerNodes = stackupNode.children('layer');
    const layers: KicadStackupLayerIR[] = layerNodes.map((ln) => {
      const name = ln.stringValue ?? '';
      const typeNode = ln.child('type');
      const thicknessNode = ln.child('thickness');
      const materialNode = ln.child('material');
      const epsilonNode = ln.child('epsilon_r');
      const lossNode = ln.child('loss_tangent');
      const colorNode = ln.child('color');
      return {
        name,
        type: typeNode?.stringValue ?? undefined,
        thickness: thicknessNode ? thicknessNode.getNumber(1) : undefined,
        material: materialNode?.stringValue ?? undefined,
        epsilon_r: epsilonNode ? epsilonNode.getNumber(1) : undefined,
        loss_tangent: lossNode ? lossNode.getNumber(1) : undefined,
        color: colorNode?.stringValue ?? undefined,
      };
    });

    const copperLayerCount = layers.filter((l) => l.name.endsWith('.Cu')).length;

    const finishNode = stackupNode.child('copper_finish');
    const constraintsNode = stackupNode.child('dielectric_constraints');

    return {
      copperLayerCount,
      layers,
      copperFinish: finishNode?.stringValue ?? undefined,
      dielectricConstraints: constraintsNode ? (constraintsNode.getBool(1) ?? undefined) : undefined,
    };
  }

  // === Text Elements ===

  private parseTextElements(tree: SExprNode): KicadTextIR[] {
    return tree
      .findAll('gr_text')
      .map((node) => this.parseTextElement(node))
      .filter((t): t is KicadTextIR => t !== null);
  }

  private parseTextElement(node: SExprNode): KicadTextIR | null {
    const text = node.joinedStringValue;
    if (!text) return null;

    const atNode = node.child('at');
    if (!atNode) return null;

    const x = atNode.getNumber(1);
    const y = atNode.getNumber(2);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

    const rotation = atNode.getNumber(3, 0);
    const layer = node.child('layer')?.stringValue || 'F.SilkS';

    let fontSize: [number, number] | undefined;
    let fontFace: string | undefined;
    let thickness: number | undefined;
    let bold = false;
    let italic = false;
    let justify: KicadTextIR['justify'];
    let hide = false;

    const effectsNode = node.child('effects');
    if (effectsNode) {
      // Parse font
      const fontNode = effectsNode.child('font');
      if (fontNode) {
        const sizeNode = fontNode.child('size');
        if (sizeNode) {
          const h = sizeNode.getNumber(1, NaN);
          const w = sizeNode.getNumber(2, NaN);
          if (!isNaN(h) && !isNaN(w)) fontSize = [h, w];
        }
        const faceNode = fontNode.child('face');
        if (faceNode) {
          fontFace = faceNode.joinedStringValue || undefined;
        }
        // Bold/italic are direct string children of 'font'
        for (let i = 1; i < fontNode.toArray().length; i++) {
          const item = fontNode.toArray()[i];
          const name = getSymName(item);
          if (name === 'bold') bold = true;
          if (name === 'italic') italic = true;
        }
        const thickNode = fontNode.child('thickness');
        if (thickNode) {
          const t = thickNode.getNumber(1, NaN);
          if (!isNaN(t)) thickness = t;
        }
      }

      // Parse justify
      const justifyNode = effectsNode.child('justify');
      if (justifyNode) {
        justify = {};
        for (let i = 1; i < justifyNode.toArray().length; i++) {
          const item = justifyNode.toArray()[i];
          const name = getSymName(item);
          if (name === 'left' || name === 'right' || name === 'center') {
            justify.horizontal = name;
          } else if (name === 'top' || name === 'bottom' || name === 'middle') {
            justify.vertical = name;
          } else if (name === 'mirror') {
            justify.mirror = true;
          }
        }
        // KiCad writes a bare (justify) for default alignment — that is no
        // justify at all, and keeping {} here would fight the source forever.
        if (!justify.horizontal && !justify.vertical && !justify.mirror) justify = undefined;
      }

      // Check for hide - both as a bare atom and a (hide yes) list child
      if (isHidden(effectsNode)) hide = true;
    }

    // Also check for hide at the top level of the node (outside effects)
    if (isHidden(node)) hide = true;

    return {
      text,
      x,
      y,
      rotation,
      layer,
      fontSize,
      fontFace,
      thickness,
      bold,
      italic,
      justify,
      hide,
    };
  }
}
