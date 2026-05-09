import { Pin } from "./pin";
import chalk from 'chalk';
import { CableError, NetError, ValidationError } from "./errors";
import { normalizeComponentName } from "./validation";

/**
 * Interface defining properties for creating a cable
 */
export interface ICable {
    name?: string;
    type?: string;
    gauge?: string;
    length?: string;
    color?: string;
    mpn?: string;
    additionals?: { quantity?: number, item?: string, mpn?: string }[];
    bundle?: boolean;
    note?: string;
    image?: {src?: string, caption?: string, height?: number};
}

/**
 * Interface defining properties for creating a connection in a cable
 */
export interface ICableNet {
    color?: string;
    left?: Pin;
    right?: Pin;
    striped?: string;
    isShield?: boolean;
}

/**
 * Represents a cable or wire that connects pins between connectors
 */
export class Cable {
    name: string = '';
    type: string = '';
    gauge: string = '';
    color: string = '';
    mpn: string = '';
    length: string = '';
    nets: {
        color: string;
        pins: Pin[];
        striped: string;
        isShield?: boolean;
    }[] = [];
    additionals: { quantity: number, item: string, mpn: string }[] = [];
    bundle: boolean = false;
    note: string = '';
    image: {src?: string, caption?: string};

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
     * @throws {ValidationError} If validation fails for any of the provided options
     */
    constructor({ name, type, gauge, length, mpn, additionals, bundle, note, image }: ICable = {}) {
        // Normalize and assign name, ensuring no hyphens are present
        const tempName = name || `cable_${Date.now()}`;
        this.name = normalizeComponentName(tempName);
        
        if (type != undefined) this.type = type;
        if (gauge != undefined) this.gauge = gauge;
        if (length != undefined) this.length = length;
        if (mpn != undefined) this.mpn = mpn;
        if (bundle != undefined) this.bundle = bundle;
        if (note != undefined) this.note = note;
        
        // Validate image if provided
        if (image != undefined) {
            if (image.src && typeof image.src !== 'string') {
                throw new ValidationError("Image src must be a string");
            }
            this.image = image;
        }

        // Process additionals
        if (additionals != undefined) {
            try {
                this.additionals = additionals.map(additional => ({
                    quantity: additional.quantity ?? 0,
                    item: additional.item ?? '',
                    mpn: additional.mpn ?? ''
                }));
            } catch (error) {
                throw new CableError(
                    `Failed to process additional items: ${error.message}`, 
                    this.name
                );
            }
        }

        process.stdout.write(chalk.blue.bold(this.name) + ' created\n');
    }

    /**
     * Creates a standard connection between pins
     * @param options - Configuration options for the net connection
     * @param options.color - Wire color (uses Graphviz color names)
     * @param options.left - Pin on the left/source side
     * @param options.right - Pin on the right/destination side
     * @param options.striped - Secondary color for striped wires
     * @returns This cable instance for method chaining
     * @throws {NetError} If the net connection cannot be created
     */
    net({ color, left, right, striped }: ICableNet = {}): Cable {
        // Check if we have at least one pin
        if (!left && !right) {
            throw new NetError("Both left and right sides missing", this.name);
        }

        // Validate pins if provided
        if (left && (!left.owner || left.number === undefined)) {
            throw new NetError("Invalid left pin", this.name);
        }
        
        if (right && (!right.owner || right.number === undefined)) {
            throw new NetError("Invalid right pin", this.name);
        }

        // Collect available pins with side information preserved
        const pins: Pin[] = [];
        if (left) {
            left.side = "w"; // west/left
            pins.push(left);
        }
        if (right) {
            right.side = "e"; // east/right
            pins.push(right);
        }

        // Validate color if provided
        if (color && typeof color !== 'string') {
            throw new NetError("Color must be a string", this.name);
        }
        
        // Validate striped color if provided
        if (striped && typeof striped !== 'string') {
            throw new NetError("Striped color must be a string", this.name);
        }

        // Add the net
        this.nets.push({
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