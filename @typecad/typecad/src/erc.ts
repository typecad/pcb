import { Schematic } from "./schematic.js";
import { Pin } from "./pin.js";
import chalk from 'chalk';
import { TypeCadError } from "./errors.js";
import logger from "./logging.js";

interface ErcContext {
    errors: string[];
    warnings: string[];
}

/**
 * Performs electrical rule checks on a given schematic.
 * Logs errors and warnings based on pin connections.
 *
 * @param {Schematic} schematic - The schematic to perform ERC on.
 * @param {boolean} exit_on_error - Whether to exit the process on errors. Defaults to true.
 */
export function erc(schematic: Schematic, exit_on_error: boolean = true) {
    const context: ErcContext = {
        errors: [],
        warnings: []
    };
    
    // loop through all nodes checking each pin connection
    schematic.Nodes.forEach(_node => {
        erc_node_pin(_node.nodes, context);
        
        // Perform power-aware checks on this node
        erc_power_checks(_node.nodes, _node.name || 'unnamed', context);
        
        _node.nodes.forEach(pin => {
            _node.nodes.forEach(pin2 => {
                if (pin.reference === pin2.reference) {
                    return; // we don't need to check the pin against itself
                }
                erc_pin_pin(pin, pin2, context);
            });
        });
    });

    if (context.errors.length > 0) {
        context.errors.forEach(error => {
            logger.error(chalk.whiteBright.bgRed(`👺 ERC error:`) +  ` ${error}`);
        });
    }

    if (context.warnings.length > 0) {
        context.warnings.forEach(warning => {
            logger.warn(chalk.whiteBright.bgYellow(`ERC warning:`) +  ` ${warning}`);
        });
    }

    logger.info(chalk.bold.magentaBright('🧐 ERC') + ` ${context.errors.length} errors, ${context.warnings.length} warnings`);
    if (context.errors.length > 0 && exit_on_error) {
        throw new TypeCadError(`ERC failed with ${context.errors.length} errors`);
    }
}

/**
 * Checks each node's pins to ensure that input and power input pins are driven by the appropriate output pins.
 *
 * @param {Pin[]} nodes - The array of pins in a node to check.
 */
function erc_node_pin(nodes: Pin[], context: ErcContext) {
    // input pin not driven to any output pin
    nodes.forEach(pin => {
        if (pin.type === 'input') {
            const hasInput = nodes.some(pin2 => pin2.type === 'output');
            if (!hasInput) {
                context.errors.push(`input pin ${pin.reference}:${pin.number} not driven by an output pin`);
            }
        }
    });

    // input pin not driven to any output pin
    nodes.forEach(pin => {
        if (pin.type === 'power_in') {
            const hasInput = nodes.some(pin2 => pin2.type === 'power_out');
            if (!hasInput) {
                context.errors.push(`power_in pin ${pin.reference}:${pin.number} not driven by a power_out pin. Use [pin].type = 'power_out' to designate a power_out pin`);
            }
        }
    });

}

/**
 * Checks the connections between two pins and logs errors or warnings based on their types.
 *
 * @param {Pin} pin1 - The first pin to check.
 * @param {Pin} pin2 - The second pin to check.
 */
/**
 * Shared ERC checks for open_collector and open_emitter pin types.
 * Both share the same rules for output (error), tri_state (warning),
 * unspecified (warning), and power_out (error).
 */
function checkOpenPinErc(pin1: Pin, pin2: Pin, pinType: string, context: ErcContext): void {
    if (pin2.type === 'output') {
        context.errors.push(`${pinType} pin ${pin1.reference}:${pin1.number} connected to output pin ${pin2.reference}:${pin2.number}`);
    }
    if (pin2.type === 'tri_state') {
        context.warnings.push(`${pinType} pin ${pin1.reference}:${pin1.number} connected to tri_state pin ${pin2.reference}:${pin2.number}`);
    }
    if (pin2.type === 'unspecified') {
        context.warnings.push(`${pinType} pin ${pin1.reference}:${pin1.number} connected to unspecified pin ${pin2.reference}:${pin2.number}`);
    }
    if (pin2.type === 'power_out') {
        context.errors.push(`${pinType} pin ${pin1.reference}:${pin1.number} connected to power_out pin ${pin2.reference}:${pin2.number}`);
    }
}

function erc_pin_pin(pin1: Pin, pin2: Pin, context: ErcContext) {
    // check pin-to-pin connections
    switch (pin1.type) {
        case 'input':
            if (pin2.type === 'unspecified') {
                context.warnings.push(`input pin ${pin1.reference}:${pin1.number} connected to unspecified pin ${pin2.reference}:${pin2.number}`);
            }
            break;
        case 'output':
            if (pin2.type === 'bidirectional') {
                context.errors.push(`output pin ${pin1.reference}:${pin1.number} connected to bidirectional pin ${pin2.reference}:${pin2.number}`);
            }
            break;
        case 'tri_state':
            if (pin2.type === 'output') {
                context.warnings.push(`tri_state pin ${pin1.reference}:${pin1.number} connected to output pin ${pin2.reference}:${pin2.number}`);
            }
            break;
        case 'unspecified':
            if (pin2.type !== 'free') {
                context.warnings.push(`unspecified pin ${pin1.reference}:${pin1.number} connected to non-free pin ${pin2.reference}:${pin2.number}`);
            }
            break;
        case 'power_in':
            if (pin2.type === 'tri_state') {
                context.warnings.push(`power_in pin ${pin1.reference}:${pin1.number} connected to tri_state pin ${pin2.reference}:${pin2.number}`);
            }
            if (pin2.type === 'unspecified') {
                context.warnings.push(`power_in pin ${pin1.reference}:${pin1.number} connected to unspecified pin ${pin2.reference}:${pin2.number}`);
            }
            break;
        case 'power_out':
            if (pin2.type === 'output') {
                context.errors.push(`power_out pin ${pin1.reference}:${pin1.number} connected to output pin ${pin2.reference}:${pin2.number}`);
            }
            if (pin2.type === 'bidirectional') {
                context.warnings.push(`power_out pin ${pin1.reference}:${pin1.number} connected to bidirectional pin ${pin2.reference}:${pin2.number}`);
            }
            if (pin2.type === 'tri_state') {
                context.errors.push(`power_out pin ${pin1.reference}:${pin1.number} connected to tri_state pin ${pin2.reference}:${pin2.number}`);
            }
            if (pin2.type === 'unspecified') {
                context.warnings.push(`power_out pin ${pin1.reference}:${pin1.number} connected to unspecified pin ${pin2.reference}:${pin2.number}`);
            }
            if (pin2.type === 'power_out') {
                context.errors.push(`power_out pin ${pin1.reference}:${pin1.number} connected to power_out pin ${pin2.reference}:${pin2.number}`);
            }
            break;
        case 'open_collector':
            checkOpenPinErc(pin1, pin2, 'open_collector', context);
            break;
        case 'open_emitter':
            checkOpenPinErc(pin1, pin2, 'open_emitter', context);
            if (pin2.type === 'bidirectional') {
                context.warnings.push(`open_emitter pin ${pin1.reference}:${pin1.number} connected to bidirectional pin ${pin2.reference}:${pin2.number}`);
            }
            break;
        case 'no_connect':
            context.warnings.push(`no_connect pin ${pin1.reference}:${pin1.number} connected to ${pin2.reference}:${pin2.number}`);
            break;
        default:
            break;
    }
}

/**
 * Performs power-aware electrical rule checks on a node's pins.
 * Checks voltage ranges, current capacity, and power supply compatibility.
 *
 * @param {Pin[]} nodes - The array of pins in a node to check.
 * @param {string} netName - The name of the net (for error reporting).
 */
function erc_power_checks(nodes: Pin[], netName: string, context: ErcContext) {
    // Find power output pins that establish net voltage
    const powerOutputPins = nodes.filter(pin => pin.type === 'power_out' && pin.powerInfo);
    const powerInputPins = nodes.filter(pin => pin.type === 'power_in' && pin.powerInfo);
    const allPinsWithPowerInfo = nodes.filter(pin => pin.powerInfo);

    // 1. Check for voltage range conflicts between power output pins
    if (powerOutputPins.length > 1) {
        const voltageRanges = powerOutputPins.map(pin => ({
            pin,
            min: pin.powerInfo?.minimum_voltage ?? -Infinity,
            max: pin.powerInfo?.maximum_voltage ?? Infinity
        }));

        for (let i = 0; i < voltageRanges.length; i++) {
            for (let j = i + 1; j < voltageRanges.length; j++) {
                const range1 = voltageRanges[i];
                const range2 = voltageRanges[j];
                
                const overlapMin = Math.max(range1.min, range2.min);
                const overlapMax = Math.min(range1.max, range2.max);
                
                if (overlapMin > overlapMax) {
                    context.errors.push(`Voltage range conflict on net "${netName}": ${range1.pin.reference}:${range1.pin.number} (${range1.min}V to ${range1.max}V) incompatible with ${range2.pin.reference}:${range2.pin.number} (${range2.min}V to ${range2.max}V)`);
                }
            }
        }
    }

    // 2. Check if power input pins can accept voltage from power output pins
    if (powerOutputPins.length > 0 && powerInputPins.length > 0) {
        powerOutputPins.forEach(outputPin => {
            if (!outputPin.powerInfo) return;
            
            const outputMin = outputPin.powerInfo.minimum_voltage ?? -Infinity;
            const outputMax = outputPin.powerInfo.maximum_voltage ?? Infinity;
            
            powerInputPins.forEach(inputPin => {
                if (!inputPin.powerInfo) return;
                
                const inputMin = inputPin.powerInfo.minimum_voltage ?? -Infinity;
                const inputMax = inputPin.powerInfo.maximum_voltage ?? Infinity;
                
                const overlapMin = Math.max(outputMin, inputMin);
                const overlapMax = Math.min(outputMax, inputMax);
                
                if (overlapMin > overlapMax) {
                    context.errors.push(`Voltage incompatibility on net "${netName}": power output ${outputPin.reference}:${outputPin.number} (${outputMin}V to ${outputMax}V) cannot supply power input ${inputPin.reference}:${inputPin.number} (accepts ${inputMin}V to ${inputMax}V)`);
                }
            });
        });
    }

    // 3. Check current capacity vs demand
    const totalCurrentDemand = allPinsWithPowerInfo
        .filter(pin => pin.type === 'power_in' && pin.powerInfo?.current)
        .reduce((sum, pin) => sum + (pin.powerInfo?.current ?? 0), 0);
    
    const totalCurrentSupply = allPinsWithPowerInfo
        .filter(pin => pin.type === 'power_out' && pin.powerInfo?.current)
        .reduce((sum, pin) => sum + (pin.powerInfo?.current ?? 0), 0);

    if (totalCurrentDemand > 0 && totalCurrentSupply > 0) {
        if (totalCurrentDemand > totalCurrentSupply) {
            context.errors.push(`Current capacity exceeded on net "${netName}": ${totalCurrentDemand}A demanded but only ${totalCurrentSupply}A supplied`);
        } else if (totalCurrentDemand > totalCurrentSupply * 0.8) {
            context.warnings.push(`High current utilization on net "${netName}": ${totalCurrentDemand}A demanded from ${totalCurrentSupply}A capacity (${((totalCurrentDemand/totalCurrentSupply)*100).toFixed(1)}% utilization)`);
        }
    }

    // 4. Check for overvoltage conditions that could damage components
    allPinsWithPowerInfo.forEach(pin => {
        if (!pin.powerInfo) return;
        
        const maxVoltageOnNet = Math.max(
            ...powerOutputPins
                .filter(p => p.powerInfo?.maximum_voltage !== undefined)
                .map(p => p.powerInfo!.maximum_voltage!),
            0
        );
        
        if (pin.powerInfo.maximum_voltage !== undefined && maxVoltageOnNet > pin.powerInfo.maximum_voltage) {
            context.errors.push(`Overvoltage risk on net "${netName}": ${pin.reference}:${pin.number} maximum rating (${pin.powerInfo.maximum_voltage}V) exceeded by net voltage (${maxVoltageOnNet}V)`);
        }
    });

    // 5. Power pins without power metadata are currently tolerated for backward compatibility.
}
