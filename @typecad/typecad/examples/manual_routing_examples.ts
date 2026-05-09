/**
 * Examples demonstrating manual route specification in TypeCAD
 *
 * This file shows various use cases for the routes and excludeConnections
 * options when using route() or autoroute().
 */

import { PCB, Component, IConnectionIdentifier } from '../index.js';
import { IRoutePath } from '../pcb/pcb_interfaces.js';

// ============================================================================
// EXAMPLE 0: The Simplest Use Case - Reuse a Previous Route!
// ============================================================================
// This is the PRIMARY use case and demonstrates the power of the new API.
// Route something once, then reuse that exact result when routing a larger net.

function example0_simpleReuse() {
    const pcb = new PCB();

    const mcu = new Component({ reference: 'U1' });
    const sensor1 = new Component({ reference: 'U2' });
    const sensor2 = new Component({ reference: 'U3' });

    // First, route just the critical connection to get it perfect
    const criticalRoute = pcb.autoroute({
        from: mcu.pin('DATA'),
        to: sensor1.pin('DATA'),
        width: 0.2,
        clearance: 0.2
    });

    // Later, route the full net and reuse the proven path
    const dataPins = [mcu.pin('DATA'), sensor1.pin('DATA'), sensor2.pin('DATA')];
    pcb.net(...dataPins);
    pcb.named('DATA_BUS');

    pcb.route({
        from: dataPins[0],
        to: dataPins.slice(1),
        net: 'DATA_BUS',
        width: 0.2,
        clearance: 0.2,
        routes: [
            criticalRoute  // Just pass the result directly!
        ]
    });

    // That's it! No need to extract paths or manually build IRoutePath objects.
}

// ============================================================================
// EXAMPLE 1: Basic Manual Route Specification
// ============================================================================
// Use case: You want to control the exact path of one critical connection
// while letting the autorouter handle the rest of the net.

function example1_basicManualRoute() {
    const pcb = new PCB();

    // Create some components
    const mcu = new Component({ reference: 'U1', value: 'STM32F103' });
    const sensor1 = new Component({ reference: 'U2', value: 'BME280' });
    const sensor2 = new Component({ reference: 'U3', value: 'BMP180' });

    // Connect them to an I2C bus
    const sdaPins = [mcu.pin('SDA'), sensor1.pin('SDA'), sensor2.pin('SDA')];
    pcb.net(...sdaPins);
    pcb.named('I2C_SDA');

    // Define a manual path for the critical MCU-to-sensor1 connection
    const criticalPath: IRoutePath = {
        nodes: [
            { x: 50, y: 50, layer: 'F.Cu' },   // From U1.SDA
            { x: 60, y: 50, layer: 'F.Cu' },   // Waypoint 1
            { x: 60, y: 70, layer: 'F.Cu' },   // Waypoint 2
            { x: 75, y: 70, layer: 'F.Cu' }    // To U2.SDA
        ],
        length: 45,
        viaCount: 0,
        success: true
    };

    // Route the net with one manual connection
    pcb.route({
        from: sdaPins[0],
        to: sdaPins.slice(1),
        net: 'I2C_SDA',
        width: 0.2,
        clearance: 0.2,
        routes: [
            criticalPath  // Can be IRoutePath or IAutorouteResult
        ]
    });

    // Result: U1->U2 uses the manual path, U2->U3 is autorouted
}

// ============================================================================
// EXAMPLE 2: Excluding Connections for Later Manual Routing
// ============================================================================
// Use case: You want to autoroute most connections, but handle some manually
// in the PCB editor because they need special attention.

function example2_excludeConnections() {
    const pcb = new PCB();

    const vreg = new Component({ reference: 'U1', value: 'LM1117' });
    const cap1 = new Component({ reference: 'C1', value: '10uF' });
    const cap2 = new Component({ reference: 'C2', value: '10uF' });
    const cap3 = new Component({ reference: 'C3', value: '100nF' });

    // Create power net
    const vregOut = vreg.pin('OUT');
    const cap1Pin = cap1.pin('1');
    const cap2Pin = cap2.pin('1');
    const cap3Pin = cap3.pin('1');
    const powerPins = [vregOut, cap1Pin, cap2Pin, cap3Pin];
    pcb.net(...powerPins);
    pcb.named('+3V3');

    // Route the net, but exclude the high-current connection to C1
    // (you'll route this manually with wider traces in KiCAD)
    pcb.route({
        from: powerPins[0],
        to: powerPins.slice(1),
        net: '+3V3',
        width: 0.5,
        clearance: 0.3,
        excludeConnections: [
            { from: vregOut, to: cap1Pin }  // Exclude this connection
        ]
    });

    // Result: U1->C2, U1->C3 are autorouted, U1->C1 is skipped
    // You can manually route U1->C1 with custom width/shape in KiCAD
}

// ============================================================================
// EXAMPLE 3: Multiple Manual Routes in the Same Net
// ============================================================================
// Use case: You have multiple critical connections that need precise routing
// for impedance matching or signal integrity.

function example3_multipleManualRoutes() {
    const pcb = new PCB();

    const fpga = new Component({ reference: 'U1', value: 'FPGA' });
    const ddr1 = new Component({ reference: 'U2', value: 'DDR3' });
    const ddr2 = new Component({ reference: 'U3', value: 'DDR3' });

    // Data bus net
    const dq0Pins = [fpga.pin('DQ0'), ddr1.pin('DQ0'), ddr2.pin('DQ0')];
    pcb.net(...dq0Pins);
    pcb.named('DDR_DQ0');

    // Define manual routing paths for both memory chips
    const path1: IRoutePath = {
        nodes: [
            { x: 100, y: 50, layer: 'F.Cu' },
            { x: 110, y: 50, layer: 'F.Cu' },
            { x: 110, y: 60, layer: 'F.Cu' },
            { x: 120, y: 60, layer: 'F.Cu' }
        ],
        length: 30,
        viaCount: 0,
        success: true
    };

    const path2: IRoutePath = {
        nodes: [
            { x: 100, y: 50, layer: 'B.Cu' },
            { x: 105, y: 50, layer: 'B.Cu' },
            { x: 105, y: 70, layer: 'B.Cu' },
            { x: 115, y: 70, layer: 'B.Cu' },
            { x: 115, y: 80, layer: 'B.Cu' },
            { x: 120, y: 80, layer: 'B.Cu' }
        ],
        length: 35,
        viaCount: 0,
        success: true
    };

    pcb.route({
        from: dq0Pins[0],
        to: dq0Pins.slice(1),
        net: 'DDR_DQ0',
        width: 0.127,  // Controlled impedance trace
        clearance: 0.2,
        routes: [
            path1,
            path2
        ]
    });

    // Result: Both connections use manually defined paths
}

// ============================================================================
// EXAMPLE 4: Combining Manual Routes with Autorouting
// ============================================================================
// Use case: Critical connections are manual, non-critical are autorouted.

function example4_mixedRouting() {
    const pcb = new PCB();

    const mcu = new Component({ reference: 'U1', value: 'ESP32' });
    const sensor1 = new Component({ reference: 'U2', value: 'BME280' });
    const sensor2 = new Component({ reference: 'U3', value: 'AHT20' });
    const sensor3 = new Component({ reference: 'U4', value: 'SHT31' });
    const sensor4 = new Component({ reference: 'U5', value: 'DHT22' });

    // I2C clock net with multiple sensors
    const sclPins = [
        mcu.pin('SCL'),
        sensor1.pin('SCL'),
        sensor2.pin('SCL'),
        sensor3.pin('SCL'),
        sensor4.pin('SCL')
    ];
    pcb.net(...sclPins);
    pcb.named('I2C_SCL');

    // Manual path for the critical first connection
    const mainBusPath: IRoutePath = {
        nodes: [
            { x: 30, y: 40, layer: 'F.Cu' },
            { x: 50, y: 40, layer: 'F.Cu' },  // Main bus line
            { x: 70, y: 40, layer: 'F.Cu' }
        ],
        length: 40,
        viaCount: 0,
        success: true
    };

    pcb.route({
        from: sclPins[0],
        to: sclPins.slice(1),
        net: 'I2C_SCL',
        width: 0.2,
        clearance: 0.15,
        routes: [
            // Only the main bus segment is manual
            mainBusPath
        ]
        // U2->U3, U2->U4, U2->U5 will be autorouted
    });
}

// ============================================================================
// EXAMPLE 5: Using with Direct autoroute() Call
// ============================================================================
// Use case: You're calling autoroute() directly.

async function example5_directAutoroute() {
    const pcb = new PCB();

    const driver = new Component({ reference: 'U1', value: 'LED_Driver' });
    const led1 = new Component({ reference: 'D1', value: 'LED' });
    const led2 = new Component({ reference: 'D2', value: 'LED' });

    // Define a serpentine path for controlled trace length
    const serpentinePath: IRoutePath = {
        nodes: [
            { x: 10, y: 10, layer: 'F.Cu' },
            { x: 20, y: 10, layer: 'F.Cu' },
            { x: 20, y: 15, layer: 'F.Cu' },
            { x: 10, y: 15, layer: 'F.Cu' },
            { x: 10, y: 20, layer: 'F.Cu' },
            { x: 20, y: 20, layer: 'F.Cu' },
            { x: 20, y: 25, layer: 'F.Cu' }
        ],
        length: 45,  // Extended length for delay matching
        viaCount: 0,
        success: true
    };

    await pcb.autoroute({
        from: driver.pin('OUT1'),
        to: [led1.pin('A'), led2.pin('A')],
        width: 0.3,
        routes: [
            // First LED gets serpentine for timing
            serpentinePath
        ]
        // D2 is autorouted normally
    });
}

// ============================================================================
// EXAMPLE 6: Excluding Problematic Connections
// ============================================================================
// Use case: The autorouter is failing on certain connections, so you
// exclude them and handle them separately.

async function example6_excludeProblematicRoutes() {
    const pcb = new PCB();

    const connector = new Component({ reference: 'J1', value: 'USB_C' });
    const controller = new Component({ reference: 'U1', value: 'USB_PD' });
    const resistor1 = new Component({ reference: 'R1', value: '5.1k' });
    const resistor2 = new Component({ reference: 'R2', value: '5.1k' });

    // CC1 configuration resistor net
    const cc1Connector = connector.pin('CC1');
    const cc1Res = resistor1.pin('1');
    const cc1NetPins = [cc1Connector, cc1Res];
    pcb.net(...cc1NetPins);
    pcb.named('USB_CC1');

    // Route might fail due to tight spacing near connector
    pcb.route({
        from: cc1NetPins[0],
        to: cc1NetPins.slice(1),
        net: 'USB_CC1',
        width: 0.15,
        clearance: 0.15,
        excludeConnections: [
            // Exclude the tight connector-to-resistor connection
            { from: cc1Connector, to: cc1Res }
        ]
    });

    // Route the excluded connection separately with relaxed constraints
    await pcb.autoroute({
        from: cc1Connector,
        to: cc1Res,
        width: 0.15,
        clearance: 0.1,  // Tighter clearance allowed
        maxIterations: 10000  // More attempts
    });
}

// ============================================================================
// EXAMPLE 7: Reusing Previously Routed Paths (NEW SIMPLIFIED API!)
// ============================================================================
// Use case: You successfully routed a net once, and want to reuse that exact
// path while routing additional connections. Now you can pass the result directly!

async function example7_reusingPaths() {
    const pcb = new PCB();

    const mcu = new Component({ reference: 'U1', value: 'nRF52840' });
    const ant = new Component({ reference: 'ANT1', value: 'Antenna' });
    const filter = new Component({ reference: 'FL1', value: 'LC_Filter' });

    // First, route MCU to filter to see what works
    const mcuToFilterRoute = await pcb.autoroute({
        from: mcu.pin('ANT'),
        to: filter.pin('IN'),
        width: 0.4,  // 50-ohm trace
        layers: ['F.Cu']
    });

    // Later, when routing the full antenna net, reuse this proven path
    const rfPins = [mcu.pin('ANT'), filter.pin('IN'), filter.pin('OUT'), ant.pin('FEED')];
    pcb.net(...rfPins);
    pcb.named('RF_ANT');

    // NEW: Just pass the entire result object directly!
    pcb.route({
        from: rfPins[0],
        to: rfPins.slice(1),
        net: 'RF_ANT',
        width: 0.4,
        layers: ['F.Cu'],
        routes: [
            mcuToFilterRoute  // Pass the entire IAutorouteResult!
        ]
        // Filter->Antenna is autorouted
    });

    // The system automatically extracts the path from the result
}

// ============================================================================
// EXAMPLE 8: Bidirectional Matching
// ============================================================================
// Use case: Demonstrating that connection matching is order-independent.

function example8_bidirectionalMatching() {
    const pcb = new PCB();

    const r1 = new Component({ reference: 'R1', value: '1k' });
    const r2 = new Component({ reference: 'R2', value: '1k' });

    const netPins = [r1.pin('1'), r2.pin('1')];
    pcb.net(...netPins);
    pcb.named('NET1');

    const customPath: IRoutePath = {
        nodes: [
            { x: 10, y: 10, layer: 'F.Cu' },
            { x: 20, y: 10, layer: 'F.Cu' }
        ],
        length: 10,
        viaCount: 0,
        success: true
    };

    // These are equivalent - matching is bidirectional

    // Provide the path directly; endpoints are inferred
    pcb.route({
        from: netPins[0],
        to: netPins.slice(1),
        net: 'NET1',
        routes: [
            customPath
        ]
    });

    // Both will match the R1<->R2 connection
}

// ============================================================================
// EXAMPLE 9: Complex Power Distribution
// ============================================================================
// Use case: Power net with specific star routing topology.

function example9_starRoutingTopology() {
    const pcb = new PCB();

    const vreg = new Component({ reference: 'U1', value: 'LDO' });
    const decap1 = new Component({ reference: 'C1', value: '10uF' });
    const decap2 = new Component({ reference: 'C2', value: '100nF' });
    const decap3 = new Component({ reference: 'C3', value: '100nF' });
    const load1 = new Component({ reference: 'U2', value: 'MCU' });

    // Create power net
    const starPins = [
        vreg.pin('OUT'),
        decap1.pin('1'),  // Local decoupling at regulator
        decap2.pin('1'),  // Near load
        decap3.pin('1'),  // Near load
        load1.pin('VDD')
    ];
    pcb.net(...starPins);
    pcb.named('+3V3');

    // Define star routing: regulator -> central point -> loads
    const trunk: IRoutePath = {
        nodes: [
            { x: 50, y: 50, layer: 'F.Cu' },   // Regulator output
            { x: 75, y: 50, layer: 'F.Cu' }    // Star center point
        ],
        length: 25,
        viaCount: 0,
        success: true
    };

    const branch1: IRoutePath = {
        nodes: [
            { x: 75, y: 50, layer: 'F.Cu' },   // Star center
            { x: 75, y: 70, layer: 'F.Cu' },   // To load area
            { x: 85, y: 70, layer: 'F.Cu' }
        ],
        length: 30,
        viaCount: 0,
        success: true
    };

    pcb.route({
        from: starPins[0],
        to: starPins.slice(1),
        net: '+3V3',
        width: 0.8,  // Wide power traces
        clearance: 0.3,
        routes: [
            trunk,
            branch1
        ]
        // Other connections autorouted
    });
}

// ============================================================================
// EXAMPLE 10: Iterative Routing Workflow
// ============================================================================
// Use case: Route, inspect, save problematic paths as manual routes, retry.

function example10_iterativeWorkflow() {
    const pcb = new PCB();

    const mcu = new Component({ reference: 'U1', value: 'STM32' });
    const flash = new Component({ reference: 'U2', value: 'W25Q128' });

    // SPI bus
    const spiPins = [mcu.pin('MOSI'), flash.pin('DI')];
    pcb.net(...spiPins);
    pcb.named('SPI_MOSI');

    // First attempt - try full autorouting
    const attempt1 = pcb.route({
        from: spiPins[0],
        to: spiPins.slice(1),
        net: 'SPI_MOSI',
        width: 0.2,
        clearance: 0.15
    });

    // Inspect results...
    // Suppose we're not happy with how one connection routed
    // We manually create a better path

    const betterPath: IRoutePath = {
        nodes: [
            { x: 40, y: 40, layer: 'F.Cu' },
            { x: 40, y: 50, layer: 'F.Cu' },
            { x: 40, y: 50, layer: 'B.Cu' },  // Via
            { x: 60, y: 50, layer: 'B.Cu' },
            { x: 60, y: 60, layer: 'B.Cu' }
        ],
        length: 40,
        viaCount: 1,
        success: true
    };

    // Second attempt - use the manual path
    const attempt2 = pcb.route({
        from: spiPins[0],
        to: spiPins.slice(1),
        net: 'SPI_MOSI',
        width: 0.2,
        clearance: 0.15,
        routes: [
            betterPath
        ]
    });

    // Now the route uses our improved path
}

// Export all examples
export {
    example0_simpleReuse,
    example1_basicManualRoute,
    example2_excludeConnections,
    example3_multipleManualRoutes,
    example4_mixedRouting,
    example5_directAutoroute,
    example6_excludeProblematicRoutes,
    example7_reusingPaths,
    example8_bidirectionalMatching,
    example9_starRoutingTopology,
    example10_iterativeWorkflow
};
