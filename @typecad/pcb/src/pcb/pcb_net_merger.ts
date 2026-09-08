import { parseAsList, s, nameOf } from '../sexpr/index.js';
import type { SExpr } from '../sexpr/types.js';
import type { ISchematicNode } from '../types/schematic_types.js';
import { Schematic } from '../schematic.js';
import { IVia } from './pcb_interfaces.js';
import { normalizeNetName } from './pcb_utils.js';
import logger from '../utils/logging.js';

export interface NetMergeResult {
  allNets: SExpr[];
  boardNetNameToCodeMap: Map<string, number>;
}

function getNextAvailableNetId(currentMax: number, usedSet: Set<number>): number {
  let id = currentMax + 1;
  while (usedSet.has(id)) {
    id++;
  }
  return id;
}

function collectExistingNets(
  boardContents: SExpr[],
  existingNets: Map<string, SExpr[]>,
  existingNetCodes: Set<number>,
): void {
  for (const item of boardContents) {
    if (Array.isArray(item) && nameOf(item[0]) === 'net') {
      const netCode = parseInt(String(item[1]));
      const netName = String(item[2] || '').replace(/["`]/g, '');
      if (!isNaN(netCode)) {
        existingNets.set(`${netCode}:${netName}`, item as SExpr[]);
        existingNetCodes.add(netCode);
      }
    } else if (typeof item === 'string' && item.trim().startsWith('(net ')) {
      try {
        const parsedItem = parseAsList(item);
        if (Array.isArray(parsedItem) && nameOf(parsedItem[0]) === 'net') {
          const netCode = parseInt(String(parsedItem[1]));
          const netName = String(parsedItem[2] || '').replace(/["`]/g, '');
          if (!isNaN(netCode)) {
            existingNets.set(`${netCode}:${netName}`, parsedItem);
            existingNetCodes.add(netCode);
          }
        }
      } catch {
        logger.debug('[NetMerger] Failed to parse existing net element, skipping');
      }
    }
  }
}

export function mergeNets(
  schematic: Schematic | undefined,
  schematicNodes: ISchematicNode[] | undefined,
  existingBoardContents: SExpr[],
  viaMap: Map<string, IVia>,
): NetMergeResult {
  const boardNetNameToCodeMap = new Map<string, number>();

  const schematicNetDefinitions: SExpr[] = [];
  if (!schematic) {
    logger.warn('[PCB CREATE] Warning: No schematic provided. Net information will be limited to existing board nets.');
  } else if (schematicNodes) {
    for (const schematicNet of schematicNodes) {
      schematicNetDefinitions.push(s('net', schematicNet.code, schematicNet.name));
    }
  }

  const existingNets = new Map<string, SExpr[]>();
  const existingNetCodes = new Set<number>();
  collectExistingNets(existingBoardContents, existingNets, existingNetCodes);

  const finalNetDefinitionsByName = new Map<string, SExpr[]>();
  const mergedNetCodes = new Set<number>();

  const boardNetsProcessedByName = new Map<string, SExpr[]>();
  if (existingNets.size > 0) {
    const sortedExistingNetDefs = Array.from(existingNets.values()).sort(
      (a, b) => parseInt(String(a[1])) - parseInt(String(b[1])),
    );
    for (const netDef of sortedExistingNetDefs) {
      const name = String(netDef[2]).replace(/[`"]/g, '');
      const normalizedName = normalizeNetName(name) ?? name.toLowerCase();
      if (!boardNetsProcessedByName.has(normalizedName)) {
        boardNetsProcessedByName.set(normalizedName, netDef);
      }
    }
  }

  for (const [normalizedName, netDef] of boardNetsProcessedByName) {
    const code = parseInt(String(netDef[1]));
    finalNetDefinitionsByName.set(normalizedName, netDef);
    mergedNetCodes.add(code);
  }

  let maxCodeInUse = 0;
  for (const c of mergedNetCodes) {
    maxCodeInUse = Math.max(maxCodeInUse, c);
  }
  for (const schNet of schematicNetDefinitions) {
    maxCodeInUse = Math.max(maxCodeInUse, parseInt(String((schNet as SExpr[])[1])));
  }

  for (const schematicNetDef of schematicNetDefinitions) {
    const netDefArray = schematicNetDef as SExpr[];
    const originalSchCode = parseInt(String(netDefArray[1]));
    const schNameSExpr = netDefArray[2] as string;
    const schName = String(schNameSExpr).replace(/[`"]/g, '');
    const normalizedSchName = normalizeNetName(schName);
    if (!normalizedSchName) continue;

    if (finalNetDefinitionsByName.has(normalizedSchName)) {
      const boardDef = finalNetDefinitionsByName.get(normalizedSchName)!;
      const boardCode = parseInt(String(boardDef[1]));
      boardNetNameToCodeMap.set(normalizedSchName, boardCode);
    } else {
      let finalCode = originalSchCode;
      if (mergedNetCodes.has(originalSchCode)) {
        finalCode = getNextAvailableNetId(maxCodeInUse, mergedNetCodes);
        maxCodeInUse = finalCode;
      }
      const newNetDefArray = s('net', finalCode, schNameSExpr) as SExpr[];
      finalNetDefinitionsByName.set(normalizedSchName, newNetDefArray);
      mergedNetCodes.add(finalCode);
      boardNetNameToCodeMap.set(normalizedSchName, finalCode);
    }
  }

  const viaNetNames = new Map<string, string>();
  viaMap.forEach((viaData) => {
    if (viaData.net && typeof viaData.net === 'string' && viaData.net.trim().length > 0) {
      const normalized = normalizeNetName(viaData.net);
      if (normalized && !viaNetNames.has(normalized)) {
        viaNetNames.set(normalized, viaData.net);
      }
    }
  });

  const formatNetNameForSExpr = (name: string): string => String(name ?? '').replace(/[`"]/g, '');

  viaNetNames.forEach((originalName, normalizedName) => {
    if (finalNetDefinitionsByName.has(normalizedName)) {
      return;
    }
    const newCode = getNextAvailableNetId(maxCodeInUse, mergedNetCodes);
    maxCodeInUse = newCode;
    const newNetDefArray = s('net', newCode, formatNetNameForSExpr(originalName)) as SExpr[];
    finalNetDefinitionsByName.set(normalizedName, newNetDefArray);
    mergedNetCodes.add(newCode);
    boardNetNameToCodeMap.set(normalizedName, newCode);
  });

  const emptyNetNormalizedKey = '';
  if (!finalNetDefinitionsByName.has(emptyNetNormalizedKey)) {
    if (!mergedNetCodes.has(0)) {
      finalNetDefinitionsByName.set(emptyNetNormalizedKey, s('net', 0, '') as SExpr[]);
      mergedNetCodes.add(0);
      boardNetNameToCodeMap.set(emptyNetNormalizedKey, 0);
    } else {
      logger.error(
        '[Net Create] Cannot add (net 0 "") because code 0 is already in use by a named net. PCB might be invalid.',
      );
    }
  } else {
    const def = finalNetDefinitionsByName.get(emptyNetNormalizedKey)!;
    const currentCodeForEmptyNet = parseInt(String(def[1]));
    if (currentCodeForEmptyNet !== 0) {
      if (!mergedNetCodes.has(0)) {
        mergedNetCodes.delete(currentCodeForEmptyNet);
        def[1] = 0;
        mergedNetCodes.add(0);
        boardNetNameToCodeMap.set(emptyNetNormalizedKey, 0);
      } else {
        logger.error(
          `[Net Create] Net "" exists with code ${currentCodeForEmptyNet}, but code 0 is taken. PCB might be invalid.`,
        );
      }
    }
  }

  const allNets: SExpr[] = Array.from(finalNetDefinitionsByName.values()).sort(
    (a, b) => parseInt(String(a[1])) - parseInt(String(b[1])),
  );

  return { allNets, boardNetNameToCodeMap };
}
