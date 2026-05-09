import { Connector } from "./connector";
import { Cable } from "./cable";
import chalk from 'chalk';
import { generateGraphviz, writeGraphvizToFile } from "./graphviz";
import fs from 'node:fs';
import { BomError, DiagramError, TypeCadWiringError, ValidationError } from "./errors";

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
            
            try {
                // Run connector validation
                connector.validate();
                
                // Add to collection
                this.Connectors.push(connector);
                process.stdout.write(chalk.blue.bold(connector.name) + ' added\n');
                
            } catch (error) {
                if (error instanceof TypeCadWiringError) {
                    throw error;
                } else {
                    throw new ValidationError(`Error adding connector ${connector.name}: ${error.message}`);
                }
            }
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
            
            try {
                // Run cable validation
                cable.validate();
                
                // Add to collection
                this.Cables.push(cable);
                process.stdout.write(chalk.blue.bold(cable.name) + ' added\n');
                
            } catch (error) {
                if (error instanceof TypeCadWiringError) {
                    throw error;
                } else {
                    throw new ValidationError(`Error adding cable ${cable.name}: ${error.message}`);
                }
            }
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
                throw new DiagramError(`Failed to create diagram: ${error.message}`, filename);
            }
        }
    }

    /**
     * Generates a Bill of Materials (BOM) as a CSV file
     * 
     * @param filename - The name of the file to write the BOM to (defaults to 'wiring-bom.csv')
     * @returns This wiring instance for method chaining
     * @throws {BomError} If BOM generation fails
     */
    bom(filename: string = 'wiring-bom.csv'): Wiring {
        if (!filename) {
            throw new ValidationError("Filename is required");
        }
        
        try {
            const csvHeader = 'Designator,Description,Quantity,MPN\n';
            const rows: string[] = [];

            // Add cables to BOM
            this.Cables.forEach(cable => {
                const shieldText = cable.nets.some(net => net.isShield) ? ' shielded' : '';
                const connectionCount = cable.nets.filter(net => !net.isShield).length;

                if (cable.bundle) {
                    // For bundled cables, count each wire individually
                    // First add a general description line for the cable type
                    let description = `Wire ${cable.type}`;
                    if (connectionCount > 0) {
                        description += ` ${connectionCount}x`;
                    }
                    if (cable.gauge) {
                        description += ` ${cable.gauge}`;
                    }
                    if (cable.length) {
                        description += ` ${cable.length}`;
                    }

                    rows.push(`${cable.name},${description},${connectionCount},${cable.mpn}`);
                } else {
                    // For non-bundled cables, add as a single item
                    let description = cable.type;
                    if (connectionCount > 0) {
                        description += ` ${connectionCount}x`;
                    }
                    if (cable.gauge) {
                        description += ` ${cable.gauge}`;
                    }
                    description += shieldText;

                    // Add length to the description if available
                    if (cable.length) {
                        description += ` ${cable.length}`;
                    }

                    rows.push(`${cable.name},${description},1,${cable.mpn}`);
                }

                // Add cable additionals to BOM
                if (cable.additionals && cable.additionals.length > 0) {
                    cable.additionals.forEach(additional => {
                        if (additional.item) {
                            // Use the provided quantity or default to 1 if it's 0 or undefined
                            const quantity = additional.quantity > 0 ? additional.quantity : 1;
                            rows.push(`${cable.name},${additional.item},${quantity},${additional.mpn || ''}`);
                        }
                    });
                }
            });

            // Add connectors to BOM
            this.Connectors.forEach(connector => {
                let description = connector.type;
                if (connector.subtype) {
                    description += ` ${connector.subtype}`;
                }
                description += ` ${connector.pin_count}-pin`;

                rows.push(`${connector.name},${description},1,${connector.mpn}`);

                // Add connector additionals to BOM
                if (connector.additionals && connector.additionals.length > 0) {
                    connector.additionals.forEach(additional => {
                        if (additional.item) {
                            const quantity = additional.quantity > 0 ? additional.quantity : 1;
                            rows.push(`${connector.name},${additional.item},${quantity},${additional.mpn || ''}`);
                        }
                    });
                }
            });

            // Write to CSV file
            const csvContent = csvHeader + rows.join('\n');
            
            try {
                fs.writeFileSync(filename, csvContent, 'utf8');
            } catch (fsError) {
                throw new BomError(
                    `Failed to write BOM file: ${fsError.message}`, 
                    filename
                );
            }

            process.stdout.write(chalk.green.bold('BOM successfully written to ') + filename + '\n');
            return this;
            
        } catch (error) {
            if (error instanceof TypeCadWiringError) {
                throw error;
            } else {
                throw new BomError(`Failed to generate BOM: ${error.message}`, filename);
            }
        }
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