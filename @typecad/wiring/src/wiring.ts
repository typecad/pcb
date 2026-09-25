import { Connector } from "./connector.js";
import { Cable } from "./cable.js";
import chalk from 'chalk';
import { writeGraphvizToFile } from "./graphviz.js";
import fs from 'node:fs';
import { BomError, CutlistError, DiagramError, TypeCadWiringError, ValidationError, errorMessage } from "./errors.js";
import { escapeCsv } from "./validation.js";
import { logInfo } from "./logger.js";

/**
 * A single design-rule-check finding
 */
export interface DrcIssue {
  /** Machine-readable issue code */
  code: 'UNUSED_PIN' | 'DUPLICATE_WIRE' | 'SHORT';
  /** Human-readable description of the issue */
  message: string;
}

/**
 * Main class for managing wiring harness components and generating output
 */
export class Wiring {
    private Connectors: Connector[] = [];
    private Cables: Cable[] = [];

    /**
     * Adds one or more connectors to the wiring harness
     * @param connectors - Connector instances to add
     * @returns This wiring instance for method chaining
     * @throws {TypeCadWiringError} If any connector validation fails
     */
    connectors(...connectors: Connector[]): Wiring {
        if (!connectors.length) {
            throw new ValidationError("No connectors provided");
        }

        connectors.forEach(connector => {
            // Validate connector
            if (!(connector instanceof Connector)) {
                throw new ValidationError("Invalid connector object");
            }

            // Check for duplicate connector names
            if (this.Connectors.some(c => c.name === connector.name)) {
                throw new ValidationError(`Connector with name '${connector.name}' already exists`);
            }

            // Run connector validation
            connector.validate();

            // Add to collection
            this.Connectors.push(connector);
            logInfo(chalk.blue.bold(connector.name) + ' added');
        });

        return this;
    }

    /**
     * Adds one or more cables to the wiring harness
     * @param cables - Cable instances to add
     * @returns This wiring instance for method chaining
     * @throws {TypeCadWiringError} If any cable validation fails
     */
    cables(...cables: Cable[]): Wiring {
        if (!cables.length) {
            throw new ValidationError("No cables provided");
        }

        cables.forEach(cable => {
            // Validate cable
            if (!(cable instanceof Cable)) {
                throw new ValidationError("Invalid cable object");
            }

            // Check for duplicate cable names
            if (this.Cables.some(c => c.name === cable.name)) {
                throw new ValidationError(`Cable with name '${cable.name}' already exists`);
            }

            // Run cable validation
            cable.validate();

            // Add to collection
            this.Cables.push(cable);
            logInfo(chalk.blue.bold(cable.name) + ' added');
        });

        return this;
    }

    /**
     * Creates a Graphviz DOT file representing the wiring diagram
     * @param filename - Base name for the file (default: 'wiring')
     * @returns This wiring instance for method chaining
     * @throws {DiagramError} If diagram generation fails
     */
    create(filename: string = 'wiring'): Wiring {
        if (!filename) {
            throw new ValidationError("Filename is required");
        }

        if (this.Connectors.length === 0) {
            throw new DiagramError("No connectors in the wiring diagram");
        }

        if (this.Cables.length === 0) {
            throw new DiagramError("No cables in the wiring diagram");
        }

        try {
            // Ensure the filename ends with .dot
            const dotFilename = filename.endsWith('.dot') ? filename : `${filename}.dot`;
            writeGraphvizToFile(this.Connectors, this.Cables, dotFilename);
            return this;
        } catch (error) {
            if (error instanceof TypeCadWiringError) {
                throw error;
            } else {
                throw new DiagramError(`Failed to create diagram: ${errorMessage(error)}`, filename);
            }
        }
    }

    /**
     * Generates a Bill of Materials (BOM) as a CSV file
     *
     * @param filename - The name of the file to write the BOM to (defaults to 'wiring-bom.csv')
     * @param options.grouped - Aggregate rows by MPN (or description) with summed
     *   quantities and combined designators instead of one row per item
     * @returns This wiring instance for method chaining
     * @throws {BomError} If BOM generation fails
     */
    bom(filename: string = 'wiring-bom.csv', options: { grouped?: boolean } = {}): Wiring {
        if (!filename) {
            throw new ValidationError("Filename is required");
        }

        try {
            const entries = collectBomEntries(this.Cables, this.Connectors);
            const rows: string[][] = [];

            if (options.grouped) {
                // Aggregate entries by MPN (falling back to description) with
                // summed quantities and combined designators
                const groups = new Map<string, { designators: string[]; description: string; quantity: number; mpn: string }>();

                for (const entry of entries) {
                    const key = entry.mpn || entry.description;
                    const group = groups.get(key);
                    if (group) {
                        group.quantity += entry.quantity;
                        if (!group.designators.includes(entry.designator)) {
                            group.designators.push(entry.designator);
                        }
                    } else {
                        groups.set(key, {
                            designators: [entry.designator],
                            description: entry.description,
                            quantity: entry.quantity,
                            mpn: entry.mpn
                        });
                    }
                }

                for (const group of groups.values()) {
                    rows.push([group.designators.join(' + '), group.description, String(group.quantity), group.mpn]);
                }
            } else {
                for (const entry of entries) {
                    rows.push([entry.designator, entry.description, String(entry.quantity), entry.mpn]);
                }
            }

            // Write to CSV file, quoting any field that contains commas/quotes/newlines
            const csvContent = 'Designator,Description,Quantity,MPN\n'
                + rows.map(row => row.map(escapeCsv).join(',')).join('\n');

            try {
                fs.writeFileSync(filename, csvContent, 'utf8');
            } catch (fsError) {
                throw new BomError(
                    `Failed to write BOM file: ${errorMessage(fsError)}`,
                    filename
                );
            }

            return this;

        } catch (error) {
            if (error instanceof TypeCadWiringError) {
                throw error;
            } else {
                throw new BomError(`Failed to generate BOM: ${errorMessage(error)}`, filename);
            }
        }
    }

    /**
     * Generates a wire cut list as a CSV file: one row per wire run with its
     * color, gauge, length and the pins it connects (taps list every endpoint).
     *
     * @param filename - The name of the file to write the cut list to (defaults to 'wiring-cutlist.csv')
     * @returns This wiring instance for method chaining
     * @throws {CutlistError} If cut list generation fails
     */
    cutlist(filename: string = 'wiring-cutlist.csv'): Wiring {
        if (!filename) {
            throw new ValidationError("Filename is required");
        }

        try {
            const rows: string[][] = [];

            for (const cable of this.Cables) {
                cable.nets.forEach((net, index) => {
                    const wire = net.name ?? (net.isShield ? 'SHIELD' : String(index + 1));
                    const color = net.isShield
                        ? 'black'
                        : (net.striped ? `${net.color}/${net.striped}` : net.color);
                    // From = the net's first (source) pin, To = the remaining
                    // endpoints. Derived from pin order rather than pin.side,
                    // which can go stale when a pin is shared with another cable.
                    const from = net.pins[0] ? net.pins[0].toString() : '';
                    const to = net.pins.slice(1).map(pin => pin.toString()).join(', ');

                    rows.push([cable.name, wire, color, cable.gauge, cable.length, from, to]);
                });
            }

            const csvContent = 'Designator,Wire,Color,Gauge,Length,From,To\n'
                + rows.map(row => row.map(escapeCsv).join(',')).join('\n');

            try {
                fs.writeFileSync(filename, csvContent, 'utf8');
            } catch (fsError) {
                throw new CutlistError(
                    `Failed to write cut list file: ${errorMessage(fsError)}`,
                    filename
                );
            }

            return this;

        } catch (error) {
            if (error instanceof TypeCadWiringError) {
                throw error;
            } else {
                throw new CutlistError(`Failed to generate cut list: ${errorMessage(error)}`, filename);
            }
        }
    }

    /**
     * Runs design-rule checks on the harness and returns all issues found.
     * Unlike validate() these do not throw — they report likely mistakes:
     * unused pins, duplicate wires and shorts within a cable.
     *
     * @returns Array of DRC issues (empty when the harness is clean)
     */
    drc(): DrcIssue[] {
        const issues: DrcIssue[] = [];

        // Pins used in at least one net
        const usedPins = new Set<string>();
        for (const cable of this.Cables) {
            for (const net of cable.nets) {
                for (const pin of net.pins) {
                    usedPins.add(`${pin.owner}:${pin.number}`);
                }
            }
        }

        // Unused pins: defined on a connector but wired to nothing
        for (const connector of this.Connectors) {
            for (const pin of connector.pins) {
                if (!usedPins.has(`${connector.name}:${pin.number}`)) {
                    const label = pin.name ? ` (named '${pin.name}')` : '';
                    issues.push({
                        code: 'UNUSED_PIN',
                        message: `Connector '${connector.name}' pin ${pin.number}${label} is not connected to any net`
                    });
                }
            }
        }

        // Per-cable checks: shorts and duplicate wires (shield nets excluded —
        // sharing a drain pin with a signal wire is normal practice)
        for (const cable of this.Cables) {
            const wireLabel = (net: { name?: string }, index: number): string =>
                net.name ? `'${net.name}'` : `#${index + 1}`;

            const netsWithIndex = cable.nets
                .map((net, index) => ({ net, index }))
                .filter(({ net }) => !net.isShield);

            const pinToWires = new Map<string, { index: number; net: { name?: string } }[]>();
            const signatureToWire = new Map<string, { index: number; net: { name?: string } }>();

            for (const { net, index } of netsWithIndex) {
                const keys = net.pins.map(pin => `${pin.owner}:${pin.number}`);

                for (const key of keys) {
                    const list = pinToWires.get(key) ?? [];
                    list.push({ index, net });
                    pinToWires.set(key, list);
                }

                const signature = [...new Set(keys)].sort().join('+');
                const existing = signatureToWire.get(signature);
                if (existing) {
                    issues.push({
                        code: 'DUPLICATE_WIRE',
                        message: `Cable '${cable.name}': wires ${wireLabel(existing.net, existing.index)} and ` +
                                 `${wireLabel(net, index)} connect the same pins (${signature.split('+').join(', ')})`
                    });
                } else {
                    signatureToWire.set(signature, { index, net });
                }
            }

            for (const [key, wires] of pinToWires) {
                if (wires.length > 1) {
                    const labels = wires.map(w => wireLabel(w.net, w.index)).join(', ');
                    issues.push({
                        code: 'SHORT',
                        message: `Cable '${cable.name}': pin ${key} is used by wires ${labels} — those wires are shorted together`
                    });
                }
            }
        }

        return issues;
    }

    /**
     * Gets all connectors in the wiring harness
     * @returns Array of connector objects
     */
    getConnectors(): Connector[] {
        return [...this.Connectors];
    }

    /**
     * Gets all cables in the wiring harness
     * @returns Array of cable objects
     */
    getCables(): Cable[] {
        return [...this.Cables];
    }

    /**
     * Gets a connector by name
     * @param name - Name of the connector to find
     * @returns Connector object if found, undefined otherwise
     */
    getConnector(name: string): Connector | undefined {
        return this.Connectors.find(c => c.name === name);
    }

    /**
     * Gets a cable by name
     * @param name - Name of the cable to find
     * @returns Cable object if found, undefined otherwise
     */
    getCable(name: string): Cable | undefined {
        return this.Cables.find(c => c.name === name);
    }

    /**
     * Validates the entire wiring harness
     * @throws {TypeCadWiringError} If validation fails
     */
    validate(): void {
        // Check for at least one connector
        if (this.Connectors.length === 0) {
            throw new ValidationError("Wiring harness has no connectors");
        }

        // Check for at least one cable
        if (this.Cables.length === 0) {
            throw new ValidationError("Wiring harness has no cables");
        }

        // Validate all connectors
        this.Connectors.forEach(connector => {
            connector.validate();
        });

        // Validate all cables
        this.Cables.forEach(cable => {
            cable.validate();
        });

        // Check for unconnected connectors (connectors with no cables attached)
        const connectedConnectorNames = new Set<string>();

        this.Cables.forEach(cable => {
            cable.nets.forEach(net => {
                net.pins.forEach(pin => {
                    connectedConnectorNames.add(pin.owner);
                });
            });
        });

        const unconnectedConnectors = this.Connectors.filter(
            connector => !connectedConnectorNames.has(connector.name)
        );

        if (unconnectedConnectors.length > 0) {
            const names = unconnectedConnectors.map(c => c.name).join(', ');
            throw new ValidationError(`Unconnected connectors detected: ${names}`);
        }
    }
}

/**
 * A single line item of a wiring harness BOM
 */
interface BomEntry {
    designator: string;
    description: string;
    quantity: number;
    mpn: string;
}

/**
 * Builds the flat list of BOM line items for all cables and connectors,
 * including their additional items. Shared by the detailed and grouped outputs.
 */
function collectBomEntries(cables: Cable[], connectors: Connector[]): BomEntry[] {
    const entries: BomEntry[] = [];

    // Cables
    for (const cable of cables) {
        const shieldText = cable.nets.some(net => net.isShield) ? ' shielded' : '';
        const connectionCount = cable.nets.filter(net => !net.isShield).length;

        let description: string;
        let quantity: number;

        if (cable.bundle) {
            // For bundled cables, count each wire individually
            description = `Wire ${cable.type}`;
            quantity = connectionCount;
        } else {
            // For non-bundled cables, add as a single item
            description = cable.type;
            quantity = 1;
        }

        if (connectionCount > 0) {
            description += ` ${connectionCount}x`;
        }
        if (cable.gauge) {
            description += ` ${cable.gauge}`;
        }
        if (!cable.bundle) {
            description += shieldText;
        }
        if (cable.length) {
            description += ` ${cable.length}`;
        }

        entries.push({ designator: cable.name, description, quantity, mpn: cable.mpn });

        // Cable additionals
        for (const additional of cable.additionals ?? []) {
            if (additional.item) {
                // Use the provided quantity or default to 1 if it's 0 or undefined
                entries.push({
                    designator: cable.name,
                    description: additional.item,
                    quantity: additional.quantity > 0 ? additional.quantity : 1,
                    mpn: additional.mpn || ''
                });
            }
        }
    }

    // Connectors
    for (const connector of connectors) {
        let description = connector.type;
        if (connector.subtype) {
            description += ` ${connector.subtype}`;
        }
        description += ` ${connector.pin_count}-pin`;

        entries.push({ designator: connector.name, description, quantity: 1, mpn: connector.mpn });

        // Connector additionals
        for (const additional of connector.additionals ?? []) {
            if (additional.item) {
                entries.push({
                    designator: connector.name,
                    description: additional.item,
                    quantity: additional.quantity > 0 ? additional.quantity : 1,
                    mpn: additional.mpn || ''
                });
            }
        }
    }

    return entries;
}
