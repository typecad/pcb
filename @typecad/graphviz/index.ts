import * as fs from 'fs/promises';
import levenshtein from "string-comparison";
import { PinType, Schematic, Component, Node } from './types';

interface ComponentGroup {
    name: string;
    components: Map<string, string>;
}

export interface options {
    powerHierarchy?: Map<string, number>;
    ignoredPrefixes?: Set<string>;
    theme?: 'light' | 'dark' | 'nord';
    ignoreNetNames?: boolean; // Option to ignore net names starting with "net"
}

const DEFAULT_IGNORED_PREFIXES = new Set(['R', 'C', 'L', 'D', 'SW', 'SJ']);

class SchematicAnalyzer {
    private readonly ignoredPrefixes: Set<string>;
    private readonly ignoreNetNames: boolean;
    private readonly theme: 'light' | 'dark' | 'nord';
    private components = new Map<string, string>();
    private groups = new Map<string, ComponentGroup>();
    private netColorCache = new Map<string, string>();
    private usedColors: Set<string> = new Set();

    constructor(
        private schematic: Schematic,
        options: options = {}
    ) {
        // Store ignoredPrefixes but don't use it for filtering components
        this.ignoredPrefixes = options.ignoredPrefixes ?? DEFAULT_IGNORED_PREFIXES;
        this.ignoreNetNames = options.ignoreNetNames ?? false; // Default to false (include all net names)
        this.theme = options.theme ?? 'light';

        if (!this.validateSchematic(schematic)) {
            throw new Error('Invalid schematic input');
        }
    }

    private validateSchematic(schematic: Schematic): boolean {
        return !!schematic && Array.isArray(schematic.components) && Array.isArray(schematic.Nodes);
    }


    // This method is kept for potential future use but currently returns true for all components
    private shouldIncludeComponent(component: Component): boolean {
        const prefixMatch = component.reference.match(/^[A-Za-z]+/);
        const prefix = prefixMatch ? prefixMatch[0] : '';
        return !this.ignoredPrefixes.has(prefix);
    }

    private getGroupName(prefix: string): string {
        const groupNames: Record<string, string> = {
            'BT': 'Power Sources',
            'VR': 'Voltage Regulators',
            'PS': 'Power Supplies',
            'U': 'Integrated Circuits',
            'SEN': 'Sensors',
            'PROG': 'Programmers',
            'LED': 'Indicators',
            'J': 'Connectors',
            'MISC': 'Miscellaneous',
        };
        return groupNames[prefix] || `${prefix} Components`;
    }

    private processComponents(): void {
        // Only process components that should be included
        this.schematic.components.forEach(component => {
            if (this.shouldIncludeComponent(component)) {
                const prefixMatch = component.reference.match(/^[A-Za-z]+/);
                const groupPrefix = prefixMatch ? prefixMatch[0] : 'MISC';
                const name = component.constructor?.name || component.footprint;
                this.components.set(component.reference, name);
                if (!this.groups.has(groupPrefix)) {
                    this.groups.set(groupPrefix, {
                        name: this.getGroupName(groupPrefix),
                        components: new Map(),
                    });
                }
                this.groups.get(groupPrefix)?.components.set(component.reference, name);
            }
        });
    }

    private getNetColor(netName: string): string {
        // Check if we already have a color for this net
        if (this.netColorCache.has(netName)) {
            return this.netColorCache.get(netName)!;
        }
        
        let color = '';
        const lowerName = netName.toLowerCase();
        
        // Define color palettes for each theme
        const nordThemeColors = ['#8FBCBB', '#88C0D0', '#81A1C1', '#5E81AC', '#B48EAD', '#A3BE8C', '#EBCB8B', '#D08770', '#BF616A', 
                                '#D8DEE9', '#E5E9F0', '#ECEFF4', '#5E81AC', '#81A1C1', '#88C0D0', '#8FBCBB'];
        
        const lightThemeColors = ['#0D47A1', '#1565C0', '#0288D1', '#00ACC1', '#009688', '#2E7D32', '#388E3C', '#827717', 
                                 '#EF6C00', '#D32F2F', '#7B1FA2', '#6A1B9A', '#AD1457', '#C62828', '#4527A0', '#283593'];
        
        const darkThemeColors = ['#90CAF9', '#64B5F6', '#4FC3F7', '#4DD0E1', '#4DB6AC', '#81C784', '#AED581', '#DCE775', 
                                '#FFD54F', '#FF8A65', '#BA68C8', '#F48FB1', '#E57373', '#9FA8DA', '#7986CB', '#5C6BC0'];
        
        // Assign special colors for common nets first
        if (this.theme === 'nord') {
            if (lowerName === 'gnd') {
                color = '#D8DEE9'; // Light gray for GND
            } else if (lowerName === 'vcc' || lowerName === '3v3') {
                color = '#BF616A'; // Red for VCC/3V3
            } else if (lowerName === 'vbus' || lowerName === '5v0') {
                color = '#EBCB8B'; // Yellow for VBUS/5V0
            }
        } else if (this.theme === 'light') {
            if (lowerName === 'gnd') {
                color = '#424242'; // Dark gray for GND
            } else if (lowerName === 'vcc' || lowerName === '3v3') {
                color = '#D32F2F'; // Bright red for VCC/3V3
            } else if (lowerName === 'vbus' || lowerName === '5v0') {
                color = '#FF8F00'; // Bright orange for VBUS/5V0
            }
        } else if (this.theme === 'dark') {
            if (lowerName === 'gnd') {
                color = '#BDBDBD'; // Light gray for GND
            } else if (lowerName === 'vcc' || lowerName === '3v3') {
                color = '#FF5252'; // Bright red for VCC/3V3
            } else if (lowerName === 'vbus' || lowerName === '5v0') {
                color = '#FFAB40'; // Bright orange for VBUS/5V0
            }
        }
        
        // If no special color was assigned or the color is already used by another net
        if (!color || this.usedColors.has(color)) {
            // Get the appropriate color palette based on theme
            const colorPalette = this.theme === 'nord' ? nordThemeColors : 
                                (this.theme === 'light' ? lightThemeColors : darkThemeColors);
            
            // Generate a hash from the net name
            const hash = Array.from(netName).reduce((acc, char) => char.charCodeAt(0) + ((acc << 5) - acc), 0);
            
            // Try to find an unused color
            let attempts = 0;
            while (attempts < colorPalette.length) {
                const index = (Math.abs(hash) + attempts) % colorPalette.length;
                const candidateColor = colorPalette[index];
                
                if (!this.usedColors.has(candidateColor)) {
                    color = candidateColor;
                    break;
                }
                attempts++;
            }
            
            // If all colors are used, create a slightly modified version of a color
            if (!color) {
                const baseIndex = Math.abs(hash) % colorPalette.length;
                const baseColor = colorPalette[baseIndex];
                
                // Convert hex to RGB, slightly modify it, and convert back to hex
                const r = parseInt(baseColor.slice(1, 3), 16);
                const g = parseInt(baseColor.slice(3, 5), 16);
                const b = parseInt(baseColor.slice(5, 7), 16);
                
                // Modify the color slightly based on the net name
                const modifier = (netName.length % 3) - 1;
                const newR = Math.min(255, Math.max(0, r + (modifier * 20)));
                const newG = Math.min(255, Math.max(0, g + ((modifier + 1) % 3) * 20));
                const newB = Math.min(255, Math.max(0, b + ((modifier + 2) % 3) * 20));
                
                color = `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
            }
        }
        
        // Mark this color as used
        this.usedColors.add(color);
        
        // Cache and return the color
        this.netColorCache.set(netName, color);
        return color;
    }

    private generateNetConnectivityDot(): string {
        const netConnections = new Map<string, Set<string>>();

        this.schematic.Nodes.forEach(net => {
            // Skip nets with names starting with "net" if ignoreNetNames is false
            if (!this.ignoreNetNames && net.name.toLowerCase().startsWith('net')) {
                return;
            }
            
            // Get all components connected to this net that should be included
            const connectedComponents = net.nodes
                .map(n => n.reference)
                .filter(ref => this.components.has(ref));
                
            if (connectedComponents.length > 0) {
                netConnections.set(net.name, new Set(connectedComponents));
            }
        });

        // Generate nodes for all nets
        const nodes = Array.from(netConnections.entries())
            .map(([net, components]) => this.generateNodeDot(net, components))
            .join('\n\n');

        // Generate clusters for all component groups
        const clusters = Array.from(this.groups.entries())
            .map(([prefix, group]) => this.generateClusterDot(prefix, group))
            .join('\n\n');

        // Apply theme-specific styling
        let bgColor = "transparent";
        let fontColor = "#333333";
        
        if (this.theme === 'dark') {
            bgColor = "transparent";
            fontColor = "#ECEFF4";
        } else if (this.theme === 'nord') {
            bgColor = "transparent";
            fontColor = "#ECEFF4";
        } else {
            // Light theme (default)
            bgColor = "white";
            fontColor = "#333333";
        }

        return `// install the Graphviz Interactive Preview to view this graph
digraph NetConnectivity {
    graph [rankdir=LR];
    node [shape=box, style="filled", fontname="Arial", fontcolor="${fontColor}"];
    edge [fontname="Arial", fontcolor="${fontColor}"];
    bgcolor="${bgColor}";
${clusters}
${nodes}
}`;
    }

    private generateNodeDot(net: string, components: Set<string>): string {
        const color = this.getNetColor(net);
        const connections = Array.from(components)
            .map(comp => this.generateEdgeDot(net, comp))
            .join('\n');
        return `
        "${net}" [label="${net}", shape=box, style="filled", fillcolor="${color}", color="${color}", fontname="Arial"];
        ${connections}
    `;
    }

    private generateEdgeDot(net: string, comp: string): string {
        const pinType = this.getPinTypeForNet(comp, net);
        let dirAttribute = 'forward'; // Default direction is forward (output)
        
        // Determine the direction based on pinType
        switch (pinType) {
            case 'input':
                dirAttribute = 'forward'; // Arrow points towards the net
                break;
            case 'output':
                dirAttribute = 'back'; // Arrow points away from the net
                break;
            case 'bidirectional':
                dirAttribute = 'both'; // Arrow points in both directions
                break;
            case 'power_in':
                dirAttribute = 'forward'; // Power flows into the component
                break;
            case 'power_out':
                dirAttribute = 'back'; // Power flows out of the component
                break;
            case 'tri_state':
                dirAttribute = 'both'; // Tri-state can act as both input and output
                break;
            case 'no_connect':
                dirAttribute = 'none'; // No arrow, no connection
                break;
            default:
                dirAttribute = 'forward'; // Default to forward if type is unknown
                break;
        }
    
        return `  "${net}" -> "${comp}" [label="${pinType}", style=solid, color="${this.getNetColor(net)}", fontcolor="${this.getNetColor(net)}", penwidth=1.5, fontsize=12, dir=${dirAttribute}];`;
    }

    private generateClusterDot(prefix: string, group: ComponentGroup): string {
        const bgColor = this.getComponentClusterColor(prefix);
        const components = Array.from(group.components.entries())
            .map(([ref, name]) => {
                const label = `${name} (${ref})`;
                return `    "${ref}" [label="${label}", shape=box, style="rounded,filled", fillcolor="${bgColor}", fontcolor="#333333"];`;
            })
            .join('\n');
        return `  subgraph cluster_${prefix} {
    style="rounded,filled";
    color="#AAAAAA";
    bgcolor="${bgColor}";
    label = "${group.name}";
    fontsize=12;
    fontcolor="#333333";
    penwidth=2;
    ${components}
      }`;
    }

    private getPinTypeForNet(reference: string, netName: string): string {
        const node = this.schematic.Nodes.find(net => net.name === netName);
        if (!node) return 'unknown';
        const pin = node.nodes.find(n => n.reference === reference);
        return pin?.type || 'unknown';
    }

    private getComponentClusterColor(prefix: string): string {
        // Use theme-specific component colors
        if (this.theme === 'dark') {
            const darkComponentColors: Record<string, string> = {
                'BT': '#BF616A',  // Red
                'VR': '#D08770',  // Orange
                'U': '#5E81AC',   // Blue
                'SEN': '#A3BE8C', // Green
                'PROG': '#B48EAD', // Purple
                'R': '#4C566A',   // Resistor - dark gray
                'C': '#4C566A',   // Capacitor - dark gray
                'L': '#4C566A',   // Inductor - dark gray
                'D': '#EBCB8B',   // Diode - yellow
                'SW': '#88C0D0',  // Switch - light blue
                'SJ': '#81A1C1'   // Solder jumper - blue-gray
            };
            return darkComponentColors[prefix] || '#434C5E';
        } else if (this.theme === 'nord') {
            const nordComponentColors: Record<string, string> = {
                'BT': '#BF616A',  // Red
                'VR': '#D08770',  // Orange
                'U': '#5E81AC',   // Blue
                'SEN': '#A3BE8C', // Green
                'PROG': '#B48EAD', // Purple
                'R': '#4C566A',   // Resistor - dark gray
                'C': '#4C566A',   // Capacitor - dark gray
                'L': '#4C566A',   // Inductor - dark gray
                'D': '#EBCB8B',   // Diode - yellow
                'SW': '#88C0D0',  // Switch - light blue
                'SJ': '#81A1C1'   // Solder jumper - blue-gray
            };
            return nordComponentColors[prefix] || '#434C5E';
        } else {
            // Light theme
            const lightComponentColors: Record<string, string> = {
                'BT': '#FF5733',  // Bright orange
                'VR': '#C70039',  // Red
                'U': '#3498DB',   // Blue
                'SEN': '#2ECC71', // Green
                'PROG': '#9B59B6', // Purple
                'R': '#E0E0E0',   // Resistor - light gray
                'C': '#E0E0E0',   // Capacitor - light gray
                'L': '#E0E0E0',   // Inductor - light gray
                'D': '#F1C40F',   // Diode - yellow
                'SW': '#5DADE2',  // Switch - light blue
                'SJ': '#85C1E9'   // Solder jumper - blue-gray
            };
            return lightComponentColors[prefix] || '#F5F5F5';
        }
    }

    private async writeDotFile(filename: string, content: string): Promise<void> {
        try {
            await fs.writeFile(filename, content);
        } catch (error) {
            console.error(`Failed to write file ${filename}:`, error);
            throw error;
        }
    }

    public async analyzeNetConnectivity(): Promise<string> {
        this.processComponents();
        const dot = this.generateNetConnectivityDot();
        await this.writeDotFile(`${this.schematic.sheetName}_net_connectivity.dot`, dot);
        console.log(`⚫ ${this.schematic.sheetName}_net_connectivity.dot written`);
        return dot;
    }

    private generateSchematicDot(): string {
        const components = Array.from(this.components.entries())
            .map(([reference, name]) => this.generateComponentWithPins(reference, name))
            .join('\n\n');
        
        const connections = this.generatePinConnections();
        
        // Apply theme-specific styling
        let bgColor = "white";
        let nodeColor = "lightgrey";
        let fontColor = "#333333";
        
        if (this.theme === 'dark') {
            bgColor = "transparent";
            nodeColor = "#2E3440";
            fontColor = "#ECEFF4";
        } else if (this.theme === 'nord') {
            bgColor = "transparent";
            nodeColor = "#3B4252";
            fontColor = "#ECEFF4";
        } else {
            // Light theme (default)
            bgColor = "white";
            nodeColor = "#F5F5F5";
            fontColor = "#333333";
        }
        
        // Add a legend node
        const legendNode = `  legend [shape=note, label="Note: Ground connections aren't shown", style="filled", fillcolor="#FFFFCC", fontcolor="#000000", fontsize=12];`;
        
        return `// install the Graphviz Interactive Preview to view this schematic
digraph ElectricalSchematic {
    rankdir=LR;
    bgcolor="${bgColor}";
    node [shape=record, style=filled, fillcolor="${nodeColor}", fontcolor="${fontColor}", penwidth=2];
    edge [dir=none, penwidth=2, fontcolor="${fontColor}"];
    
    ${components}
    
    ${connections}
    
    ${legendNode}
}`;
    }

    private generateComponentWithPins(reference: string, name: string): string {
        // Find all pins for this component
        const pins: Array<{number: number | string, name?: string, netName: string, type: PinType}> = [];
        
        // Get all pins from the schematic nodes
        this.schematic.Nodes.forEach(net => {
            net.nodes.forEach(node => {
                if (node.reference === reference) {
                    pins.push({
                        number: node.number,
                        name: node.name,
                        netName: net.name,
                        type: node.type
                    });
                }
            });
        });
        
        // Group pins by netName
        const pinsByNet = new Map<string, Array<{number: number | string, name?: string, netName: string, type: PinType}>>();
        pins.forEach(pin => {
            if (!pinsByNet.has(pin.netName)) {
                pinsByNet.set(pin.netName, []);
            }
            pinsByNet.get(pin.netName)?.push(pin);
        });
        
        // Create consolidated pins list
        const consolidatedPins: Array<{numbers: Array<number | string>, name?: string, netName: string, type: PinType}> = [];
        pinsByNet.forEach((netPins, netName) => {
            // Use the most common pin type for this net
            const typeCount = new Map<PinType, number>();
            netPins.forEach(pin => {
                typeCount.set(pin.type, (typeCount.get(pin.type) || 0) + 1);
            });
            let mostCommonType: PinType = 'passive';
            let maxCount = 0;
            typeCount.forEach((count, type) => {
                if (count > maxCount) {
                    maxCount = count;
                    mostCommonType = type;
                }
            });
            
            consolidatedPins.push({
                numbers: netPins.map(p => p.number),
                name: netPins[0].name,
                netName,
                type: mostCommonType
            });
        });
        
        // Sort consolidated pins by first pin number
        consolidatedPins.sort((a, b) => {
            const numA = typeof a.numbers[0] === 'string' ? parseInt(a.numbers[0] as string) : (a.numbers[0] as number);
            const numB = typeof b.numbers[0] === 'string' ? parseInt(b.numbers[0] as string) : (b.numbers[0] as number);
            return numA - numB;
        });
        
        // Special handling for two-pin passive components (C, R, L, F, D)
        const prefix = reference.match(/^[A-Za-z]+/)?.[0] || '';
        const isPassiveComponent = ['C', 'R', 'L', 'F', 'D'].includes(prefix);
        
        let leftPins: typeof consolidatedPins = [];
        let rightPins: typeof consolidatedPins = [];
        
        if (isPassiveComponent && consolidatedPins.length === 2) {
            // For passive components with exactly 2 pins, put pin 1 on left, pin 2 on right
            const pin1 = consolidatedPins.find(p => 
                p.numbers.includes(1) || p.numbers.includes('1'));
            const pin2 = consolidatedPins.find(p => 
                p.numbers.includes(2) || p.numbers.includes('2'));
                
            if (pin1 && pin2) {
                leftPins = [pin1];
                rightPins = [pin2];
            } else {
                // Fallback if pins aren't numbered 1 and 2
                leftPins = [consolidatedPins[0]];
                rightPins = [consolidatedPins[1]];
            }
        } else {
            // Regular handling for other components
            leftPins = consolidatedPins.filter(p => ['power_in', 'input', 'bidirectional'].includes(p.type));
            rightPins = consolidatedPins.filter(p => ['power_out', 'output', 'tri_state'].includes(p.type));
            const otherPins = consolidatedPins.filter(p => !leftPins.includes(p) && !rightPins.includes(p));
            
            // Add remaining pins to the side with fewer pins
            if (leftPins.length < rightPins.length) {
                leftPins.push(...otherPins);
            } else {
                rightPins.push(...otherPins);
            }
        }
        
        // Get component-specific color based on prefix
        const bgColor = this.getComponentClusterColor(prefix);
        
        // Format pins for left side
        const leftPinStr = leftPins.length > 0 ? 
            leftPins.map(p => {
                const pinLabel = p.numbers.length > 1 ? 
                    `${p.numbers.join(',')}` : 
                    `${p.numbers[0]}`;
                return `<p${p.numbers.join('_')}> ${pinLabel}: ${p.name || p.netName}`;
            }).join(' | ') : 
            "<empty> ";
        
        // Format pins for right side
        const rightPinStr = rightPins.length > 0 ? 
            rightPins.map(p => {
                const pinLabel = p.numbers.length > 1 ? 
                    `${p.numbers.join(',')}` : 
                    `${p.numbers[0]}`;
                return `<p${p.numbers.join('_')}> ${pinLabel}: ${p.name || p.netName}`;
            }).join(' | ') : 
            "<empty> ";
        
        // Create the component label with pins on both sides, including reference in the name
        return `    "${reference}" [label="{ {${leftPinStr}} | ${name} (${reference}) | {${rightPinStr}} }", fillcolor="${bgColor}"];
        
        // Add invisible edges to align pins
        edge [style=invis];
        ${this.generateInvisibleEdges(reference, leftPins, rightPins)}`;
    }

    private generateInvisibleEdges(
        reference: string,
        leftPins: { numbers: Array<string | number> }[],
        rightPins: { numbers: Array<string | number> }[],
    ): string {
        const leftEdges = leftPins.length > 1 ? 
            leftPins.slice(0, -1).map((p, i) => 
                `"${reference}":p${p.numbers.join('_')} -> "${reference}":p${leftPins[i+1].numbers.join('_')}`
            ).join(';\n    ') : '';
        
        const rightEdges = rightPins.length > 1 ? 
            rightPins.slice(0, -1).map((p, i) => 
                `"${reference}":p${p.numbers.join('_')} -> "${reference}":p${rightPins[i+1].numbers.join('_')}`
            ).join(';\n    ') : '';
        
        return [leftEdges, rightEdges].filter(e => e).join(';\n    ');
    }

    private generatePinConnections(): string {
        const connections: string[] = [];
        
        // Create a map of net to component pins
        const netMap = new Map<string, Map<string, string[]>>();
        
        this.schematic.Nodes.forEach(net => {
            // Skip ground nets
            if (net.name.toLowerCase() === 'gnd' || net.name.toLowerCase() === 'ground') {
                return;
            }
            
            // Include all other nets
            // Group nodes by component reference
            const componentNodes = new Map<string, number[]>();
            net.nodes.forEach(node => {
                if (this.components.has(node.reference)) {
                    if (!componentNodes.has(node.reference)) {
                        componentNodes.set(node.reference, []);
                    }
                    componentNodes.get(node.reference)?.push(
                        typeof node.number === 'string' ? parseInt(node.number) : node.number
                    );
                }
            });
            
            // Add to netMap
            if (!netMap.has(net.name)) {
                netMap.set(net.name, new Map());
            }
            
            componentNodes.forEach((pins, component) => {
                netMap.get(net.name)?.set(component, pins.map(p => p.toString()));
            });
        });
        
        // Create connections for each net
        netMap.forEach((components, net) => {
            if (components.size < 2) return;
            
            const color = this.getNetColor(net);
            const pinConnections: string[] = [];
            
            // Create an array of all component:pin pairs
            const allPins: string[] = [];
            components.forEach((pins, component) => {
                allPins.push(`"${component}":p${pins.join('_')}`);
            });
            
            // Connect all pins in this net
            for (let i = 0; i < allPins.length - 1; i++) {
                pinConnections.push(`    // Connection for net: ${net}
    edge [style=solid, color="${color}"];
    ${allPins[i]} -> ${allPins[i+1]};`);
            }
            
            connections.push(pinConnections.join('\n\n'));
        });
        
        return connections.join('\n\n');
    }

    private async writeSchematicDotFile(filename: string, content: string): Promise<void> {
        try {
            await fs.writeFile(filename, content);
        } catch (error) {
            console.error(`Failed to write file ${filename}:`, error);
            throw error;
        }
    }

    public async generateSchematic(): Promise<string> {
        this.processComponents();
        const dot = this.generateSchematicDot();
        await this.writeSchematicDotFile(`${this.schematic.sheetName}_schematic.dot`, dot);
        console.log(`⚫ ${this.schematic.sheetName}_schematic.dot written`);
        return dot;
    }

    private generateConnectivityClusters(): Map<string, Set<string>> {
        // Map to store clusters of components
        const clusters = new Map<string, Set<string>>();
        // Map to track which components have been assigned to clusters
        const assignedComponents = new Set<string>();
        // Counter for generating unique cluster IDs
        let clusterCounter = 0;
        
        // First, build a component-to-component connectivity map
        const componentConnections = new Map<string, Set<string>>();
        
        // Populate the component connections map
        this.schematic.Nodes.forEach(net => {
            const connectedComponents = net.nodes
                .filter(n => this.components.has(n.reference))
                .map(n => n.reference);
                
            // For each component in this net, add connections to all other components
            connectedComponents.forEach(comp1 => {
                if (!componentConnections.has(comp1)) {
                    componentConnections.set(comp1, new Set());
                }
                
                connectedComponents.forEach(comp2 => {
                    if (comp1 !== comp2) {
                        componentConnections.get(comp1)?.add(comp2);
                    }
                });
            });
        });
        
        // Function to identify isolated component pairs (e.g., resistor connected to only one other component)
        const findIsolatedPairs = () => {
            for (const [comp, connections] of componentConnections.entries()) {
                // Skip if this component is already assigned to a cluster
                if (assignedComponents.has(comp)) continue;
                
                // Check if this component is connected to only one other component
                if (connections.size === 1) {
                    const connectedComp = Array.from(connections)[0];
                    
                    // Check if the connected component is also only connected to this component
                    const reverseConnections = componentConnections.get(connectedComp);
                    if (reverseConnections && reverseConnections.size === 1 && 
                        reverseConnections.has(comp) && !assignedComponents.has(connectedComp)) {
                        
                        // Create a new cluster for this isolated pair
                        const clusterId = `cluster_${clusterCounter++}`;
                        clusters.set(clusterId, new Set([comp, connectedComp]));
                        
                        // Mark these components as assigned
                        assignedComponents.add(comp);
                        assignedComponents.add(connectedComp);
                        
                        return true; // Found a pair
                    }
                }
            }
            return false; // No more pairs found
        };
        
        // Function to find components connected to existing clusters
        const expandClusters = () => {
            let expanded = false;
            
            for (const [clusterId, components] of clusters.entries()) {
                // Check each component in the cluster
                for (const comp of components) {
                    const connections = componentConnections.get(comp) || new Set();
                    
                    // Check each connected component
                    for (const connectedComp of connections) {
                        // If not already in a cluster, add it
                        if (!assignedComponents.has(connectedComp)) {
                            clusters.get(clusterId)?.add(connectedComp);
                            assignedComponents.add(connectedComp);
                            expanded = true;
                        }
                    }
                }
            }
            
            return expanded;
        };
        
        // First, find all isolated pairs
        while (findIsolatedPairs()) {
            // Continue finding pairs until no more are found
        }
        
        // Then expand clusters by adding connected components
        while (expandClusters()) {
            // Continue expanding until no more components can be added
        }
        
        // Add any remaining unassigned components to their own clusters
        for (const comp of this.components.keys()) {
            if (!assignedComponents.has(comp)) {
                const clusterId = `cluster_${clusterCounter++}`;
                clusters.set(clusterId, new Set([comp]));
                assignedComponents.add(comp);
            }
        }
        
        return clusters;
    }

    public generateConnectivityBasedDot(): string {
        this.processComponents();
        const connectivityClusters = this.generateConnectivityClusters();
        
        // Generate cluster definitions
        const clusterDefs = Array.from(connectivityClusters.entries())
            .map(([clusterId, components]) => {
                const componentNodes = Array.from(components)
                    .map(comp => {
                        const name = this.components.get(comp) || comp;
                        return `    "${comp}" [label="${name} (${comp})", shape=box, style="rounded,filled", fillcolor="#E0E0E0", fontcolor="#333333"];`;
                    })
                    .join('\n');
                
                return `  subgraph ${clusterId} {
    style="rounded,filled";
    color="#AAAAAA";
    bgcolor="#F5F5F5";
    label = "Connected Group";
    fontsize=12;
    fontcolor="#333333";
    penwidth=2;
${componentNodes}
  }`;
            })
            .join('\n\n');
        
        // Generate connections between components
        const connections: string[] = [];
        this.schematic.Nodes.forEach(net => {
            // Skip ground nets
            if (net.name.toLowerCase() === 'gnd' || net.name.toLowerCase() === 'ground') {
                return;
            }
            
            const components = net.nodes
                .filter(n => this.components.has(n.reference))
                .map(n => n.reference);
                
            if (components.length >= 2) {
                const color = this.getNetColor(net.name);
                
                for (let i = 0; i < components.length - 1; i++) {
                    connections.push(`  "${components[i]}" -> "${components[i+1]}" [label="${net.name}", style=solid, color="${color}", fontcolor="${color}", penwidth=1.5, fontsize=10];`);
                }
            }
        });
        
        return `// install the Graphviz Interactive Preview to view this graph
digraph ConnectivityBasedClusters {
    graph [rankdir=LR];
    node [shape=box, style="filled", fontname="Arial"];
    edge [fontname="Arial"];
    bgcolor="transparent";
    
${clusterDefs}
    
${connections.join('\n')}
}`;
    }

    public async analyzeConnectivityClusters(): Promise<string> {
        this.processComponents();
        const dot = this.generateConnectivityBasedDot();
        await this.writeDotFile(`${this.schematic.sheetName}_connectivity_clusters.dot`, dot);
        console.log(`⚫ ${this.schematic.sheetName}_connectivity_clusters.dot written`);
        return dot;
    }

    // Add a helper method to check if a component should be ignored
    private shouldIgnoreComponent(reference: string): boolean {
        const prefixMatch = reference.match(/^[A-Za-z]+/);
        const prefix = prefixMatch ? prefixMatch[0] : '';
        return this.ignoredPrefixes.has(prefix);
    }
}

export async function graphviz(
    schematic: Schematic,
    options: options = {}
): Promise<string> {
    const analyzer = new SchematicAnalyzer(schematic, {
        theme: options.theme ?? 'dark',
        ignoredPrefixes: options.ignoredPrefixes ?? DEFAULT_IGNORED_PREFIXES,
        powerHierarchy: options.powerHierarchy,
        ignoreNetNames: options.ignoreNetNames ?? false, // Default to false (include all net names)
    });

    return analyzer.analyzeNetConnectivity();
}

export async function schematic(
    schematic: Schematic,
    options: options = {}
): Promise<string> {
    const analyzer = new SchematicAnalyzer(schematic, {
        theme: options.theme ?? 'dark',
        ignoredPrefixes: options.ignoredPrefixes ?? new Set(), // Empty set to include all components
        powerHierarchy: options.powerHierarchy,
        ignoreNetNames: false, // Always include all nets for schematic view
    });

    return analyzer.generateSchematic();
}

export async function connectivityClusters(
    schematic: Schematic,
    options: options = {}
): Promise<string> {
    const analyzer = new SchematicAnalyzer(schematic, {
        theme: options.theme ?? 'dark',
        ignoredPrefixes: options.ignoredPrefixes ?? DEFAULT_IGNORED_PREFIXES,
        powerHierarchy: options.powerHierarchy,
        ignoreNetNames: options.ignoreNetNames ?? false,
    });

    return analyzer.analyzeConnectivityClusters();
}
