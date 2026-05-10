import * as _0603 from '@typecad/passives/0603';
import { Power, PCB, Component, TrackBuilder } from '@typecad/typecad';
import { ISL9120IRTNZ } from './ISL9120IRTNZ';

// Configuration options for the ISL9120IR power regulator module
interface PowerRegulatorOptions {
    pcb: PCB;
    x: number;
    y: number;
    reference?: string;
    passives?: typeof _0603;
    inputPower?: Power;  // Optional external input power
}

/**
 * ### rd_isl9120ir - ISL9120IR 3.3V Power Regulator Module
 * 
 * #### Input Connections
 * vin: Power - 1.8V to 5.5V power supply input
 * 
 * #### Output Connections
 * vout: Power - 3.3V regulated output
 * 
 */
export class rd_isl9120ir {
    // PCB and component management
    pcb: PCB;
    #passives: typeof _0603;
    #offsetX: number;
    #offsetY: number;

    // Main components
    regulator: ISL9120IRTNZ;               // U1: Main voltage regulator IC
    inputCap: _0603.Capacitor;             // C1: Input power capacitor (22uF)
    outputCap: _0603.Capacitor;            // C2: Output power capacitor (10uF)
    inductor: _0603.Inductor;              // L1: Switching inductor (1µH)

    // Power connections
    vin: Power;                           // Input power (1.8V-5.5V)
    vout: Power;                          // Output power (3.3V regulated)
    inputPower?: Power;                   // External input power source

    // PCB elements
    via1: Component;                      // V1: PCB via for routing
    via2: Component;                      // V2: PCB via for routing
    components: (Component | TrackBuilder)[] = [];  // All PCB elements including components and tracks

    constructor(options: PowerRegulatorOptions) {
        // Extract configuration options
        this.pcb = options.pcb;
        this.#passives = options.passives || _0603;
        this.inputPower = options.inputPower;
        this.#offsetX = options.x - 150.6;
        this.#offsetY = options.y - 97.725;

        // Push offset to PCB for tracks and vias
        this.pcb.pushOffset(this.#offsetX, this.#offsetY);

        // Create the main voltage regulator IC
        this.regulator = this.createRegulatorIC(options.reference);

        // Create power connections
        this.vin = this.createVinPower();
        this.vout = this.createVoutPower();

        // Validate external input power if provided
        if (this.inputPower) {
            this.validateInputVoltage(this.inputPower.voltage);
        }

        // Create passive components (capacitors and inductor)
        this.inputCap = this.createInputCap();
        this.outputCap = this.createOutputCap();
        this.inductor = this.createInductor();

        // Create PCB vias for routing (framework applies offset!)
        this.via1 = this.createVia({ x: 151.765, y: 100.33 });
        this.via2 = this.createVia({ x: 152.4, y: 96.52 });

        // Add all main components to the components list
        this.components.push(this.regulator, this.inputCap, this.outputCap, this.inductor, this.via1, this.via2);

        // Connect all the electrical nets
        this.connectNets();

        // Route the PCB tracks (adds tracks to components array)
        this.routeTracks();

        // Group everything together on the PCB
        this.pcb.group('rd_isl9120', ...this.components);

        // Restore the previous origin
        this.pcb.popOffset();
    }

    private createRegulatorIC(reference?: string): ISL9120IRTNZ {
        // Create the ISL9120IR voltage regulator IC
        const regulator = new ISL9120IRTNZ(reference);
        regulator.pcb = { x: 150.6 + this.#offsetX, y: 97.725 + this.#offsetY, rotation: 0 };
        return regulator;
    }

    private createVinPower(): Power {
        // Create input power connection (1.8V to 5.5V)
        return new Power({
            power: this.regulator.VIN_1,
            gnd: this.regulator.GND
        });
    }

    private createVoutPower(): Power {
        // Create output power connection (3.3V regulated)
        return new Power({
            power: this.regulator.VOUT,
            gnd: this.regulator.GND,
            voltage: 3.3
        });
    }

    private validateInputVoltage(voltage?: number) {
        if (voltage === undefined) {
            console.warn('ISL9120IR: Input voltage not specified. Ensure it is between 1.8V and 5.5V.');
            return;
        }

        const MIN_VOLTAGE = 1.8;
        const MAX_VOLTAGE = 5.5;

        if (voltage < MIN_VOLTAGE || voltage > MAX_VOLTAGE) {
            throw new Error(
                `ISL9120IR input voltage must be between ${MIN_VOLTAGE}V and ${MAX_VOLTAGE}V. ` +
                `Provided voltage: ${voltage}V is outside the safe operating range.`
            );
        }

        // Additional warnings for edge cases
        if (voltage < 2.0) {
            console.warn(`ISL9120IR: Input voltage ${voltage}V is close to minimum. Consider using at least 2.0V for reliable operation.`);
        }

        if (voltage > 5.0) {
            console.warn(`ISL9120IR: Input voltage ${voltage}V is high. Ensure proper thermal management.`);
        }
    }

    private createInputCap(): _0603.Capacitor {
        // Input power capacitor (22µF) - smooths input power
        return new this.#passives.Capacitor({
            value: '22 uF',
            description: 'Input power capacitor',
            pcb: { x: 153.67 + this.#offsetX, y: 99.047 + this.#offsetY, rotation: -90 }
        });
    }

    private createOutputCap(): _0603.Capacitor {
        // Output power capacitor (10µF) - smooths output power
        return new this.#passives.Capacitor({
            value: '10 uF',
            description: 'Output power capacitor',
            pcb: { x: 153.67 + this.#offsetX, y: 95.986 + this.#offsetY, rotation: -90 }
        });
    }

    private createInductor(): _0603.Inductor {
        // Switching inductor (1µH) - essential for DC-DC conversion
        return new this.#passives.Inductor({
            value: '1 µH',
            description: 'Switching inductor',
            footprint: 'lib:1285ASH1R0MP2',
            mpn: '1285AS-H-1R0M=P2',
            datasheet: 'https://www.mouser.com/datasheet/2/281/1/J_E_TE243A_0011-2303275.pdf',
            pcb: { x: 147.32 + this.#offsetX, y: 97.828 + this.#offsetY, rotation: 90 }
        });
    }

    private createVia(at: { x: number; y: number }): Component {
        // PCB via for routing power connections between layers
        return this.pcb.via({
            at,
            size: 0.6,
            drill: 0.3
        });
    }

    private connectNets() {
        // Connect external input power if provided
        if (this.inputPower) {
            this.pcb.net(this.inputPower.power!, this.vin.power!);
            this.pcb.net(this.inputPower.gnd!, this.vin.gnd!);
        }

        // Connect input power circuit
        this.connectInputPower();

        // Connect switching inductor
        this.connectInductor();

        // Connect output power circuit
        this.connectOutputPower();

        // Connect ground connections
        this.connectGrounds();
    }

    private connectInputPower() {
        // console.log(this.inputCap.pin(2));
        // Connect all input power pins together with input capacitor and vias
        this.pcb.net(
            this.regulator.VIN_1,           // Primary input pin
            this.regulator.VIN_2,           // Secondary input pin  
            this.inputCap.pin(2),           // Input capacitor positive
            // this.regulator.EN,              // Enable pin (tied to input)
            // this.via1.pin(1),               // Via for routing
            // this.via2.pin(1),               // Via for routing
            // this.vin.power!                 // External input power
        );
    }

    private connectGrounds() {
        // Connect all ground pins together
        this.pcb.net(
            this.regulator.GND,             // Main ground
            this.regulator.PGND,            // Power ground  
            this.regulator.EP,              // Exposed pad
            this.regulator.BYPS,            // Bypass pin
            this.inputCap.pin(1),           // Input capacitor negative
            this.outputCap.pin(2),          // Output capacitor negative
            this.vin.gnd!                   // External ground
        );
    }

    private connectInductor() {
        // Connect switching pins to inductor
        // LX1 pins connect to one side of the inductor
        this.pcb.net(this.regulator.LX1_1, this.regulator.LX1_2, this.inductor.pin(1));

        // LX2 pins connect to the other side of the inductor  
        this.pcb.net(this.regulator.LX2_1, this.regulator.LX2_2, this.inductor.pin(2));
    }

    private connectOutputPower() {
        // Connect output power with feedback to ensure regulation
        this.pcb.net(
            this.outputCap.pin(1),          // Output capacitor positive
            this.regulator.FB,              // Feedback pin
            this.regulator.VOUT             // Output pin
        );
    }

    private routeTracks() {
        // PCB routing - these define the copper traces between components
        // Each track connects specific points on the PCB with defined layer and width
        // All tracks are added to the components array

        // Input power routing
        this.components.push(this.pcb.track().from({ x: 152.05, y: 96.87 }).to({ x: 152.4, y: 96.52, layer: "F.Cu", width: 0.2 }));
        this.components.push(this.pcb.track().from({ x: 151.1, y: 99.665 }).to({ x: 151.765, y: 100.33, layer: "F.Cu", width: 0.2 }).to({ x: 152.273, y: 99.822, layer: "F.Cu", width: 0.2 }).to({ x: 153.67, y: 99.822, layer: "F.Cu", width: 0.2 }));
        this.components.push(this.pcb.track().from({ x: 150.6, y: 99.175 }).to({ x: 151.1, y: 99.175, layer: "F.Cu", width: 0.2 }).to({ x: 151.1, y: 99.665, layer: "F.Cu", width: 0.2 }));

        // Ground routing
        this.components.push(this.pcb.track().from({ x: 152.05, y: 97.225 }).to({ x: 152.05, y: 96.87, layer: "F.Cu", width: 0.2 }));
        this.components.push(this.pcb.track().from({ x: 152.4, y: 99.695 }, "B.Cu", 0.2).to({ x: 151.765, y: 100.33, layer: "B.Cu", width: 0.2 }));
        this.components.push(this.pcb.track().from({ x: 152.4, y: 96.52 }, "B.Cu", 0.2).to({ x: 152.4, y: 99.695, layer: "B.Cu", width: 0.2 }));

        // Switching node routing
        this.components.push(this.pcb.track().from({ x: 152.05, y: 97.725 }).to({ x: 152.05, y: 98.225, layer: "F.Cu", width: 0.2 }));
        this.components.push(this.pcb.track().from({ x: 149.15, y: 97.725 }).to({ x: 152.05, y: 97.725, layer: "F.Cu", width: 0.2 }));
        this.components.push(this.pcb.track().from({ x: 152.05, y: 98.225 }).to({ x: 153.623, y: 98.225, layer: "F.Cu", width: 0.2 }));

        // Inductor connections
        this.components.push(this.pcb.track().from({ x: 149.15, y: 98.225 }).to({ x: 147.723, y: 98.225, layer: "F.Cu", width: 0.2 }).to({ x: 147.32, y: 98.628, layer: "F.Cu", width: 0.2 }));
        this.components.push(this.pcb.track().from({ x: 149.15, y: 98.225 }).to({ x: 150.1, y: 99.175, layer: "F.Cu", width: 0.2 }));
        this.components.push(this.pcb.track().from({ x: 147.517, y: 97.225 }).to({ x: 147.32, y: 97.028, layer: "F.Cu", width: 0.2 }));
        this.components.push(this.pcb.track().from({ x: 149.15, y: 97.225 }).to({ x: 147.517, y: 97.225, layer: "F.Cu", width: 0.2 }));

        // Output power routing
        this.components.push(this.pcb.track().from({ x: 153.67, y: 98.272 }).to({ x: 153.67, y: 96.761, layer: "F.Cu", width: 0.2 }));
        this.components.push(this.pcb.track().from({ x: 150.1, y: 96.275 }).to({ x: 149.15, y: 97.225, layer: "F.Cu", width: 0.2 }));
        this.components.push(this.pcb.track().from({ x: 150.6, y: 96.275 }).to({ x: 151.1, y: 96.275, layer: "F.Cu", width: 0.2 }).to({ x: 152.164, y: 95.211, layer: "F.Cu", width: 0.2 }).to({ x: 153.67, y: 95.211, layer: "F.Cu", width: 0.2 }));
    }
}