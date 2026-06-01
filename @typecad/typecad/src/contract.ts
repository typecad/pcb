import { PCB } from './pcb/pcb.js';
import { Component } from './component.js';
import { Pin } from './pin.js';
import fs from 'node:fs';
import path from 'node:path';
import logger from './utils/logging.js';
import { SymbolLibraryManager, getSymbolLibraryManager } from './symbol_library_manager.js';
import type { PinInfo } from './renderers/schematic_visualizer_types.js';
import { TypeCadError } from './utils/errors.js';
import { DEFAULT_BUILD_DIR } from './utils/constants.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/** A single pin mapping entry: IC pin → MCU name → board framework name.
 *  Only needed for legacy usage when the component has no typehal property. */
export interface McuPinMapping {
    icPin: number;
    mcuName: string;
    boardName: string;
    category: 'gpio' | 'power' | 'gnd' | 'clock' | 'reset';
}

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
    /** Board framework pin name (e.g. "D13") — populated when typehal.pinLookup is provided */
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
     * Substring to match against Component.symbol to find the MCU.
     * Ignored when the MCU component has a typehal.boardPackage property.
     */
    mcuSymbolPattern?: string;
    /**
     * Exact reference designator of the target MCU (e.g. 'U1').
     * Takes priority over mcuSymbolPattern when both are provided.
     */
    mcuReference?: string;
    /**
     * Pin mapping table for the MCU (legacy — only needed when the component
     * has no typehal property and you need board names in the output).
     */
    pinMapping?: McuPinMapping[];
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

// ─── Export ───────────────────────────────────────────────────────────────────

/**
 * Exports a hardware contract JSON file describing which MCU pins are wired
 * in the circuit. The firmware toolchain (TypeHAL) consumes this contract to
 * generate a board wrapper that only exposes connected pins and peripherals.
 *
 * When a component has a `typehal.boardPackage` property, it is auto-detected
 * as the MCU and pin names are read directly from the KiCAD symbol file.
 *
 * @param pcb - The PCB instance to analyze.
 * @param options - Contract generation options (all optional when typehal is set on the MCU).
 */
export function exportContract(pcb: PCB, options: ContractOptions = {}): void {
    // 1. Find the MCU — prefer typehal.boardPackage, then exact reference, then symbol pattern
    let mcu: Component | undefined;

    // Auto-detect: first component with a typehal object
    mcu = pcb.state.components.find(
        (comp) => comp.typehal
    );

    // Fallback to exact reference
    if (!mcu && options.mcuReference) {
        mcu = pcb.state.components.find(
            (comp) => comp.reference === options.mcuReference
        );
    }

    // Fallback to symbol pattern
    if (!mcu && options.mcuSymbolPattern) {
        const pattern = options.mcuSymbolPattern;
        mcu = pcb.state.components.find(
            (comp) => comp.symbol && comp.symbol.includes(pattern)
        );
    }

    if (!mcu) {
        const hints: string[] = [];
        if (options.mcuReference) hints.push(`reference "${options.mcuReference}"`);
        if (options.mcuSymbolPattern) hints.push(`symbol matching "${options.mcuSymbolPattern}"`);
        const hint = hints.length > 0
            ? hints.join(' or ')
            : 'typehal';
        logger.warn(
            `contract: No MCU found (${hint}). Skipping contract generation.`
        );
        return;
    }

    const foundMcu = mcu;

    // 2. Read KiCAD symbol pin info (name + type) via SymbolLibraryManager
    let pinNameMap = new Map<string, PinInfo>();

    if (foundMcu.symbol) {
        const libManager = getSymbolLibraryManager();
        const result = libManager.getPinInfoMap(foundMcu.symbol);
        if (result) {
            pinNameMap = result;
        } else {
            logger.warn(`contract: Could not load pin info for "${foundMcu.symbol}".`);
        }
    }

    // 3. Walk nets and collect connected GPIO pins
    const connectedPins: Record<string, ContractPin> = {};

    for (const node of pcb.schematic.nodes) {
        const mcuPinsInNet = node.nodes.filter(
            (pin) => pin.reference === foundMcu.reference
        );

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
                if (netPin.reference === foundMcu.reference) {
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

            // Look up board name from typehal.pinLookup if available
            const boardName = foundMcu.typehal?.pinLookup?.[pinName] || undefined;

            connectedPins[key] = {
                pinName,
                pinType,
                boardName,
                net: node.name,
                externalComponents,
            };
        }
    }

    // 4. Peripheral availability (legacy — based on board names if pinMapping provided)
    const peripheralPins = {
        i2c: options.peripheralPins?.i2c ?? DEFAULT_PERIPHERAL_PINS.i2c,
        spi: options.peripheralPins?.spi ?? DEFAULT_PERIPHERAL_PINS.spi,
        uart: options.peripheralPins?.uart ?? DEFAULT_PERIPHERAL_PINS.uart,
    };

    // When pinMapping is provided, we can map to board names for peripheral checks
    // Otherwise, use pin names for a best-effort check
    let availablePeripherals = { i2c: false, spi: false, uart: false };

    if (options.pinMapping) {
        // Legacy mode: use board names from pin mapping
        const pinLookup = new Map<number, McuPinMapping>();
        for (const mapping of options.pinMapping) {
            pinLookup.set(mapping.icPin, mapping);
        }

        const connectedBoardNames = new Set<string>();
        for (const [icPin, _info] of Object.entries(connectedPins)) {
            const mapping = pinLookup.get(Number(icPin));
            if (mapping) {
                connectedBoardNames.add(mapping.boardName);
            }
        }

        availablePeripherals = {
            i2c: peripheralPins.i2c.every((name) => connectedBoardNames.has(name)),
            spi: peripheralPins.spi.every((name) => connectedBoardNames.has(name)),
            uart: peripheralPins.uart.every((name) => connectedBoardNames.has(name)),
        };
    } else if (foundMcu.typehal?.pinLookup) {
        // pinLookup mode: use board names from the lookup for peripheral checks
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

    // 5. Build and write contract
    const contract: HwContract = {
        version: 1,
        mcu: {
            symbol: foundMcu.symbol || '',
            reference: foundMcu.reference,
            value: foundMcu.value || '',
            footprint: foundMcu.footprint || '',
            mpn: foundMcu.mpn || '',
            datasheet: foundMcu.datasheet || '',
            description: foundMcu.description || '',
        },
        connectedPins,
        availablePeripherals,
    };

    const outputPath =
        options.outputPath ??
        `${DEFAULT_BUILD_DIR}/${pcb.boardName}.contract.json`;

    try {
        const dir = path.dirname(outputPath);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(outputPath, JSON.stringify(contract, null, 2));
    } catch (err) {
        throw new TypeCadError(`Failed to write contract file: ${(err as Error).message}`, { cause: err });
    }

    logger.log(
        `📝 Contract written to ${outputPath} (${Object.keys(connectedPins).length} connected pins)`
    );
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
        pcb.state.components.find((c) => c.reference === pin.reference) ??
        pcb.schematic.components.find((c) => c.reference === pin.reference)
    );
}
