/**
 * Net Resolution Module
 *
 * Extracted from the PCB class's #resolveNet private method.
 * Provides standalone net resolution for component pins and vias,
 * looking up schematic nets and mapping them to board net codes.
 */
import type { INetResolution } from './pcb_interfaces.js';
import type { ISchematicNode } from '../types/schematic_types.js';
import type { Schematic } from '../schematic.js';
import type { Pin } from '../pin.js';
import { normalizeNetName } from './pcb_utils.js';

/**
 * Resolves the net assignment for a component pin or via.
 *
 * @param schematic - The schematic instance containing net definitions
 * @param componentReference - The reference designator of the component (e.g., "R1", "U1")
 * @param pinNumber - The pin number or name (e.g., "1", "2", "VCC")
 * @param componentUuid - Optional UUID for via lookup (used when componentReference represents a via)
 * @param boardNetNameToCodeMap - Map of existing board net names to their codes
 * @param fallbackNetName - Optional fallback net name if not found in schematic
 * @returns Net resolution result containing net code, name, and status
 */
export function resolveNet(
  schematic: Schematic | undefined,
  componentReference: string,
  pinNumber: string,
  componentUuid?: string,
  boardNetNameToCodeMap?: Map<string, number>,
  fallbackNetName?: string,
): INetResolution {
  let foundInSchematic = false;
  let schematicNetCode: number | undefined;
  let schematicNetName: string | undefined;

  // Try to find the pin in the schematic nets
  if (schematic && schematic.nodes) {
    for (const schematicNode of schematic.nodes as ISchematicNode[]) {
      if (schematicNode.nodes) {
        // For vias, look for UUID match with pin number "1"
        // For regular components, look for reference + pin number match
        const pinInSchematic = schematicNode.nodes.find((p) => {
          if (componentUuid) {
            // Via lookup by UUID
            return p.uuid === componentUuid && String(p.number) === pinNumber;
          } else {
            // Component lookup by reference + pin number
            return p.reference === componentReference && String(p.number) === pinNumber;
          }
        });

        if (pinInSchematic) {
          schematicNetName = schematicNode.name;
          schematicNetCode = schematicNode.code;
          foundInSchematic = true;
          break;
        }
      }
    }
  }

  if (foundInSchematic && schematicNetName !== undefined && schematicNetCode !== undefined) {
    // Found in schematic - check if board has different code for this net
    let finalNetCode = schematicNetCode;
    let finalNetName = schematicNetName;

    if (boardNetNameToCodeMap) {
      const lookupKey = normalizeNetName(schematicNetName);

      if (lookupKey && boardNetNameToCodeMap.has(lookupKey)) {
        finalNetCode = boardNetNameToCodeMap.get(lookupKey)!;
        finalNetName = schematicNetName; // Keep original name format
      }
    }

    return {
      found: true,
      netCode: finalNetCode,
      netName: finalNetName,
      schematicNetCode,
      schematicNetName,
    };
  }

  // Not found in schematic - try fallback options
  if (fallbackNetName && boardNetNameToCodeMap) {
    const lookupNetName = normalizeNetName(fallbackNetName);
    if (lookupNetName && boardNetNameToCodeMap.has(lookupNetName)) {
      const boardNetCode = boardNetNameToCodeMap.get(lookupNetName)!;
      return {
        found: false,
        netCode: boardNetCode,
        netName: fallbackNetName,
      };
    }
  }

  // Default to net 0 (unconnected)
  return {
    found: false,
    netCode: 0,
    netName: '',
  };
}
