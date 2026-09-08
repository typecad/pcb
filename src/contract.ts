import { PCB, getPcbState } from './pcb/pcb.js';
import { Component } from './component.js';
import { Pin } from './pin.js';
import fs from 'node:fs';
import path from 'node:path';
import logger from './utils/logging.js';
import { getSymbolLibraryManager } from './symbol_library_manager.js';
import type { PinInfo } from './renderers/schematic_visualizer_types.js';
import { TypeCadError } from './utils/errors.js';
import { DEFAULT_BUILD_DIR } from './utils/constants.js';
import { addOutputPath } from './cli/pending_summary.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/** An external component connected on the same net as an MCU pin */
export interface ContractComponent {
  reference: string;
  symbol: string;
  value: string;
  footprint: string;
  mpn: string;
  datasheet: string;
  description: string;
  voltage: string;
  wattage: string;
  dnp: boolean;
}

/** Info about a single connected MCU pin */
export interface ContractPin {
  pinName: string;
  /** Pin electrical type from KiCAD symbol (e.g. "bidirectional", "power_in", "passive", "input", "output") */
  pinType: string;
  /** Board framework pin name (e.g. "D13") — populated when typehal is provided */
  boardName?: string;
  net: string;
  externalComponents: ContractComponent[];
}

/** The top-level contract object written to disk */
export interface HwContract {
  version: 1;
  mcu: {
    symbol: string;
    reference: string;
    value: string;
    footprint: string;
    mpn: string;
    datasheet: string;
    description: string;
  };
  connectedPins: Record<string, ContractPin>;
  availablePeripherals: {
    i2c: boolean;
    spi: boolean;
    uart: boolean;
  };
}

/** Options passed to pcb.contract() */
export interface ContractOptions {
  /**
   * The MCU component to generate a contract for.
   */
  mcu: Component;
  /** Peripheral pin requirements (board pin names) */
  peripheralPins?: {
    i2c?: string[];
    spi?: string[];
    uart?: string[];
  };
  /** Output file path (default: "./build/<boardname>.contract.json") */
  outputPath?: string;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_PERIPHERAL_PINS = {
  i2c: ['A4', 'A5'],
  spi: ['D11', 'D12', 'D13'],
  uart: ['D0', 'D1'],
};

// ── Path helpers ─────────────────────────────────────────────────────────────

/**
 * Resolves and validates the contract output path.
 *
 * - If the user passes a bare directory (no extension), appends
 *   `<boardName>.contract.json` automatically.
 * - Ensures the final path ends with `.json`.
 * - Rejects filenames containing illegal characters.
 */
function resolveOutputPath(rawPath: string, boardName: string): string {
  let resolved = path.resolve(rawPath);

  // Auto-correct: if it looks like a directory (no extension), append filename
  if (path.extname(resolved) === '') {
    resolved = path.join(resolved, `${boardName}.contract.json`);
    logger.info(`contract: outputPath was a directory, using "${resolved}"`);
  }

  // Validate extension
  if (path.extname(resolved).toLowerCase() !== '.json') {
    throw new TypeCadError(`contract: outputPath must be a .json file, got "${rawPath}"`);
  }

  // Reject illegal filename characters
  const filename = path.basename(resolved);
  if (/[<>:"|?*\x00-\x1f]/.test(filename)) {
    throw new TypeCadError(`contract: outputPath contains invalid characters: "${filename}"`);
  }

  return resolved;
}

// ─── Export ───────────────────────────────────────────────────────────────────

/**
 * Exports a hardware contract JSON file describing which MCU pins are wired
 * in the circuit. The firmware toolchain (TypeHAL) consumes this contract to
 * generate a board wrapper that only exposes connected pins and peripherals.
 *
 * @param pcb - The PCB instance to analyze.
 * @param options - Contract generation options (mcuReference required).
 */
export function exportContract(pcb: PCB, options: ContractOptions): void {
  if (!options?.mcu) {
    throw new TypeCadError(
      'contract: options.mcu is required. Pass an MCU Component, e.g. pcb.contract({ mcu: myMcu }).',
    );
  }
  const mcu = options.mcu;

  // 1. Read KiCAD symbol pin info (name + type) via SymbolLibraryManager
  let pinNameMap = new Map<string, PinInfo>();

  if (mcu.symbol) {
    const libManager = getSymbolLibraryManager();
    const result = libManager.getPinInfoMap(mcu.symbol);
    if (result) {
      pinNameMap = result;
    } else {
      logger.warn(`contract: Could not load pin info for "${mcu.symbol}".`);
    }
  }

  // 1b. Build alias map for compound/overbar pin names (e.g. "~{RESET}/PA0" → "PA0", "RESET")
  const pinAliasMap = new Map<string, string>(); // alias → pinNumber

  for (const [pinNumber, info] of pinNameMap) {
    pinAliasMap.set(info.name, pinNumber); // exact full name
    const parts = info.name.split('/');
    for (const part of parts) {
      const trimmed = part.trim();
      pinAliasMap.set(trimmed, pinNumber); // raw sub-name "~{RESET}"
      const stripped = trimmed.replace(/^~\{(.+)\}$/, '$1').trim();
      if (stripped !== trimmed) {
        pinAliasMap.set(stripped, pinNumber); // overbar stripped "RESET"
      }
    }
  }

  // 1c. Validate typehal keys against all pin aliases
  if (mcu.typehal && pinAliasMap.size > 0) {
    for (const key of Object.keys(mcu.typehal)) {
      if (!pinAliasMap.has(key)) {
        const validNames = [...new Set([...pinNameMap.values()].map((i) => i.name))].join(', ');
        logger.warn(
          `contract: typehal key "${key}" does not match any pin on "${mcu.symbol}". Valid pins: ${validNames}`,
        );
      }
    }
  }

  // 2. Walk nets and collect connected GPIO pins
  const connectedPins: Record<string, ContractPin> = {};

  for (const node of pcb.schematic.nodes) {
    const mcuPinsInNet = node.nodes.filter((pin) => pin.reference === mcu.reference);

    for (const mcuPin of mcuPinsInNet) {
      const pinNumber = String(mcuPin.number);
      const pinInfo = pinNameMap.get(pinNumber);
      const pinName = pinInfo?.name || '';
      const pinType = pinInfo?.type || '';

      // Include all connected pins — TypeHAL decides what's useful

      // Use pin number as key (IC pin number from KiCAD)
      const key = pinNumber;

      // Skip duplicate pins (first net wins)
      if (connectedPins[key]) {
        continue;
      }

      // Collect external components on the same net
      const seen = new Set<string>();
      const externalComponents: ContractComponent[] = [];

      for (const netPin of node.nodes) {
        if (netPin.reference === mcu.reference) {
          continue;
        }
        if (seen.has(netPin.reference)) {
          continue;
        }
        seen.add(netPin.reference);

        // Look up the component by reference
        const comp = findComponent(pcb, netPin);
        if (comp) {
          externalComponents.push(componentToContract(comp));
        }
      }

      let boardName: string | undefined;
      if (mcu.typehal) {
        boardName = mcu.typehal[pinName];
        if (boardName === undefined) {
          for (const [alias, num] of pinAliasMap) {
            if (num === pinNumber && mcu.typehal[alias] !== undefined) {
              boardName = mcu.typehal[alias];
              break;
            }
          }
        }
      }

      connectedPins[key] = {
        pinName,
        pinType,
        boardName,
        net: node.name,
        externalComponents,
      };
    }
  }

  // 3. Peripheral availability
  const peripheralPins = {
    i2c: options.peripheralPins?.i2c ?? DEFAULT_PERIPHERAL_PINS.i2c,
    spi: options.peripheralPins?.spi ?? DEFAULT_PERIPHERAL_PINS.spi,
    uart: options.peripheralPins?.uart ?? DEFAULT_PERIPHERAL_PINS.uart,
  };

  let availablePeripherals = { i2c: false, spi: false, uart: false };

  if (mcu.typehal) {
    const connectedBoardNames = new Set<string>();
    for (const info of Object.values(connectedPins)) {
      if (info.boardName) connectedBoardNames.add(info.boardName);
    }

    availablePeripherals = {
      i2c: peripheralPins.i2c.every((name) => connectedBoardNames.has(name)),
      spi: peripheralPins.spi.every((name) => connectedBoardNames.has(name)),
      uart: peripheralPins.uart.every((name) => connectedBoardNames.has(name)),
    };
  } else {
    // Auto mode: detect peripherals from KiCAD pin names using standard
    // signal names (SDA/SCL, MOSI/MISO/SCK, TX/RX) — works with any MCU.
    const connectedPinNames = new Set<string>();
    for (const info of Object.values(connectedPins)) {
      if (info.pinName) {
        // Split compound names like "XTAL1/PB6" or "TDO/PB7" into parts
        for (const part of info.pinName.split(/[\/\-_,.\s]+/)) {
          connectedPinNames.add(part.toUpperCase());
        }
      }
    }

    availablePeripherals = {
      i2c: connectedPinNames.has('SDA') && connectedPinNames.has('SCL'),
      spi: connectedPinNames.has('MOSI') && connectedPinNames.has('MISO') && connectedPinNames.has('SCK'),
      uart: connectedPinNames.has('TX') && connectedPinNames.has('RX'),
    };
  }

  // 4. Build and write contract
  const contract: HwContract = {
    version: 1,
    mcu: {
      symbol: mcu.symbol || '',
      reference: mcu.reference,
      value: mcu.value || '',
      footprint: mcu.footprint || '',
      mpn: mcu.mpn || '',
      datasheet: mcu.datasheet || '',
      description: mcu.description || '',
    },
    connectedPins,
    availablePeripherals,
  };

  const rawOutputPath = options.outputPath ?? `${DEFAULT_BUILD_DIR}/${pcb.boardName}.contract.json`;
  const outputPath = resolveOutputPath(rawOutputPath, pcb.boardName);

  try {
    const dir = path.dirname(outputPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(contract, null, 2));
  } catch (err) {
    throw new TypeCadError(`Failed to write contract file: ${(err as Error).message}`, { cause: err });
  }

  addOutputPath(outputPath);
}

/**
 * Extract all contract-relevant fields from a Component.
 */
function componentToContract(comp: Component): ContractComponent {
  return {
    reference: comp.reference,
    symbol: comp.symbol || '',
    value: comp.value || '',
    footprint: comp.footprint || '',
    mpn: comp.mpn || '',
    datasheet: comp.datasheet || '',
    description: comp.description || '',
    voltage: comp.voltage || '',
    wattage: comp.wattage || '',
    dnp: comp.dnp ?? false,
  };
}

/**
 * Find a Component on the PCB that matches a given Pin's reference.
 * Searches both placed components and schematic components.
 */
function findComponent(pcb: PCB, pin: Pin): Component | undefined {
  return (
    getPcbState(pcb).components.find((c) => c.reference === pin.reference) ??
    pcb.schematic.components.find((c) => c.reference === pin.reference)
  );
}
