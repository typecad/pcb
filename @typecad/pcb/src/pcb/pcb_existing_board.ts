import { Component } from '../component.js';
import { parseAsList, nameOf, sym } from '../sexpr/index.js';
import type { SExpr } from '../sexpr/types.js';
import { PCB, getPcbState, pcbResolveNet } from './pcb.js';
import { normalizeNetName, formatCallSite, getErrorMessage } from './pcb_utils.js';
import { updateFootprintNode } from './pcb_footprint.js';
import { reportError } from '../utils/error_reporter.js';
import logger from '../utils/logging.js';

export interface ExistingBoardResult {
  boardContents: SExpr[];
  boardNetNameToCodeMap: Map<string, number>;
  componentMap: Map<string, Component>;
}

function stripQuotes(val: string): string {
  if (val.startsWith('`') && val.endsWith('`')) return val.substring(1, val.length - 1);
  if (val.startsWith('"') && val.endsWith('"')) return val.substring(1, val.length - 1);
  return val;
}

function extractItemType(item: SExpr): string {
  if (Array.isArray(item) && item.length > 0) {
    return nameOf(item[0]);
  }
  if (typeof item === 'string' && item.startsWith('(')) {
    try {
      const parsed = parseAsList(item);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return nameOf(parsed[0]);
      }
    } catch {
      logger.debug('[ExistingBoard] Failed to parse item for name extraction');
    }
  }
  return '';
}

const EXCLUDED_FROM_BOARD = new Set([
  'footprint',
  'group',
  'gr_rect',
  'gr_line',
  'gr_arc',
  'gr_circle',
  'gr_poly',
  'gr_text',
  'via',
  'segment',
  'zone',
  'generator',
  'generator_version',
]);

function buildBoardContentsFromExisting(existingElements: SExpr[], headerItems: SExpr[]): SExpr[] {
  const contents: SExpr[] = [];

  for (const item of existingElements.slice(1)) {
    if (typeof item === 'string' && item.startsWith('(')) {
      try {
        contents.push(parseAsList(item));
      } catch {
        contents.push(item);
      }
    } else if (Array.isArray(item) && item.length > 0) {
      const nodeType = nameOf(item[0]);

      if (nodeType === 'net' && item.length >= 3 && !isNaN(Number(item[1]))) {
        contents.push(item);
      } else if (!EXCLUDED_FROM_BOARD.has(nodeType)) {
        contents.push(item);
      }
    }
  }

  for (const header of headerItems) {
    const headerSymbol = Array.isArray(header) ? nameOf(header[0]) : '';
    const alreadyPresent = contents.some(
      (item) =>
        (typeof item === 'string' && (item as string).includes(`(${headerSymbol}`)) ||
        (Array.isArray(item) && nameOf(item[0]) === headerSymbol),
    );
    if (!alreadyPresent) {
      contents.unshift(header);
    }
  }

  return contents;
}

function buildEmptyBoardContents(headerItems: SExpr[]): SExpr[] {
  return [...headerItems];
}

export function parseExistingBoard(
  pcb: PCB,
  headerItems: SExpr[],
  componentMap: Map<string, Component>,
): ExistingBoardResult {
  const boardNetNameToCodeMap = new Map<string, number>();

  let existingBoardContents: SExpr[] = [];
  const state = getPcbState(pcb);
  if (state.existingBoardElements.length > 0) {
    existingBoardContents = [sym('kicad_pcb'), ...(state.existingBoardElements as SExpr[])];
  }

  let boardContents: SExpr[];

  if (existingBoardContents.length > 1) {
    boardContents = buildBoardContentsFromExisting(existingBoardContents, headerItems);

    for (const item of boardContents) {
      if (Array.isArray(item) && nameOf(item[0]) === 'net') {
        const netCode = Number(item[1]);
        let netName = String(item[2]);
        netName = stripQuotes(netName);
        let normalizedName = netName.toLowerCase();
        if (normalizedName.startsWith('/')) normalizedName = normalizedName.substring(1);
        if (normalizedName) {
          boardNetNameToCodeMap.set(normalizedName, netCode);
        }
      }
    }
  } else {
    boardContents = buildEmptyBoardContents(headerItems);
  }

  return { boardContents, boardNetNameToCodeMap, componentMap };
}

export function insertNetsIntoBoardContents(boardContents: SExpr[], allNets: SExpr[]): SExpr[] {
  if (allNets.length === 0) return boardContents;

  const contentsWithoutNets = boardContents.filter((item) => {
    if (Array.isArray(item) && nameOf(item[0]) === 'net') return false;
    if (typeof item === 'string' && (item as string).trim().startsWith('(net ')) {
      try {
        const parsed = parseAsList(item);
        if (Array.isArray(parsed) && parsed[0] && nameOf(parsed[0]) === 'net') return false;
      } catch {
        logger.debug('[ExistingBoard] Failed to parse string element as net');
      }
    }
    return true;
  });

  let insertionIndex = -1;
  const preferredOrderMarkers = ['setup', 'layers', 'paper', 'general', 'generator_version', 'generator', 'version'];

  for (const marker of preferredOrderMarkers) {
    for (let i = 0; i < contentsWithoutNets.length; i++) {
      const itemType = extractItemType(contentsWithoutNets[i]);
      if (itemType === marker) {
        insertionIndex = i + 1;
      }
    }
    if (insertionIndex !== -1 && marker === 'setup') break;
  }

  if (insertionIndex === -1) {
    let count = 0;
    const initialHeaders = ['version', 'generator', 'generator_version', 'general', 'paper', 'layers', 'setup'];
    for (let i = 0; i < contentsWithoutNets.length; ++i) {
      const itemType = extractItemType(contentsWithoutNets[i]);
      if (initialHeaders.includes(itemType)) count = i + 1;
      else break;
    }
    insertionIndex =
      count > 0 ? count : contentsWithoutNets.findIndex((item) => typeof item !== 'string' || !item.startsWith('('));
    if (insertionIndex === -1) insertionIndex = contentsWithoutNets.length;
  }

  contentsWithoutNets.splice(insertionIndex, 0, ...allNets);
  return contentsWithoutNets;
}

export function processExistingFootprints(
  existingBoardElements: SExpr[],
  pcb: PCB,
  componentMap: Map<string, Component>,
  boardNetNameToCodeMap: Map<string, number>,
  boardContents: SExpr[],
): void {
  if (existingBoardElements.length === 0) return;

  const existingBoardArr = [sym('kicad_pcb'), ...existingBoardElements];

  for (const item of existingBoardArr.slice(1)) {
    if (!Array.isArray(item) || nameOf(item[0]) !== 'footprint') continue;

    let uuid: string | null = null;
    let existingAtNode: SExpr[] | null = null;

    for (const subItem of item) {
      if (Array.isArray(subItem)) {
        if (nameOf(subItem[0]) === 'uuid' && typeof subItem[1] === 'string') {
          uuid = subItem[1].replace(/[`"]/g, '');
        } else if (nameOf(subItem[0]) === 'at' && subItem.length >= 3) {
          existingAtNode = subItem as SExpr[];
        }
      }
      if (uuid && existingAtNode) break;
    }
    if (uuid && !existingAtNode) {
      for (const subItem of item) {
        if (Array.isArray(subItem) && nameOf(subItem[0]) === 'at' && subItem.length >= 3) {
          existingAtNode = subItem as SExpr[];
          break;
        }
      }
    }

    if (uuid && componentMap.has(uuid)) {
      const component = componentMap.get(uuid)!;

      if (existingAtNode) {
        const existingX = parseFloat(String(existingAtNode[1]));
        const existingY = parseFloat(String(existingAtNode[2]));
        let existingRotation = 0;
        if (existingAtNode.length > 3 && typeof existingAtNode[3] !== 'undefined') {
          const parsedRot = parseFloat(String(existingAtNode[3]));
          if (!isNaN(parsedRot)) existingRotation = parsedRot;
        }

        if (!isNaN(existingX) && !isNaN(existingY)) {
          component.pcb.x = existingX;
          component.pcb.y = existingY;
          component.pcb.rotation = existingRotation;
        } else {
          component.pcb.rotation = component.pcb.rotation ?? 0;
        }
      } else {
        component.pcb.rotation = component.pcb.rotation ?? 0;
      }

      try {
        for (const subItem of item) {
          if (Array.isArray(subItem) && nameOf(subItem[0]) === 'pad') {
            for (const padSubItem of subItem) {
              if (Array.isArray(padSubItem) && nameOf(padSubItem[0]) === 'at') {
                if (padSubItem.length === 3) {
                  padSubItem.push(component.pcb.rotation);
                } else if (padSubItem.length === 4) {
                  padSubItem[3] = component.pcb.rotation - parseFloat(String(padSubItem[3]));
                }
              }
            }
          }
        }

        const updatedNode = updateFootprintNode(
          item as SExpr[],
          component,
          (ref, pin, uuidVal, map) => pcbResolveNet(pcb, ref, pin, uuidVal, map),
          boardNetNameToCodeMap,
        );
        boardContents.push(updatedNode);
        componentMap.delete(uuid);
      } catch (e: unknown) {
        reportError(
          `Failed to update footprint node for ${component.reference || uuid}: ${getErrorMessage(e)}`,
          component,
        );
      }
    } else {
      if (!pcb.options.remove_orphans) {
        boardContents.push(item);
      }
    }
  }
}
