import { PinError, ValidationError } from "./errors";

/**
 * Valid side values for a pin
 */
export type PinSide = "w" | "e" | undefined;

/**
 * Represents a pin on a connector in a wiring harness
 */
export class Pin {
    number: number = 0;
    owner: string;
    name: string = '';
    side?: PinSide; // Side property for graphviz generation ("w" for west/left, "e" for east/right)

    /**
     * Creates a new pin
     * @param owner - Name of the connector that owns this pin
     * @param number - Pin number
     * @param name - Optional name/label for the pin
     * @throws {ValidationError} If pin parameters are invalid
     */
    constructor(owner: string, number: number, name?: string) {
        if (!owner) {
            throw new ValidationError("Pin owner (connector name) is required");
        }
        
        if (typeof number !== 'number' || isNaN(number) || number <= 0) {
            throw new ValidationError(`Pin number must be a positive number, got: ${number}`);
        }
        
        this.owner = owner;
        this.number = number;
        
        if (name !== undefined) {
            if (typeof name !== 'string') {
                throw new ValidationError("Pin name must be a string");
            }
            this.name = name;
        }
    }
    
    /**
     * Sets the side of the pin for diagram generation
     * @param side - "w" for west/left or "e" for east/right
     * @returns This pin instance for method chaining
     * @throws {PinError} If the side value is invalid
     */
    setSide(side: PinSide): Pin {
        if (side !== "w" && side !== "e" && side !== undefined) {
            throw new PinError(
                `Invalid side value: ${side}. Must be "w", "e", or undefined`,
                this.owner,
                this.number
            );
        }
        
        this.side = side;
        return this;
    }
    
    /**
     * Creates a string representation of the pin
     * @returns String in the format "owner:number[:name]"
     */
    toString(): string {
        return `${this.owner}:${this.number}${this.name ? ':' + this.name : ''}`;
    }
}