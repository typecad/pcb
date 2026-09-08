import fs from 'node:fs';
import { Component } from '../component.js';
import { parse, serialize, s, sym, yes, no, nameOf } from '../sexpr/index.js';
import type { SExpr } from '../sexpr/types.js';
import type { ISchematicNode } from '../types/schematic_types.js';
import { PCB, getPcbState, pcbResolveNet } from './pcb.js';
import {
  IVia,
  IGrLine,
  IGrArc,
  IGrCircle,
  IGrRect,
  IGrPoly,
  IGrTextOptions,
  IFilledZone,
  IKeepoutZone,
  IOutline,
  OutlineElement,
} from './pcb_interfaces.js';
import { normalizeNetName, formatCallSite, getErrorMessage } from './pcb_utils.js';
import { setPendingBoardFilePath } from '../cli/pending_summary.js';
import logger from '../utils/logging.js';
import { getCallSite } from '../utils/stack_trace.js';

export function renderVias(
  viaMap: Map<string, IVia>,
  pcb: PCB,
  boardNetNameToCodeMap: Map<string, number>,
  boardContents: SExpr[],
): void {
  viaMap.forEach((viaData, uuid) => {
    let finalViaNetCode = 0;

    if (viaData.net && boardNetNameToCodeMap) {
      let lookupKey = viaData.net.toLowerCase();
      if (lookupKey.startsWith('/')) lookupKey = lookupKey.substring(1);

      if (boardNetNameToCodeMap.has(lookupKey)) {
        finalViaNetCode = boardNetNameToCodeMap.get(lookupKey)!;
      } else {
        logger.warn(`[BoardCreation] Could not resolve via net "${viaData.net}" in board net map, defaulting to net 0`);
      }
    } else if (viaData.uuid) {
      const netResolution = pcbResolveNet(pcb, '', '1', viaData.uuid, boardNetNameToCodeMap, viaData.net);
      finalViaNetCode = netResolution.netCode;
      if (netResolution.found) {
        viaData.net = netResolution.netName;
        viaData.netCode = netResolution.netCode;
      }
    } else {
      logger.warn('[BoardCreation] Via missing UUID and net name. Assigning to net 0.');
    }

    const viaLayers = viaData.layers || ['F.Cu', 'B.Cu'];
    try {
      const viaNode = s(
        'via',
        s('at', viaData.at?.x || 0, viaData.at?.y || 0),
        s('size', viaData.size || 0.6),
        s('drill', viaData.drill || 0.3),
        s('layers', ...viaLayers),
        s('free', yes()),
        s('net', finalViaNetCode),
        s('uuid', uuid),
      );
      boardContents.push(viaNode);
    } catch (e: unknown) {
      logger.error(
        `Error: Failed to build via node for UUID ${uuid}: ${getErrorMessage(e)}${formatCallSite(getCallSite())}`,
      );
    }
  });
}

export function renderOutlinesAndTracks(
  outlines: IOutline[],
  pcb: PCB,
  boardNetNameToCodeMap: Map<string, number>,
  boardContents: SExpr[],
): void {
  for (const conceptualOutline of outlines) {
    for (const element of conceptualOutline.elements) {
      try {
        if (element.type === 'line') {
          const line = element as IGrLine;
          const isCopperLayer = line.layer.includes('.Cu') && !line.layer.includes('Edge.Cuts');

          if (isCopperLayer) {
            let segNetCode = 0;
            if (line.net) {
              let lookupKey = line.net.toLowerCase();
              if (lookupKey.startsWith('/')) lookupKey = lookupKey.substring(1);
              segNetCode = boardNetNameToCodeMap.get(lookupKey) ?? 0;
            }
            boardContents.push(
              s(
                'segment',
                s('start', line.start.x, line.start.y),
                s('end', line.end.x, line.end.y),
                s('width', line.strokeWidth),
                s('locked', line.locked ? yes() : no()),
                s('layer', line.layer),
                s('net', segNetCode),
                s('uuid', line.uuid),
              ),
            );
          } else {
            boardContents.push(
              s(
                'gr_line',
                s('start', line.start.x, line.start.y),
                s('end', line.end.x, line.end.y),
                s('stroke', s('width', line.strokeWidth), s('type', sym('default'))),
                s('layer', line.layer),
                s('uuid', line.uuid),
              ),
            );
          }
        } else if (element.type === 'arc') {
          const arc = element as IGrArc;
          boardContents.push(
            s(
              'gr_arc',
              s('start', arc.start.x, arc.start.y),
              s('mid', arc.mid.x, arc.mid.y),
              s('end', arc.end.x, arc.end.y),
              s('stroke', s('width', arc.strokeWidth), s('type', sym('default'))),
              s('layer', arc.layer),
              s('uuid', arc.uuid),
            ),
          );
        } else if (element.type === 'circle') {
          const circle = element as IGrCircle;
          const circleChildren: SExpr[] = [
            s('center', circle.center.x, circle.center.y),
            s('end', circle.end.x, circle.end.y),
            s('stroke', s('width', circle.strokeWidth), s('type', sym('default'))),
            s('layer', circle.layer),
          ];
          if (circle.fill) circleChildren.push(s('fill', sym('solid')));
          circleChildren.push(s('uuid', circle.uuid));
          boardContents.push(s('gr_circle', ...circleChildren));
        } else if (element.type === 'rect') {
          const rect = element as IGrRect;
          const rectChildren: SExpr[] = [
            s('start', rect.start.x, rect.start.y),
            s('end', rect.end.x, rect.end.y),
            s('stroke', s('width', rect.strokeWidth), s('type', sym('default'))),
            s('layer', rect.layer),
          ];
          if (rect.fill) rectChildren.push(s('fill', sym('solid')));
          rectChildren.push(s('uuid', rect.uuid));
          boardContents.push(s('gr_rect', ...rectChildren));
        } else if (element.type === 'poly') {
          const poly = element as IGrPoly;
          const ptsChildren = poly.points.map((pt: { x: number; y: number }) => s('xy', pt.x, pt.y));
          const polyChildren: SExpr[] = [
            s('pts', ...ptsChildren),
            s('stroke', s('width', poly.strokeWidth), s('type', sym('default'))),
            s('layer', poly.layer),
          ];
          if (poly.fill) polyChildren.push(s('fill', sym('solid')));
          polyChildren.push(s('uuid', poly.uuid));
          boardContents.push(s('gr_poly', ...polyChildren));
        }
      } catch (e: unknown) {
        logger.error(
          `Error: Failed to build outline element for UUID ${element.uuid}: ${getErrorMessage(e)}${formatCallSite(getCallSite())}`,
        );
      }
    }
  }
}

export function renderGraphics(pcb: PCB, boardContents: SExpr[]): void {
  const state = getPcbState(pcb);
  for (const textElement of state.grTexts) {
    const fontChildren: SExpr[] = [];
    if (textElement.font) fontChildren.push(s('face', textElement.font));
    const width = textElement.width ?? 1.27;
    const height = textElement.height ?? 1.27;
    fontChildren.push(s('size', height, width));
    if (textElement.thickness !== undefined) fontChildren.push(s('thickness', textElement.thickness));
    if (textElement.bold) fontChildren.push(sym('bold'));
    if (textElement.italic) fontChildren.push(sym('italic'));

    const effectsChildren: SExpr[] = [s('font', ...fontChildren)];
    const justifyChildren: SExpr[] = [];
    if (textElement.justify?.horizontal) justifyChildren.push(sym(textElement.justify.horizontal));
    if (textElement.justify?.vertical) justifyChildren.push(sym(textElement.justify.vertical));
    if (textElement.justify?.mirror ?? false) justifyChildren.push(sym('mirror'));
    effectsChildren.push(s('justify', ...justifyChildren));
    if (textElement.hide) effectsChildren.push(sym('hide'));

    try {
      boardContents.push(
        s(
          'gr_text',
          textElement.text,
          s('at', textElement.x ?? 0, textElement.y ?? 0, textElement.rotation ?? 0),
          s('layer', textElement.layer ?? 'F.SilkS'),
          s('uuid', textElement.uuid ?? ''),
          s('effects', ...effectsChildren),
        ),
      );
    } catch (e: unknown) {
      logger.error(
        `Error: Failed to build gr_text node for UUID ${textElement.uuid}: ${getErrorMessage(e)}${formatCallSite(getCallSite())}`,
      );
    }
  }

  for (const line of state.grLines) {
    const children: SExpr[] = [
      s('start', line.start.x, line.start.y),
      s('end', line.end.x, line.end.y),
      s('stroke', s('width', line.strokeWidth), s('type', sym('default'))),
      s('layer', line.layer),
      s('uuid', line.uuid),
    ];
    if (line.locked) children.push(s('locked', yes()));
    boardContents.push(s('gr_line', ...children));
  }

  for (const circle of state.grCircles) {
    const children: SExpr[] = [
      s('center', circle.center.x, circle.center.y),
      s('end', circle.end.x, circle.end.y),
      s('stroke', s('width', circle.strokeWidth), s('type', sym('default'))),
      s('layer', circle.layer),
    ];
    if (circle.fill) children.push(s('fill', sym('solid')));
    children.push(s('uuid', circle.uuid));
    if (circle.locked) children.push(s('locked', yes()));
    boardContents.push(s('gr_circle', ...children));
  }

  for (const rect of state.grRects) {
    const children: SExpr[] = [
      s('start', rect.start.x, rect.start.y),
      s('end', rect.end.x, rect.end.y),
      s('stroke', s('width', rect.strokeWidth), s('type', sym('default'))),
      s('layer', rect.layer),
    ];
    if (rect.fill) children.push(s('fill', sym('solid')));
    children.push(s('uuid', rect.uuid));
    if (rect.locked) children.push(s('locked', yes()));
    boardContents.push(s('gr_rect', ...children));
  }

  for (const poly of state.grPolys) {
    const ptsChildren = poly.points.map((pt: { x: number; y: number }) => s('xy', pt.x, pt.y));
    const children: SExpr[] = [
      s('pts', ...ptsChildren),
      s('stroke', s('width', poly.strokeWidth), s('type', sym('default'))),
      s('layer', poly.layer),
    ];
    if (poly.fill) children.push(s('fill', sym('solid')));
    children.push(s('uuid', poly.uuid));
    if (poly.locked) children.push(s('locked', yes()));
    boardContents.push(s('gr_poly', ...children));
  }
}

export function renderZones(
  zones: IFilledZone[],
  pcb: PCB,
  boardNetNameToCodeMap: Map<string, number>,
  boardContents: SExpr[],
): void {
  for (const zone of zones) {
    let netCode = 0;
    let netName = '';

    if (zone.net) {
      const parts = zone.net.split(':');
      const identifier = parts[0];

      if (identifier === 'pin' && parts.length === 3) {
        const reference = parts[1];
        const pinNumber = parts[2];
        const netResolution = pcbResolveNet(pcb, reference, pinNumber, undefined, boardNetNameToCodeMap);
        netCode = netResolution.netCode;
        netName = netResolution.netName;
      } else if (identifier === 'net' && parts.length === 2) {
        const searchNetName = parts[1];
        if (pcb.schematic && pcb.schematic.nodes) {
          const foundNet = pcb.schematic.nodes.find((node: ISchematicNode) => {
            let nodeName = node.name.toLowerCase();
            let searchName = searchNetName.toLowerCase();
            if (nodeName.startsWith('/')) nodeName = nodeName.substring(1);
            if (searchName.startsWith('/')) searchName = searchName.substring(1);
            return nodeName === searchName;
          });

          if (foundNet) {
            netCode = foundNet.code;
            netName = foundNet.name;
          } else {
            const lookupKey = searchNetName.toLowerCase().replace(/^\//, '');
            if (boardNetNameToCodeMap.has(lookupKey)) {
              netCode = boardNetNameToCodeMap.get(lookupKey)!;
              netName = searchNetName;
            } else {
              logger.error(
                `[PCB ZONE] ERROR: Net "${searchNetName}" not found in schematic or board${formatCallSite(getCallSite())}`,
              );
            }
          }
        }
      }
    }

    const zoneChildren: SExpr[] = [s('net', netCode), s('net_name', netName), s('layers', ...zone.layers)];
    if (zone.name) zoneChildren.push(s('name', zone.name));
    zoneChildren.push(s('uuid', zone.uuid));
    if (zone.locked) zoneChildren.push(sym('locked'));
    if (zone.priority !== undefined && zone.priority !== 0) zoneChildren.push(s('priority', zone.priority));
    zoneChildren.push(s('hatch', sym(zone.hatchStyle ?? 'none'), zone.hatchPitch ?? 0));

    if (zone.connectPads === 'thru_hole_only') {
      zoneChildren.push(s('connect_pads', sym('thru_hole_only'), s('clearance', zone.clearance ?? 0)));
    } else if (zone.connectPads === 'full') {
      zoneChildren.push(s('connect_pads', yes(), s('clearance', zone.clearance ?? 0)));
    } else if (zone.connectPads === 'no') {
      zoneChildren.push(s('connect_pads', sym('no'), s('clearance', zone.clearance ?? 0)));
    } else {
      zoneChildren.push(s('connect_pads', s('clearance', zone.clearance ?? 0)));
    }

    zoneChildren.push(s('min_thickness', zone.minThickness ?? 0));
    if (zone.filledAreasThickness !== undefined) {
      zoneChildren.push(s('filled_areas_thickness', zone.filledAreasThickness ? yes() : no()));
    }

    if (zone.filled !== false) {
      const fillChildren: SExpr[] = [yes()];
      // KiCad's fill mode tokens are `hatch` (hatched), `polygon` (solid),
      // and `segment` (legacy) — the API's 'hatched' maps to `hatch`, and
      // solid zones omit the mode (KiCad's default).
      if (zone.fillMode === 'hatched') fillChildren.push(s('mode', sym('hatch')));
      if (zone.fillArcSegments !== undefined) fillChildren.push(s('arc_segments', zone.fillArcSegments));
      fillChildren.push(s('thermal_gap', zone.thermalGap ?? 0));
      fillChildren.push(s('thermal_bridge_width', zone.thermalBridgeWidth ?? 0));
      if (zone.smoothing && zone.smoothing !== 'none' && zone.smoothingRadius !== undefined) {
        fillChildren.push(s('smoothing', sym(zone.smoothing)));
        fillChildren.push(s('radius', zone.smoothingRadius));
      }
      if (zone.islandRemovalMode !== undefined) {
        fillChildren.push(s('island_removal_mode', zone.islandRemovalMode));
        if (zone.islandRemovalMode === 2 && zone.islandAreaMin !== undefined) {
          fillChildren.push(s('island_area_min', zone.islandAreaMin));
        }
      }
      if (zone.fillMode === 'hatched') {
        if (zone.hatchThickness !== undefined) fillChildren.push(s('hatch_thickness', zone.hatchThickness));
        if (zone.hatchGap !== undefined) fillChildren.push(s('hatch_gap', zone.hatchGap));
        if (zone.hatchOrientation !== undefined) fillChildren.push(s('hatch_orientation', zone.hatchOrientation));
        if (zone.hatchSmoothingLevel !== undefined)
          fillChildren.push(s('hatch_smoothing_level', zone.hatchSmoothingLevel));
        if (zone.hatchSmoothingValue !== undefined)
          fillChildren.push(s('hatch_smoothing_value', zone.hatchSmoothingValue));
        if (zone.hatchBorderAlgorithm) fillChildren.push(s('hatch_border_algorithm', zone.hatchBorderAlgorithm));
        if (zone.hatchMinHoleArea !== undefined) fillChildren.push(s('hatch_min_hole_area', zone.hatchMinHoleArea));
      }
      zoneChildren.push(s('fill', ...fillChildren));
    }

    const ptsChildren = zone.polygon.map((pt) => s('xy', pt.x, pt.y));
    zoneChildren.push(s('polygon', s('pts', ...ptsChildren)));

    boardContents.push(s('zone', ...zoneChildren));
  }
}

export function renderKeepoutZones(zones: IKeepoutZone[], boardContents: SExpr[]): void {
  for (const zone of zones) {
    const restrictions = zone.restrictions || {};
    const tracksAllowed = restrictions.tracks ? 'not_allowed' : 'allowed';
    const viasAllowed = restrictions.vias ? 'not_allowed' : 'allowed';
    const padsAllowed = restrictions.pads ? 'not_allowed' : 'allowed';
    const copperpourAllowed = restrictions.copperpour ? 'not_allowed' : 'allowed';
    const footprintsAllowed = restrictions.footprints ? 'not_allowed' : 'allowed';

    const hatchStyle = zone.hatchStyle || 'edge';
    const hatchPitch = zone.hatchPitch || 0.508;

    const zoneChildren: SExpr[] = [s('net', 0), s('net_name', ''), s('layers', ...zone.layers)];
    if (zone.name) zoneChildren.push(s('name', zone.name));
    zoneChildren.push(s('uuid', zone.uuid));
    if (zone.locked) zoneChildren.push(sym('locked'));
    if (zone.priority !== undefined && zone.priority !== 0) zoneChildren.push(s('priority', zone.priority));
    zoneChildren.push(s('hatch', sym(hatchStyle), hatchPitch));
    zoneChildren.push(
      s(
        'keepout',
        s('tracks', sym(tracksAllowed)),
        s('vias', sym(viasAllowed)),
        s('pads', sym(padsAllowed)),
        s('copperpour', sym(copperpourAllowed)),
        s('footprints', sym(footprintsAllowed)),
      ),
    );
    if (zone.placement !== undefined) {
      zoneChildren.push(s('placement', s('enabled', zone.placement ? yes() : no()), s('sheetname', '')));
    }

    const ptsChildren = zone.polygon.map((pt) => s('xy', pt.x, pt.y));
    zoneChildren.push(s('polygon', s('pts', ...ptsChildren)));

    boardContents.push(s('zone', ...zoneChildren));
  }
}

function ensureSingleVersionNode(boardContents: SExpr[], defaultVersion: SExpr): void {
  const existingArrayNode = boardContents.find((item) => Array.isArray(item) && nameOf(item[0]) === 'version');
  const existingStringNode = boardContents.find(
    (item) => typeof item === 'string' && (item as string).startsWith('(version '),
  );

  const definitiveVersionNode: SExpr = existingArrayNode ?? existingStringNode ?? defaultVersion;

  for (let i = boardContents.length - 1; i >= 0; i--) {
    const item = boardContents[i];
    if (
      (Array.isArray(item) && nameOf(item[0]) === 'version') ||
      (typeof item === 'string' && (item as string).startsWith('(version '))
    ) {
      boardContents.splice(i, 1);
    }
  }

  boardContents.unshift(definitiveVersionNode);
}

/**
 * Replace any existing `(setup ...)` node with `setupNode`, or insert one at
 * the correct position (after `layers`/`paper`/`general`, before `net`/footprints).
 * Mirrors `ensureSingleVersionNode` but preserves document ordering.
 */
export function ensureSingleSetupNode(boardContents: SExpr[], setupNode: SExpr): void {
  let setupIdx = -1;
  for (let i = boardContents.length - 1; i >= 0; i--) {
    const item = boardContents[i];
    if (Array.isArray(item) && nameOf(item[0]) === 'setup') {
      setupIdx = i;
      boardContents[i] = setupNode;
    }
  }
  if (setupIdx === -1) {
    // No existing setup — insert after the last of these markers.
    const markers = ['layers', 'paper', 'general', 'generator_version', 'generator', 'version'];
    let insertAt = 0;
    for (let i = 0; i < boardContents.length; i++) {
      const t = extractNodeName(boardContents[i]);
      if (markers.includes(t)) insertAt = i + 1;
    }
    boardContents.splice(insertAt, 0, setupNode);
  }
}

/**
 * Replace any existing `(layers ...)` node with `layersNode`, or insert one
 * after `paper`/`general` if none exists.
 */
export function ensureSingleLayersNode(boardContents: SExpr[], layersNode: SExpr): void {
  let found = false;
  for (let i = boardContents.length - 1; i >= 0; i--) {
    const item = boardContents[i];
    if (Array.isArray(item) && nameOf(item[0]) === 'layers') {
      if (!found) {
        boardContents[i] = layersNode;
        found = true;
      } else {
        boardContents.splice(i, 1); // remove duplicates
      }
    }
  }
  if (!found) {
    // Insert after paper/general, before setup if present.
    const markers = ['paper', 'general', 'generator_version', 'generator', 'version'];
    let insertAt = 0;
    for (let i = 0; i < boardContents.length; i++) {
      const t = extractNodeName(boardContents[i]);
      if (markers.includes(t)) insertAt = i + 1;
    }
    boardContents.splice(insertAt, 0, layersNode);
  }
}

function extractNodeName(item: SExpr): string {
  if (Array.isArray(item) && item.length > 0) return nameOf(item[0]);
  return '';
}

export function serializeAndWriteBoard(pcb: PCB, boardContents: SExpr[], defaultVersion: SExpr): void {
  ensureSingleVersionNode(boardContents, defaultVersion);

  const finalStructure: SExpr = [sym('kicad_pcb'), ...boardContents];

  try {
    if (process.env.TYPECAD_DEBUG === '1') {
      runDiagnostics(pcb, boardContents);
    }

    const serialized = serialize(finalStructure, { pretty: true });

    try {
      logger.debug(
        '[BoardCreation][DIAG] serialized contains (segment=' +
          serialized.includes('(segment') +
          ', gr_line=' +
          serialized.includes('(gr_line') +
          ')',
      );
    } catch {
      logger.debug('[BoardCreation][DIAG] Failed to log serialized diagnostics');
    }

    const state = getPcbState(pcb);
    state.pcb = serialized;

    try {
      if (process.env.TYPECAD_DEBUG_BOARD_WRITE === '1') {
        const debugPath = `./build/${pcb.boardName}.debug.kicad_pcb`;
        fs.writeFileSync(debugPath, state.pcb, { encoding: 'utf8' });
        const debugContents = fs.readFileSync(debugPath, { encoding: 'utf8' });
        logger.debug(`[BoardCreation][DIAG] debug file written: ${debugPath}, length=${debugContents.length}`);
      }
    } catch (e) {
      logger.error(`[BoardCreation][DIAG] Could not write/read debug PCB file: ${String(e)}`);
    }
  } catch (e: unknown) {
    logger.error(
      ` Error: Failed to serialize final board structure: ${getErrorMessage(e)}${formatCallSite(getCallSite())}`,
    );
    getPcbState(pcb).pcb = '';
    return;
  }

  const boardFilePath = `./build/${pcb.boardName}.kicad_pcb`;
  const state = getPcbState(pcb);

  try {
    fs.writeFileSync(boardFilePath, state.pcb);

    try {
      const fileContents = fs.readFileSync(boardFilePath, { encoding: 'utf8' });
      const hasSegments = fileContents.includes('(segment');
      const hasGrLines = fileContents.includes('(gr_line');
      logger.debug(`[BoardCreation][VERIFY] file contains segments=${hasSegments}, gr_lines=${hasGrLines}`);

      const stagedElementUuids = state.stagedOutlines
        .slice(0, 10)
        .flatMap((o: IOutline) => (o.elements ?? []).map((el: OutlineElement) => el.uuid))
        .filter(Boolean);
      const foundElementUuids = stagedElementUuids.filter((u: string) => fileContents.includes(u));
      logger.debug(
        `[BoardCreation][VERIFY] staged ELEMENT UUIDs present in file: ${foundElementUuids.length}/${stagedElementUuids.length}`,
      );
      if (foundElementUuids.length < stagedElementUuids.length) {
        logger.warn('[BoardCreation][VERIFY] Some staged ELEMENT UUIDs were not found in written board file.');
      }
    } catch (e: unknown) {
      logger.error(`[BoardCreation][VERIFY] Error while verifying written board file: ${getErrorMessage(e)}`);
    }

    setPendingBoardFilePath(boardFilePath);
  } catch (err: unknown) {
    logger.error(
      `Error: Could not write board file ${boardFilePath}: ${getErrorMessage(err)}${formatCallSite(getCallSite())}`,
    );
  }
}

function runDiagnostics(pcb: PCB, boardContents: SExpr[]): void {
  const state = getPcbState(pcb);
  try {
    try {
      const stagedUuids = state.stagedOutlines.map((o: IOutline) => o.uuid).filter(Boolean);
      const missingInFinal = stagedUuids.filter((u: string) => !JSON.stringify(boardContents).includes(u));
      if (missingInFinal.length > 0) {
        for (const miss of missingInFinal) {
          const so = state.stagedOutlines.find((o: IOutline) => o.uuid === miss);
          logger.debug(`[BoardCreation][DIAG] missing outline ${miss}: fullOutline=${JSON.stringify(so)}`);
        }
      } else {
        logger.debug('[BoardCreation][DIAG] all staged outlines present in final_board_contents');
      }
    } catch {
      logger.debug('[BoardCreation][DIAG] diagnostic block failed');
    }
  } catch {
    logger.debug('[BoardCreation][DIAG] outer diagnostic block failed');
  }
}
