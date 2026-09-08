import { Component } from '../component.js';
import { parse, Sym, yes, no, nameOf, sym, SNode } from '../sexpr/index.js';
import type { SExpr } from '../sexpr/types.js';
import type { SexprNode } from '../types/sexpr_types.js';
import { generateUuid, formatSourceInfoForProperty, getErrorMessage } from './pcb_utils.js';
import { deterministicUUID } from '../utils/deterministic_id.js';
import { mapLayerToSide, transformSexprLayers, mirrorChamferDirection } from './pcb_layer_utils.js';
import { BoardCreationError } from '../utils/errors.js';
import { reportError } from '../utils/error_reporter.js';
import logger from '../utils/logging.js';
import chalk from 'chalk';
import type { INetResolution, ITextPositioning } from './pcb_interfaces.js';
import { loadFootprintLib } from './component_footprint_loader.js';

function stringifyTags(node: SExpr[]): void {
  if (node.length > 0 && Sym.isSym(node[0])) {
    node[0] = node[0].name;
  }
  for (let i = 0; i < node.length; i++) {
    const child = node[i];
    if (Array.isArray(child)) stringifyTags(child as SExpr[]);
  }
}

function symifyTags(node: SExpr[]): void {
  if (node.length > 0 && typeof node[0] === 'string') {
    node[0] = Sym.for(node[0]);
  }
  for (let i = 0; i < node.length; i++) {
    const child = node[i];
    if (Array.isArray(child)) symifyTags(child as SExpr[]);
  }
}

function applyBackSideTransformToNode(sn: SNode): void {
  const atNode = sn.child('at');
  if (atNode) {
    const raw = atNode.raw;
    if (raw.length >= 3) {
      raw[2] = -parseFloat(String(raw[2]));
      if (raw.length === 3) {
        raw.push(180);
      } else if (raw.length === 4) {
        raw[3] = (parseFloat(String(raw[3])) + 180) % 360;
      }
    }
  }

  const effectsNode = sn.child('effects');
  if (effectsNode) {
    const justifyNode = effectsNode.child('justify');
    if (justifyNode) {
      if (!justifyNode.raw.some((item) => nameOf(item) === 'mirror')) {
        justifyNode.push(sym('mirror'));
      }
    } else {
      effectsNode.push(['justify', sym('mirror')] as SExpr[]);
    }
  }
}

function applyBackSideTransform(subItem: SExpr[]): void {
  applyBackSideTransformToNode(SNode.from(subItem));
}

function findFirstNodeIndex(node: SExpr[], startIndex: number): number {
  for (let k = startIndex; k < node.length; k++) {
    if (Array.isArray(node[k])) return k;
  }
  return -1;
}

function splicePropertyStringValue(node: SExpr[], newValue?: string): void {
  const firstNodeIndex = findFirstNodeIndex(node, 2);
  const valueElementsCount = firstNodeIndex === -1 ? node.length - 2 : firstNodeIndex - 2;

  if (valueElementsCount > 0) {
    let existingValue = '';
    for (let k = 2; k < 2 + valueElementsCount; k++) {
      if (typeof node[k] === 'string') {
        existingValue += node[k];
      }
    }
    const sanitizedExisting = existingValue
      .replace(/\([^)]*\)/g, '')
      .replace(/[()"`±]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    node.splice(2, valueElementsCount, sanitizedExisting);
  }

  if (newValue !== undefined) {
    const idx = findFirstNodeIndex(node, 2);
    const count = idx === -1 ? node.length - 2 : idx - 2;
    node.splice(2, Math.max(0, count), newValue);
  }
}

function ensureCodePropertySubNodes(propNode: SNode): void {
  if (!propNode.hasChild('hide')) propNode.push(['hide', yes()] as SExpr[]);
  if (!propNode.hasChild('layer')) propNode.push(['layer', 'F.Fab'] as SExpr[]);
  if (!propNode.hasChild('at')) propNode.push(['at', 0, 0, 0] as SExpr[]);
  // The property value (raw[2] of a (property "Code" <value> ...) node) is
  // stable per component, so the derived UUID is deterministic.
  if (!propNode.hasChild('uuid'))
    propNode.push(['uuid', generateUuid('code-prop', String(propNode.raw[2] ?? ''))] as SExpr[]);
  if (!propNode.hasChild('effects'))
    propNode.push(['effects', ['font', ['size', 1, 1], ['thickness', 0.15]]] as SExpr[]);
}

const BACK_SIDE_GRAPHICS = new Set([
  'fp_line',
  'fp_circle',
  'fp_arc',
  'fp_rect',
  'fp_poly',
  'fp_text',
  'fp_text_box',
  'fp_curve',
]);
const MIRRORABLE_COORD_NODES = new Set(['start', 'end', 'center', 'mid']);

function applyLayoutToFpText(sn: SNode, layout: ITextPositioning): void {
  const atChild = sn.child('at');
  if (atChild) {
    if (layout.x !== undefined) atChild.raw[1] = layout.x;
    if (layout.y !== undefined) atChild.raw[2] = layout.y;
    if (layout.rotation !== undefined) {
      if (atChild.raw.length > 3) {
        atChild.raw[3] = layout.rotation;
      } else {
        atChild.raw.push(layout.rotation);
      }
    }
  }

  if (layout.layer !== undefined) {
    const layerChild = sn.child('layer');
    if (layerChild) {
      layerChild.raw[1] = layout.layer;
    }
  }

  const effectiveHeight = layout.height ?? layout.fontSize;
  const effectiveWidth = layout.width ?? layout.fontSize;
  if (
    effectiveHeight !== undefined ||
    effectiveWidth !== undefined ||
    layout.thickness !== undefined ||
    layout.font !== undefined ||
    layout.bold !== undefined ||
    layout.italic !== undefined
  ) {
    let effectsChild = sn.child('effects');
    if (!effectsChild) {
      sn.push([
        Sym.for('effects'),
        [Sym.for('font'), [Sym.for('size'), 1, 1], [Sym.for('thickness'), 0.15]],
      ] as SExpr[]);
      effectsChild = sn.child('effects');
    }
    if (effectsChild) {
      let fontChild = effectsChild.child('font');
      if (!fontChild) {
        effectsChild.push([Sym.for('font'), [Sym.for('size'), 1, 1], [Sym.for('thickness'), 0.15]] as SExpr[]);
        fontChild = effectsChild.child('font');
      }
      if (fontChild) {
        const sizeChild = fontChild.child('size');
        if (sizeChild) {
          if (effectiveHeight !== undefined) sizeChild.raw[1] = effectiveHeight;
          if (effectiveWidth !== undefined) sizeChild.raw[2] = effectiveWidth;
        }
        if (layout.thickness !== undefined) {
          const thickChild = fontChild.child('thickness');
          if (thickChild) {
            thickChild.raw[1] = layout.thickness;
          }
        }
        // TrueType face: replace or insert (face "Name")
        if (layout.font !== undefined) {
          const faceChild = fontChild.child('face');
          if (faceChild) {
            faceChild.raw[1] = layout.font;
          } else {
            fontChild.push([Sym.for('face'), layout.font] as SExpr[]);
          }
        }
        // bold / italic are bare symbols in the font block
        const setFlag = (flag: 'bold' | 'italic', on: boolean | undefined) => {
          if (on === undefined) return;
          const isFlag = (el: unknown) => (Sym.isSym(el) ? el.name === flag : el === flag);
          const i = fontChild!.raw.findIndex((el) => !Array.isArray(el) && isFlag(el));
          if (on && i < 0) fontChild!.push([Sym.for(flag)] as SExpr[]);
          if (!on && i >= 0) fontChild!.raw.splice(i, 1);
        };
        setFlag('bold', layout.bold);
        setFlag('italic', layout.italic);
      }
    }
  }

  // Three-state visibility: false hides, true shows, undefined leaves the
  // footprint's own hide flag untouched.
  const hideChild = sn.child('hide');
  if (layout.show === false) {
    if (hideChild) {
      hideChild.raw[1] = yes();
    } else {
      sn.push(['hide', yes()] as SExpr[]);
    }
  } else if (layout.show === true) {
    if (hideChild) {
      hideChild.raw[1] = no();
    } else {
      sn.push(['hide', no()] as SExpr[]);
    }
  }
}

export function processFootprintItem(
  subItem: SexprNode,
  component: Component,
  resolveNet: (ref: string, pin: string, uuid?: string, map?: Map<string, number>) => INetResolution,
  boardNetNameToCodeMap?: Map<string, number>,
) {
  const sn = SNode.from(subItem);
  const itemType = sn.name;

  // KiCad 10 invents random UUIDs for footprint graphics (fp_line, fp_circle,
  // ...) that lack one when it resaves — zone-fill round-trips the file
  // through pcbnew. Emit deterministic UUIDs derived from the geometry so
  // refilled boards stay byte-stable.
  if (itemType.startsWith('fp_') && !sn.hasChild('uuid')) {
    const geoKey = sn
      .children()
      .filter((c) => ['start', 'end', 'center', 'mid', 'pts', 'at'].includes(c.name))
      .map((c) => JSON.stringify(c.raw))
      .join('|');
    subItem.push(['uuid', deterministicUUID('fp-gfx', component.uuid, itemType, geoKey)]);
  }

  if (itemType === 'property') {
    const propName = sn.getString(1);
    let newValue: string | undefined = undefined;

    if (propName === 'Reference' && component.reference !== undefined) {
      newValue = component.reference;
    } else if (propName === 'Value' && component.value !== undefined) {
      newValue = component.value;
    } else if (propName === 'Footprint' && component.footprint !== undefined) {
      newValue = component.footprint;
    } else if (propName === 'Datasheet' && component.datasheet !== undefined) {
      newValue = component.datasheet
        .replace(/[()"`±]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    } else if (propName === 'Code') {
      newValue = String(subItem[2]);
    } else if (propName === 'Description' && component.description !== undefined) {
      newValue = component.description
        .replace(/\([^)]*\)/g, '')
        .replace(/[()"`±]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    } else if (propName === 'MPN' && component.mpn !== undefined) {
      newValue = component.mpn
        .replace(/[()"`±]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    }

    splicePropertyStringValue(subItem, newValue);

    // Base library properties carry no UUID; KiCad 10 invents random ones
    // when it resaves (zone-fill round-trip). Emit deterministic UUIDs so
    // refilled boards stay byte-stable.
    if (!sn.hasChild('uuid')) {
      subItem.push(['uuid', deterministicUUID('fp-prop', component.uuid, propName ?? '', String(subItem[2] ?? ''))]);
    }

    if (propName === 'Reference' && component.referenceLayout) {
      applyLayoutToFpText(sn, component.referenceLayout);
    } else if (propName === 'Value' && component.valueLayout) {
      applyLayoutToFpText(sn, component.valueLayout);
    }

    if (component.pcb?.side === 'back') {
      applyBackSideTransform(subItem);
    }
  } else if (itemType === 'fp_text') {
    const textType = String(subItem[1]).toLowerCase();
    if (textType === 'reference' && component.reference !== undefined) {
      subItem[2] = component.reference;
      if (component.referenceLayout) {
        applyLayoutToFpText(sn, component.referenceLayout);
      }
    } else if (textType === 'value' && component.value !== undefined) {
      subItem[2] = component.value;
      if (component.valueLayout) {
        applyLayoutToFpText(sn, component.valueLayout);
      }
    } else if (textType === 'user' && component.fab) {
      const textContent = subItem.length > 2 ? String(subItem[2]) : '';
      if (textContent === '${REFERENCE}') {
        const fab = component.fab;
        if (fab.text) subItem[2] = fab.text;
        applyLayoutToFpText(sn, fab);
      }
    }

    if (component.pcb?.side === 'back') {
      applyBackSideTransform(subItem);
    }
  } else if (itemType === 'pad') {
    const padNumber = subItem.length > 1 ? String(subItem[1]) : '';

    const netResolution = resolveNet(component.reference || '', padNumber, undefined, boardNetNameToCodeMap);

    const padAtChild = sn.child('at');
    if (padAtChild) {
      const padAtRaw = padAtChild.raw;
      if (component.pcb?.side === 'back' && padAtRaw.length >= 3) {
        padAtRaw[2] = -parseFloat(String(padAtRaw[2]));
      }

      if (padAtRaw.length === 3) {
        let rotation = component.pcb.rotation || 0;
        if (component.pcb?.side === 'back') {
          rotation = (360 - rotation) % 360;
        }
        padAtRaw.push(rotation);
      } else if (padAtRaw.length === 4) {
        const componentRotation = component.pcb.rotation || 0;
        const padRotation = parseFloat(String(padAtRaw[3]));

        if (component.pcb?.side === 'back') {
          const mirroredComponentRotation = (360 - componentRotation) % 360;
          const mirroredPadRotation = (360 - padRotation) % 360;
          padAtRaw[3] = (mirroredComponentRotation + mirroredPadRotation) % 360;
        } else {
          padAtRaw[3] = componentRotation - padRotation;
        }
      }
    }

    const layersChild = sn.child('layers');
    if (layersChild) {
      const layersRaw = layersChild.raw;
      for (let layerIdx = 1; layerIdx < layersRaw.length; layerIdx++) {
        const layerElement = layersRaw[layerIdx];
        if (typeof layerElement === 'string' || Sym.isSym(layerElement)) {
          const cleanLayerName = String(layerElement);
          const transformedLayer = mapLayerToSide(cleanLayerName, component.pcb?.side);
          if (transformedLayer !== cleanLayerName) {
            layersRaw[layerIdx] = transformedLayer;
          }
        }
      }
    }

    let netNodeFound = false;
    let pintypeNodeFound = false;

    for (const child of sn.children()) {
      const childName = child.name;
      if (childName === 'net') {
        child.raw[1] = netResolution.netCode;
        child.raw[2] = netResolution.netName || '';
        netNodeFound = true;
      } else if (childName === 'pintype') {
        child.raw[1] = Sym.for('passive');
        pintypeNodeFound = true;
      }
    }

    if (!netNodeFound) {
      subItem.push(['net', netResolution.netCode, netResolution.netName || '']);
    }

    if (!pintypeNodeFound) {
      subItem.push(['pintype', Sym.for('passive')]);
    }

    // KiCad 10 invents random UUIDs for pads that lack one when it resaves
    // (zone fill round-trips the file through pcbnew). Emit a deterministic
    // UUID derived from the component so refilled boards stay byte-stable.
    if (!sn.hasChild('uuid') && component.reference) {
      subItem.push(['uuid', deterministicUUID('pad', component.uuid, padNumber)]);
    }

    if (component.pcb?.side === 'back') {
      const chamferChild = sn.child('chamfer');
      if (chamferChild && chamferChild.raw.length > 1) {
        const originalDirection = chamferChild.raw[1];
        const mirroredDirection = mirrorChamferDirection(String(originalDirection));
        if (mirroredDirection !== String(originalDirection)) {
          chamferChild.raw[1] = mirroredDirection;
        }
      }
    }
  } else if (component.pcb?.side === 'back' && BACK_SIDE_GRAPHICS.has(itemType)) {
    for (const child of sn.children()) {
      const nodeType = child.name;

      if (MIRRORABLE_COORD_NODES.has(nodeType) && child.raw.length >= 3) {
        child.raw[2] = -parseFloat(String(child.raw[2]));
      } else if (nodeType === 'pts') {
        for (const xyChild of child.children('xy')) {
          if (xyChild.raw.length >= 3) {
            xyChild.raw[2] = -parseFloat(String(xyChild.raw[2]));
          }
        }
      }
    }

    if (itemType === 'fp_text' || itemType === 'fp_text_box') {
      applyBackSideTransform(subItem);
    }
  }
}

function findPropertyNodeByName(parent: SNode, name: string): SNode | null {
  for (const child of parent.children('property')) {
    const propName = child.getString(1);
    if (propName === name) return child;
  }
  return null;
}

function findPropertyInsertPosition(parent: SNode): number {
  const raw = parent.raw;
  for (let j = 0; j < raw.length; j++) {
    const child = SNode.from(raw[j] as SExpr[]);
    if (Array.isArray(raw[j]) && child.name === 'property') return j + 1;
  }
  return raw.length;
}

function makeCodeProperty(valueToken: string): SExpr[] {
  return [
    'property',
    'Code',
    valueToken,
    ['at', 0, 0, 0],
    ['layer', 'F.Fab'],
    ['hide', yes()],
    ['uuid', generateUuid('code-prop', valueToken)],
    ['effects', ['font', ['size', 1, 1], ['thickness', 0.15]]],
  ] as SExpr[];
}

export function updateFootprintNode(
  node: SexprNode,
  component: Component,
  resolveNet: (ref: string, pin: string, uuid?: string, map?: Map<string, number>) => INetResolution,
  boardNetNameToCodeMap?: Map<string, number>,
): SexprNode {
  component.pcb.rotation = component.pcb.rotation ?? 0;
  const sn = SNode.from(node);

  for (let i = 0; i < node.length; i++) {
    if (Array.isArray(node[i])) {
      node[i] = transformSexprLayers(node[i], component.pcb?.side);
    }
  }

  stringifyTags(node);

  const uuidChild = sn.child('uuid');
  if (uuidChild) {
    uuidChild.raw[1] = component.uuid;
  } else {
    node.splice(2, 0, ['uuid', component.uuid] as SExpr[]);
  }

  node[1] = component.footprint;

  const mainFootprintLayer = component.pcb?.side === 'back' ? 'B.Cu' : 'F.Cu';
  const layerChild = sn.child('layer');
  if (layerChild) {
    layerChild.raw[1] = mainFootprintLayer;
  } else {
    let layerInsertPos = 2;
    for (let i = 0; i < node.length; ++i) {
      const child = SNode.from(node[i] as SExpr[]);
      if (Array.isArray(node[i]) && (child.name === 'uuid' || child.name === 'at')) {
        layerInsertPos = i;
        break;
      }
      if (i > 1 && typeof node[i - 1] === 'string' && (node[i - 1] as string).includes(component.footprint)) {
        layerInsertPos = i;
      }
    }
    node.splice(layerInsertPos, 0, ['layer', mainFootprintLayer] as SExpr[]);
  }

  const atChild = sn.child('at');
  if (atChild) {
    const atRaw = atChild.raw;
    atRaw[1] = component.pcb.x;
    atRaw[2] = component.pcb.y;
    if (atRaw.length > 3) {
      atRaw[3] = component.pcb.rotation;
    } else {
      atRaw.push(component.pcb.rotation);
    }
  } else if (typeof component.pcb.x === 'number' && typeof component.pcb.y === 'number') {
    let atInsertPos = 2;
    for (let i = 0; i < node.length; ++i) {
      const child = SNode.from(node[i] as SExpr[]);
      if (Array.isArray(node[i])) {
        if (child.name === 'uuid') {
          atInsertPos = i + 1;
          break;
        } else if (child.name === 'layer') {
          atInsertPos = i + 1;
        }
      }
    }
    node.splice(atInsertPos, 0, ['at', component.pcb.x, component.pcb.y, component.pcb.rotation] as SExpr[]);
  }

  const hasCodeProperty = findPropertyNodeByName(sn, 'Code') !== null;

  for (let i = 0; i < node.length; i++) {
    const subItem = node[i];
    if (!Array.isArray(subItem)) continue;
    processFootprintItem(subItem as SexprNode, component, resolveNet, boardNetNameToCodeMap);
  }

  {
    const formatted = formatSourceInfoForProperty(component.sourceInfo);
    const valueToken = formatted && formatted.length > 0 ? formatted : '';

    if (hasCodeProperty) {
      const codeProp = findPropertyNodeByName(SNode.from(node), 'Code');
      if (codeProp) {
        splicePropertyStringValue(codeProp.raw, valueToken);
        ensureCodePropertySubNodes(codeProp);
      }
    } else {
      const insertPos = findPropertyInsertPosition(SNode.from(node));
      node.splice(insertPos, 0, makeCodeProperty(valueToken));
    }
  }

  // KiCad 10 requires Datasheet/Description properties; when missing, its
  // resave (zone-fill round-trip) adds them with random UUIDs. Emit them
  // ourselves so refilled boards stay byte-stable.
  for (const [name, value] of [
    ['Datasheet', component.datasheet ?? ''],
    ['Description', component.description ?? ''],
  ] as const) {
    if (findPropertyNodeByName(sn, name) !== null) continue;
    const insertPos = findPropertyInsertPosition(SNode.from(node));
    node.splice(insertPos, 0, [
      'property',
      name,
      value,
      ['at', 0, 0, 0],
      ['layer', 'F.Fab'],
      ['hide', yes()],
      ['uuid', deterministicUUID('fp-prop', component.uuid, name, value)],
      ['effects', ['font', ['size', 1, 1], ['thickness', 0.15]]],
    ] as SExpr[]);
  }

  symifyTags(node);
  return node;
}

export function createFootprintNode(
  component: Component,
  resolveNet: (ref: string, pin: string, uuid?: string, map?: Map<string, number>) => INetResolution,
  boardNetNameToCodeMap?: Map<string, number>,
): SexprNode {
  let footprint_contents: string;
  try {
    try {
      footprint_contents = component.footprint_lib(component.footprint!);
    } catch {
      footprint_contents = loadFootprintLib(
        component.footprint!,
        component.reference || '',
        component.value || '',
        undefined,
      );
    }
  } catch (e: unknown) {
    reportError('Failed to create footprint node.', component);
    throw new BoardCreationError(
      `[${component.reference || 'Unknown'}, ${component.value || 'Unknown'}, ${component.footprint}] Failed to create footprint node. ${getErrorMessage(e)}`,
    );
  }

  let l: SexprNode;
  try {
    l = parse(footprint_contents) as SexprNode;
    if (l === undefined || !Array.isArray(l)) {
      throw new BoardCreationError('Parsed footprint is undefined or not an array');
    }
  } catch (e: unknown) {
    reportError('Failed to parse footprint.', component);
    throw new BoardCreationError(
      `[${component.reference || 'Unknown'}, ${component.value || 'Unknown'}, ${component.footprint}] Failed to parse footprint: ${getErrorMessage(e)}`,
    );
  }

  component.pcb.rotation = component.pcb.rotation ?? 0;

  for (let i = 0; i < l.length; i++) {
    if (Array.isArray(l[i])) {
      l[i] = transformSexprLayers(l[i], component.pcb?.side);
    }
  }

  stringifyTags(l);

  l.splice(2, 0, ['at', component.pcb.x, component.pcb.y, component.pcb.rotation] as SExpr[]);

  l.splice(2, 0, ['uuid', component.uuid] as SExpr[]);

  const codeValue = formatSourceInfoForProperty(component.sourceInfo, component.uuid, component.footprintFingerprint);
  if (codeValue) {
    l.splice(2, 0, [
      'property',
      'Code',
      codeValue,
      ['at', 0, 0, 0],
      ['layer', 'F.Fab'],
      ['hide', yes()],
      ['uuid', generateUuid('code-prop', codeValue)],
      ['effects', ['font', ['size', 1, 1], ['thickness', 0.15]]],
    ] as SExpr[]);
  }

  const mainFootprintLayer = component.pcb?.side === 'back' ? 'B.Cu' : 'F.Cu';
  const sn = SNode.from(l);
  const layerChild = sn.child('layer');
  if (layerChild) {
    layerChild.raw[1] = mainFootprintLayer;
  } else {
    l.splice(2, 0, ['layer', mainFootprintLayer] as SExpr[]);
  }

  l[1] = component.footprint;

  for (let i = 0; i < l.length; i++) {
    if (!Array.isArray(l[i])) continue;
    processFootprintItem(l[i] as SexprNode, component, resolveNet, boardNetNameToCodeMap);
  }

  const formatted = formatSourceInfoForProperty(component.sourceInfo);
  const valueToken = formatted && formatted.length > 0 ? formatted : '';

  let hasCodeProperty = false;
  const codeProp = findPropertyNodeByName(sn, 'Code');
  if (codeProp) {
    hasCodeProperty = true;
    splicePropertyStringValue(codeProp.raw, valueToken);
  }

  if (!hasCodeProperty) {
    const insertPos = findPropertyInsertPosition(sn);
    l.splice(insertPos, 0, makeCodeProperty(valueToken));
  }

  // KiCad 10 requires Datasheet/Description properties; when missing, its
  // resave (zone-fill round-trip) adds them with random UUIDs. Emit them
  // ourselves so refilled boards stay byte-stable.
  for (const [name, value] of [
    ['Datasheet', component.datasheet ?? ''],
    ['Description', component.description ?? ''],
  ] as const) {
    if (findPropertyNodeByName(sn, name) !== null) continue;
    const insertPos = findPropertyInsertPosition(sn);
    l.splice(insertPos, 0, [
      'property',
      name,
      value,
      ['at', 0, 0, 0],
      ['layer', 'F.Fab'],
      ['hide', yes()],
      ['uuid', deterministicUUID('fp-prop', component.uuid, name, value)],
      ['effects', ['font', ['size', 1, 1], ['thickness', 0.15]]],
    ] as SExpr[]);
  }

  if (component.text && component.text.length > 0) {
    for (const textItem of component.text) {
      const propName = textItem.property;
      const existingProp = findPropertyNodeByName(sn, propName);

      if (existingProp) {
        const existingPropRaw = existingProp.raw;

        // Keep the footprint's own text unless an explicit replacement is given
        if (textItem.text !== undefined) {
          splicePropertyStringValue(existingPropRaw, textItem.text);
        }

        // Merge position: omitted fields keep the footprint's coordinates
        const atChild = existingProp.child('at');
        const curX = atChild && atChild.raw.length > 2 ? atChild.raw[1] : 0;
        const curY = atChild && atChild.raw.length > 2 ? atChild.raw[2] : 0;
        const curRotation = atChild && atChild.raw.length > 3 ? atChild.raw[3] : 0;
        const at = ['at', textItem.x ?? curX, textItem.y ?? curY, textItem.rotation ?? curRotation] as SExpr[];
        if (existingProp.hasChild('at')) {
          existingProp.replaceChild('at', at);
        } else {
          existingPropRaw.splice(3, 0, at);
        }

        if (textItem.layer !== undefined) {
          if (existingProp.hasChild('layer')) {
            existingProp.replaceChild('layer', ['layer', textItem.layer] as SExpr[]);
          } else {
            const insertAfterAt = existingPropRaw.findIndex(
              (item: SExpr, idx: number) => idx > 2 && Array.isArray(item) && SNode.from(item as SExpr[]).name === 'at',
            );
            existingPropRaw.splice(insertAfterAt >= 0 ? insertAfterAt + 1 : 3, 0, ['layer', textItem.layer] as SExpr[]);
          }
        }

        const fontParts: SExpr[] = [];
        if (textItem.bold) fontParts.push(Sym.for('bold'));
        if (textItem.italic) fontParts.push(Sym.for('italic'));
        if (textItem.font) fontParts.push([Sym.for('face'), textItem.font]);
        const hasFontOverride =
          fontParts.length > 0 ||
          textItem.fontSize !== undefined ||
          textItem.width !== undefined ||
          textItem.height !== undefined ||
          textItem.thickness !== undefined;
        if (hasFontOverride) {
          const fontWidth = textItem.width ?? textItem.fontSize ?? 1.27;
          const fontHeight = textItem.height ?? textItem.fontSize ?? 1.27;
          const thickness = textItem.thickness ?? 0.15;
          fontParts.push([Sym.for('size'), fontWidth, fontHeight], [Sym.for('thickness'), thickness]);
          const newEffects = [Sym.for('effects'), [Sym.for('font'), ...fontParts]] as SExpr[];
          if (existingProp.hasChild('effects')) {
            existingProp.replaceChild('effects', newEffects);
          } else {
            existingProp.push(newEffects);
          }
        }

        // Three-state visibility: false hides, true shows, undefined leaves
        // the footprint's own hide flag untouched.
        if (textItem.show !== undefined) {
          const hideValue = textItem.show ? no() : yes();
          if (existingProp.hasChild('hide')) {
            existingProp.replaceChild('hide', ['hide', hideValue] as SExpr[]);
          } else {
            existingProp.push(['hide', hideValue] as SExpr[]);
          }
        }
      } else {
        const fontSize = textItem.fontSize ?? 1.27;
        const fontWidth = textItem.width ?? fontSize;
        const fontHeight = textItem.height ?? fontSize;
        const thickness = textItem.thickness ?? 0.15;
        const rotation = textItem.rotation ?? 0;
        const layer = textItem.layer ?? (textItem.property === 'Reference' ? 'F.SilkS' : 'F.Fab');
        const hideValue = textItem.show === false ? yes() : no();
        const text =
          textItem.text ??
          (textItem.property === 'Reference'
            ? component.reference
            : textItem.property === 'Value'
              ? component.value
              : undefined);

        if (text === undefined) {
          logger.warn(
            chalk.yellow(
              `footprint text entry "${propName}" has no text and the footprint has no such property; skipping`,
            ),
          );
          continue;
        }

        const insertPos = findPropertyInsertPosition(sn);
        const fontParts: SExpr[] = [];
        if (textItem.bold) fontParts.push(Sym.for('bold'));
        if (textItem.italic) fontParts.push(Sym.for('italic'));
        if (textItem.font) fontParts.push([Sym.for('face'), textItem.font]);
        fontParts.push([Sym.for('size'), fontWidth, fontHeight], [Sym.for('thickness'), thickness]);
        const textProp: SExpr[] = [
          'property',
          propName,
          text,
          ['at', textItem.x ?? 0, textItem.y ?? 0, rotation],
          ['layer', layer],
          ['uuid', generateUuid('text-prop', component.uuid, propName, text, textItem.x ?? 0, textItem.y ?? 0, layer)],
          [Sym.for('effects'), [Sym.for('font'), ...fontParts]] as SExpr[],
          ['hide', hideValue],
        ] as SExpr[];
        l.splice(insertPos, 0, textProp);
      }
    }
  }

  symifyTags(l);
  return l;
}
