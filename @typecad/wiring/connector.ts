import { Pin } from "./pin";
import chalk from 'chalk';
import { ConnectorError, PinError, ValidationError } from "./errors";
import { normalizeComponentName } from "./validation";

/**
 * Interface for pin definition when creating a connector
 */
export interface PinDefinition {
  number: number;
  name?: string;
}

/**
 * Interface defining properties for creating a connector component
 */
export interface IComponent {
    name?: string;
    type?: string;
    subtype?: string;
    color?: string;
    mpn?: string;
    pins?: (string | PinDefinition)[]; // Support both old string[] format and new PinDefinition[]
    additionals?: {quantity?: number, item?: string, mpn?: string}[];
    striped?: string;
    note?: string;
    image?: {src?: string, caption?: string, height?: number};
}

/**
 * Represents a physical connector with pins in a wiring harness
 */
export class Connector {
    name: string = '';
    type: string = '';
    subtype: string = '';
    color: string = '';
    mpn: string = '';
    pins: Pin[] = [];
    additionals: {quantity: number, item: string, mpn: string}[] = [];
    pin_count: number = 0;
    striped: string = '';
    note: string = '';
    image: {src?: string, caption?: string};

    /**
     * Creates a new connector with the specified properties
     * @param options - Configuration options for the connector
     * @throws {ValidationError} If provided image is invalid or other validation fails
     */
    constructor({ name, type, subtype, color, mpn, pins, additionals, striped, note, image }: IComponent = {}) {
        // Normalize and assign name, ensuring no hyphens are present
        const tempName = name || `connector_${Date.now()}`;
        this.name = normalizeComponentName(tempName);
        
        // Validate and assign properties
        if (type != undefined) this.type = type;
        if (subtype != undefined) this.subtype = subtype;
        if (color != undefined) this.color = color;
        if (mpn != undefined) this.mpn = mpn;
        if (striped != undefined) this.striped = striped;
        if (note != undefined) this.note = note;
        
        // Validate image if provided
        if (image != undefined) {
            if (image.src && typeof image.src !== 'string') {
                throw new ValidationError("Image src must be a string");
            }
            this.image = image;
        }

        // Process additional items
        if (additionals != undefined) {
            try {
                this.additionals = additionals.map(additional => ({
                    quantity: additional.quantity ?? 0,
                    item: additional.item ?? '',
                    mpn: additional.mpn ?? ''
                }));
            } catch (error) {
                throw new ConnectorError(
                    `Failed to process additional items: ${error.message}`, 
                    this.name
                );
            }
        }
        
        process.stdout.write(chalk.blue.bold(this.name) + ' created\n');

        // Process pins
        if (pins != undefined) {
            try {
                this.processPins(pins);
            } catch (error) {
                throw new ConnectorError(
                    `Failed to create pins: ${error.message}`, 
                    this.name
                );
            }
        }
    }

    /**
     * Process pins from the provided array, handling both string and PinDefinition formats
     * @param pins - Array of pin definitions
     * @private
     */
    private processPins(pins: (string | PinDefinition)[]): void {
        pins.forEach((pin, index) => {
            if (typeof pin === 'string') {
                // Legacy string format - use sequential numbering
                const pinNumber = index + 1;
                this.pins.push(new Pin(this.name, pinNumber, pin));
                this.pin_count = Math.max(this.pin_count, pinNumber);
            } else if (typeof pin === 'object' && pin !== null) {
                // New PinDefinition format with explicit number and optional name
                if (typeof pin.number !== 'number' || isNaN(pin.number) || pin.number <= 0) {
                    throw new ValidationError(`Invalid pin number: ${pin.number}. Must be a positive number.`);
                }
                
                this.pins.push(new Pin(this.name, pin.number, pin.name));
                this.pin_count = Math.max(this.pin_count, pin.number);
            } else {
                throw new ValidationError(`Invalid pin definition: ${pin}`);
            }
        });
    }

    /**
     * Add a single pin to the connector
     * @param number - Pin number
     * @param name - Optional pin name/label
     * @returns This connector instance for method chaining
     * @throws {PinError} If the pin cannot be added
     */
    addPin(number: number, name?: string): Connector {
        try {
            if (typeof number !== 'number' || isNaN(number) || number <= 0) {
                throw new ValidationError(`Pin number must be a positive number, got: ${number}`);
            }
            
            // Check for duplicate pin number
            if (this.pins.some(p => p.number === number)) {
                throw new ValidationError(`Pin number ${number} already exists on connector ${this.name}`);
            }
            
            const pin = new Pin(this.name, number, name);
            this.pins.push(pin);
            this.pin_count = Math.max(this.pin_count, number);
            
            return this;
        } catch (error) {
            if (error instanceof ValidationError) {
                throw new PinError(error.message, this.name, number);
            } else {
                throw new PinError(`Failed to add pin: ${error.message}`, this.name, number);
            }
        }
    }

    /**
     * Add multiple pins to the connector
     * @param pins - Array of pin definitions or a number of sequential pins to add
     * @returns This connector instance for method chaining
     * @throws {ConnectorError} If pins cannot be added
     */
    addPins(pins: (string | PinDefinition | number)[] | number): Connector {
        try {
            // If pins is just a number, add that many sequential unnamed pins
            if (typeof pins === 'number') {
                const startNum = this.pins.length > 0 ? 
                    Math.max(...this.pins.map(p => p.number)) + 1 : 1;
                
                for (let i = 0; i < pins; i++) {
                    this.addPin(startNum + i);
                }
                return this;
            }
            
            // Otherwise, process the array
            pins.forEach((pin, index) => {
                if (typeof pin === 'number') {
                    // Just a pin number
                    this.addPin(pin);
                } else if (typeof pin === 'object' && pin !== null && 'number' in pin) {
                    // Object with number and optional name
                    this.addPin(pin.number, pin.name);
                } else if (typeof pin === 'string') {
                    // String - use next available pin number
                    const nextNum = this.pins.length > 0 ? 
                        Math.max(...this.pins.map(p => p.number)) + 1 : 1;
                    this.addPin(nextNum, pin);
                } else {
                    throw new ValidationError(`Invalid pin definition at index ${index}: ${pin}`);
                }
            });
            
            return this;
        } catch (error) {
            throw new ConnectorError(
                `Failed to add pins: ${error.message}`, 
                this.name
            );
        }
    }

    /**
     * Retrieves a pin from the connector by its number
     * @param pin - Pin number to retrieve
     * @returns The Pin object if found
     * @throws {PinError} If the pin doesn't exist on this connector
     */
    pin(pin: number): Pin {
        if (typeof pin !== 'number' || isNaN(pin)) {
            throw new PinError("Pin number must be a valid number", this.name, pin);
        }
        
        const existingPin = this.pins.find(p => p.number === pin);
        if (existingPin) {
            return existingPin;
        } else {
            throw new PinError("Pin does not exist", this.name, pin);
        }
    }
    
    /**
     * Validates that the connector has all required properties for diagram generation
     * @throws {ConnectorError} If validation fails
     */
    validate(): void {
        if (!this.name) {
            throw new ConnectorError("Missing name", this.name);
        }
        
        if (this.pins.length === 0) {
            throw new ConnectorError("Connector has no pins", this.name);
        }
        
        // Check for duplicate pin numbers
        const pinNumbers = new Set<number>();
        for (const pin of this.pins) {
            if (pinNumbers.has(pin.number)) {
                throw new ConnectorError(`Duplicate pin number: ${pin.number}`, this.name);
            }
            pinNumbers.add(pin.number);
        }
    }
}