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
} from './types.js';

function getSymName(item: unknown): string {
  if (Sym.isSym(item)) return item.name;
  if (typeof item === 'string') return item.replace(/[`"]/g, '');
  return '';
}

/** Whether the node carries a bare atom child like zone-level `locked`. */
function hasBareAtom(node: SExprNode, name: string): boolean {
  for (let i = 1; i < node.length; i++) {
    if (getSymName(node.rawAt(i)) === name) return true;
  }
  return false;
}

/**
 * Builds a typed KicadIR from a parsed S-expression tree.
 * Replaces the monolithic parsing functions in cli.ts with
 * SExprNode-based key access instead of raw array indexing.
 */
export class KicadIRBuilder {
  build(tree: SExprNode): KicadIR {
    const nets = this.parseNets(tree);
    return {
      version: tree.child('version')?.stringValue || '0',
      generator: tree.child('generator')?.stringValue || '',
      footprints: this.parseFootprints(tree),
      textElements: this.parseTextElements(tree),
      segments: this.parseSegments(tree),
      vias: this.parseVias(tree),
      outlines: this.parseOutlines(tree),
      nets,
      stackup: this.parseStackup(tree),
      zones: this.parseZones(tree, nets),
    };
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

    // Position
    const atNode = node.child('at');
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
      }

      const effectsRaw = effectsNode.toArray();
      for (let i = 1; i < effectsRaw.length; i++) {
        const item = effectsRaw[i];
        const name = getSymName(item);
        if (name === 'hide') show = false;
      }
    }

    const nodeRaw = node.toArray();
    for (let i = 1; i < nodeRaw.length; i++) {
      const item = nodeRaw[i];
      const name = getSymName(item);
      if (name === 'hide') show = false;
    }

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
    return tree
      .findAll('segment')
      .map((node) => this.parseSegment(node))
      .filter((s): s is KicadSegmentIR => s !== null);
  }

  private parseSegment(node: SExprNode): KicadSegmentIR | null {
    const startNode = node.child('start');
    const endNode = node.child('end');
    if (!startNode || !endNode) return null;

    const startX = startNode.getNumber(1);
    const startY = startNode.getNumber(2);
    const endX = endNode.getNumber(1);
    const endY = endNode.getNumber(2);

    if (isNaN(startX) || isNaN(startY) || isNaN(endX) || isNaN(endY)) return null;

    const width = node.child('width')?.getNumber(1, 0.2) ?? 0.2;
    const layer = node.child('layer')?.stringValue || 'F.Cu';
    const netNode = node.child('net');
    const net = netNode ? netNode.getNumber(1) : undefined;

    return {
      start: { x: startX, y: startY },
      end: { x: endX, y: endY },
      width,
      layer,
      net: isNaN(net as number) ? undefined : net,
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
    if (isNaN(x) || isNaN(y)) return null;

    const sizeNode = node.child('size');
    const drillNode = node.child('drill');
    const size = sizeNode?.getNumber(1, NaN);
    const drill = drillNode?.getNumber(1, NaN);

    if (isNaN(size as number) || isNaN(drill as number)) return null;

    const netNode = node.child('net');
    const net = netNode ? netNode.getNumber(1) : undefined;

    return {
      at: { x, y },
      size: size as number,
      drill: drill as number,
      net: isNaN(net as number) ? undefined : net,
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
    const pts = polygonNode?.child('pts')?.children('xy') ?? [];
    const polygon = pts
      .map((xy) => ({ x: xy.getNumber(1), y: xy.getNumber(2) }))
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    if (polygon.length < 3) return null;

    const layersNode = node.child('layers');
    const layers: string[] = [];
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
      return {
        name,
        type: typeNode?.stringValue ?? undefined,
        thickness: thicknessNode ? thicknessNode.getNumber(1) : undefined,
        material: materialNode?.stringValue ?? undefined,
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
    if (isNaN(x) || isNaN(y)) return null;

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
      }

      // Check for hide - as a string child of effects
      for (let i = 1; i < effectsNode.toArray().length; i++) {
        const item = effectsNode.toArray()[i];
        const name = getSymName(item);
        if (name === 'hide') hide = true;
      }
    }

    // Also check for hide at the top level of the node (outside effects)
    for (let i = 1; i < node.toArray().length; i++) {
      const item = node.toArray()[i];
      const name = getSymName(item);
      if (name === 'hide') hide = true;
    }

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
