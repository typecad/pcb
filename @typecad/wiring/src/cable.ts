import { Pin } from "./pin.js";
import chalk from 'chalk';
import { CableError, NetError } from "./errors.js";
import { isValidGraphvizColor, normalizeComponentName } from "./validation.js";
import { logInfo } from "./logger.js";

/**
 * Interface defining properties for creating a cable
 */
export interface ICable {
    name?: string;
    type?: string;
    gauge?: string;
    length?: string;
    mpn?: string;
    additionals?: { quantity?: number, item?: string, mpn?: string }[];
    bundle?: boolean;
    note?: string;
    image?: { src?: string, caption?: string };
    /** Diagram page this cable belongs to (multi-page diagrams) */
    page?: string;
}

/**
 * Interface defining properties for creating a connection in a cable.
 * `left` and `right` accept a single pin or an array of pins; passing
 * arrays creates a multi-endpoint net (tap/splice) rendered as one
 * wire row fanning out to every pin.
 */
export interface ICableNet {
    color?: string;
    left?: Pin | Pin[];
    right?: Pin | Pin[];
    striped?: string;
    isShield?: boolean;
    /** Optional net name shown in the diagram and reuse in cut list / BOM output */
    name?: string;
}

/**
 * Represents a cable or wire that connects pins between connectors
 */
export class Cable {
    name: string = '';
    type: string = '';
    gauge: string = '';
    mpn: string = '';
    length: string = '';
    nets: {
        name?: string;
        color: string;
        pins: Pin[];
        striped: string;
        isShield?: boolean;
    }[] = [];
    additionals: { quantity: number, item: string, mpn: string }[] = [];
    bundle: boolean = false;
    note: string = '';
    image?: { src?: string, caption?: string };
    page?: string;

    private shieldNet: {
        color: string;
        pins: Pin[];
        striped: string;
        isShield: boolean;
    } | null = null; // Track the shield net separately
    private shieldPinKeys: Set<string> = new Set(); // For deduplication of shield pins

    /**
     * Creates a new cable with the specified properties
     * @param options - Configuration options for the cable
     */
    constructor({ name, type, gauge, length, mpn, additionals, bundle, note, image, page }: ICable = {}) {
        // Normalize and assign name, ensuring no hyphens are present
        const tempName = name || `cable_${Date.now()}`;
        this.name = normalizeComponentName(tempName);

        if (type != undefined) this.type = type;
        if (gauge != undefined) this.gauge = gauge;
        if (length != undefined) this.length = length;
        if (mpn != undefined) this.mpn = mpn;
        if (bundle != undefined) this.bundle = bundle;
        if (note != undefined) this.note = note;
        if (image != undefined) this.image = image;
        if (page != undefined) this.page = page;

        // Process additionals
        if (additionals != undefined) {
            this.additionals = additionals.map(additional => ({
                quantity: additional.quantity ?? 0,
                item: additional.item ?? '',
                mpn: additional.mpn ?? ''
            }));
        }

        logInfo(chalk.blue.bold(this.name) + ' created');
    }

    /**
     * Creates a standard connection between pins. `left` and `right` each
     * accept a single pin or an array of pins; arrays create a multi-endpoint
     * net (tap/splice) drawn as one wire fanning out to all listed pins.
     * @param options - Configuration options for the net connection
     * @param options.color - Wire color (X11 color name or hex)
     * @param options.left - Pin(s) on the left/source side
     * @param options.right - Pin(s) on the right/destination side
     * @param options.striped - Secondary color for striped wires
     * @param options.name - Optional net name shown in the diagram center cell
     * @returns This cable instance for method chaining
     * @throws {NetError} If the net connection cannot be created
     */
    net({ name, color, left, right, striped }: ICableNet = {}): Cable {
        const collect = (side: 'w' | 'e', value: Pin | Pin[] | undefined, label: string): Pin[] => {
            const list = value === undefined ? [] : Array.isArray(value) ? value : [value];
            for (const pin of list) {
                if (!pin.owner || pin.number === undefined) {
                    throw new NetError(`Invalid ${label} pin`, this.name);
                }
                pin.side = side;
            }
            return list;
        };

        // Collect available pins with side information preserved
        const pins: Pin[] = [
            ...collect('w', left, 'left'),
            ...collect('e', right, 'right')
        ];

        // Check if we have at least one pin
        if (pins.length === 0) {
            throw new NetError("Both left and right sides missing", this.name);
        }

        // Validate colors if provided (they are passed straight to Graphviz)
        if (color !== undefined && !isValidGraphvizColor(color)) {
            throw new NetError(
                `Unknown wire color '${color}'. Use an X11 color name (e.g. 'red', 'darkgreen') or hex like '#ff0000'.`,
                this.name
            );
        }

        if (striped !== undefined && !isValidGraphvizColor(striped)) {
            throw new NetError(
                `Unknown striped color '${striped}'. Use an X11 color name (e.g. 'red', 'darkgreen') or hex like '#ff0000'.`,
                this.name
            );
        }

        // Add the net
        this.nets.push({
            name: name,
            color: color || 'white',
            pins: pins,
            striped: striped || '',
            isShield: false
        });

        return this;
    }

    /**
     * Creates or adds to a shield connection between pins
     * Multiple calls to shield() will add pins to the same shield net
     * @param options - Configuration options for the shield connection
     * @param options.left - Pin on the left/source side
     * @param options.right - Pin on the right/destination side
     * @returns This cable instance for method chaining
     * @throws {NetError} If the shield connection cannot be created
     */
    shield({ left, right }: { left?: Pin, right?: Pin } = {}): Cable {
        // Check if we have at least one pin
        if (!left && !right) {
            throw new NetError("Both left and right sides missing for shield", this.name);
        }

        // Validate pins if provided
        if (left && (!left.owner || left.number === undefined)) {
            throw new NetError("Invalid left pin for shield", this.name);
        }

        if (right && (!right.owner || right.number === undefined)) {
            throw new NetError("Invalid right pin for shield", this.name);
        }

        // Collect available pins with side information preserved, deduplicating as we go
        const pins: Pin[] = [];

        if (left) {
            left.side = "w"; // west/left
            const leftKey = `${left.owner}:${left.number}`;
            if (!this.shieldPinKeys.has(leftKey)) {
                this.shieldPinKeys.add(leftKey);
                pins.push(left);
            }
        }

        if (right) {
            right.side = "e"; // east/right
            const rightKey = `${right.owner}:${right.number}`;
            if (!this.shieldPinKeys.has(rightKey)) {
                this.shieldPinKeys.add(rightKey);
                pins.push(right);
            }
        }

        // If we have no new pins to add, just return
        if (pins.length === 0) {
            // Not throwing an error here, as it might be a valid case
            // where all pins were already added to the shield
            return this;
        }

        // Check if we already have a shield net
        if (this.shieldNet) {
            // Add these pins to the existing shield net
            this.shieldNet.pins.push(...pins);
        } else {
            // Create a new shield net
            const newShieldNet = {
                color: "#000000", // Always black
                pins: pins,
                striped: "",
                isShield: true
            };
            this.nets.push(newShieldNet);
            this.shieldNet = newShieldNet;
        }

        return this;
    }

    /**
     * Adds additional items to the cable (like connectors, terminators, etc.)
     * @param item - Description of the additional item
     * @param quantity - Number of items (default: 0)
     * @param mpn - Manufacturer part number (default: '')
     * @returns This cable instance for method chaining
     * @throws {CableError} If the additional item cannot be added
     */
    additional(item: string, quantity: number = 0, mpn: string = ''): Cable {
        if (!item) {
            throw new CableError("Additional item description is required", this.name);
        }

        if (quantity < 0) {
            throw new CableError("Quantity cannot be negative", this.name);
        }

        this.additionals.push({ item, quantity, mpn });
        return this;
    }

    /**
     * Validates that the cable has all required properties for diagram generation
     * @throws {CableError} If validation fails
     */
    validate(): void {
        if (!this.name) {
            throw new CableError("Missing name", this.name);
        }

        if (this.nets.length === 0) {
            throw new CableError("Cable has no connections", this.name);
        }

        // Validate each net
        this.nets.forEach((net, index) => {
            if (net.pins.length === 0) {
                throw new NetError("Net has no pins", this.name, index);
            }
        });
    }
}
