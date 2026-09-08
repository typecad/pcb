import { Power, Package, PackageOptions, Component } from '@typecad/pcb';
import { ISL9120IRTNZ } from './ISL9120IRTNZ';

// Package-specific options (everything beyond the standard pcb/x/y/reference/passives/name)
interface PowerRegulatorOptions {
  inputPower?: Power; // Optional external input power to connect
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
export class rd_isl9120ir extends Package<PowerRegulatorOptions> {
  declare regulator: ISL9120IRTNZ;
  declare inputCap: Component;
  declare outputCap: Component;
  declare inductor: Component;
  declare via1: Component;
  declare via2: Component;
  declare vin: Power;
  declare vout: Power;

  build(options: PackageOptions & PowerRegulatorOptions) {
    // Main IC
    this.regulator = new ISL9120IRTNZ(this.reference);
    this.regulator.pcb = { x: 150.6, y: 97.725, rotation: 0 };

    // Power connections
    this.vin = new Power({ power: this.regulator.VIN_1, gnd: this.regulator.GND });
    this.vout = new Power({ power: this.regulator.VOUT, gnd: this.regulator.GND, voltage: 3.3 });

    // Validate input voltage if provided
    if (options.inputPower) {
      this._validateInputVoltage(options.inputPower.voltage);
    }

    // Passives
    this.inputCap = new this.passives.Capacitor({
      value: '22 uF',
      description: 'Input power capacitor',
      pcb: { x: 153.67, y: 99.047, rotation: -90 },
    });
    this.outputCap = new this.passives.Capacitor({
      value: '10 uF',
      description: 'Output power capacitor',
      pcb: { x: 153.67, y: 95.986, rotation: -90 },
    });
    this.inductor = new this.passives.Inductor({
      value: '1 µH',
      description: 'Switching inductor',
      footprint: 'lib:1285ASH1R0MP2',
      mpn: '1285AS-H-1R0M=P2',
      datasheet: 'https://www.mouser.com/datasheet/2/281/1/J_E_TE243A_0011-2303275.pdf',
      pcb: { x: 146.5, y: 97.8, rotation: 90 },
    });

    this.via1 = this.via({ x: 151.765, y: 100.33 });
    this.via2 = this.via({ x: 152.4, y: 96.52 });

    // Nets
    if (options.inputPower) {
      this.net(options.inputPower.power!, this.vin.power!);
      this.net(options.inputPower.gnd!, this.vin.gnd!);
    }
    this.net(this.regulator.VIN_1, this.regulator.VIN_2, this.inputCap.pin(2));
    this.net(
      this.regulator.GND,
      this.regulator.PGND,
      this.regulator.EP,
      this.regulator.BYPS,
      this.inputCap.pin(1),
      this.outputCap.pin(2),
      this.vin.gnd!,
    );
    this.net(this.regulator.LX1_1, this.regulator.LX1_2, this.inductor.pin(1));
    this.net(this.regulator.LX2_1, this.regulator.LX2_2, this.inductor.pin(2));
    this.net(this.outputCap.pin(1), this.regulator.FB, this.regulator.VOUT);

    // Tracks
    this.add(this.track().from({ x: 152.05, y: 96.87 }).to({ x: 152.4, y: 96.52, layer: 'F.Cu', width: 0.2 }));
    this.add(
      this.track()
        .from({ x: 151.1, y: 99.665 })
        .to({ x: 151.765, y: 100.33, layer: 'F.Cu', width: 0.2 })
        .to({ x: 152.273, y: 99.822, layer: 'F.Cu', width: 0.2 })
        .to({ x: 153.67, y: 99.822, layer: 'F.Cu', width: 0.2 }),
    );
    this.add(
      this.track()
        .from({ x: 150.6, y: 99.175 })
        .to({ x: 151.1, y: 99.175, layer: 'F.Cu', width: 0.2 })
        .to({ x: 151.1, y: 99.665, layer: 'F.Cu', width: 0.2 }),
    );
    this.add(this.track().from({ x: 152.05, y: 97.225 }).to({ x: 152.05, y: 96.87, layer: 'F.Cu', width: 0.2 }));
    this.add(
      this.track().from({ x: 152.4, y: 99.695 }, 'B.Cu', 0.2).to({ x: 151.765, y: 100.33, layer: 'B.Cu', width: 0.2 }),
    );
    this.add(
      this.track().from({ x: 152.4, y: 96.52 }, 'B.Cu', 0.2).to({ x: 152.4, y: 99.695, layer: 'B.Cu', width: 0.2 }),
    );
    this.add(this.track().from({ x: 152.05, y: 97.725 }).to({ x: 152.05, y: 98.225, layer: 'F.Cu', width: 0.2 }));
    this.add(this.track().from({ x: 149.15, y: 97.725 }).to({ x: 152.05, y: 97.725, layer: 'F.Cu', width: 0.2 }));
    this.add(this.track().from({ x: 152.05, y: 98.225 }).to({ x: 153.623, y: 98.225, layer: 'F.Cu', width: 0.2 }));
    this.add(
      this.track()
        .from({ x: 149.15, y: 98.225 })
        .to({ x: 147.723, y: 98.225, layer: 'F.Cu', width: 0.2 })
        .to({ x: 147.32, y: 98.628, layer: 'F.Cu', width: 0.2 }),
    );
    this.add(this.track().from({ x: 149.15, y: 98.225 }).to({ x: 150.1, y: 99.175, layer: 'F.Cu', width: 0.2 }));
    this.add(this.track().from({ x: 147.517, y: 97.225 }).to({ x: 147.32, y: 97.028, layer: 'F.Cu', width: 0.2 }));
    this.add(this.track().from({ x: 149.15, y: 97.225 }).to({ x: 147.517, y: 97.225, layer: 'F.Cu', width: 0.2 }));
    this.add(this.track().from({ x: 153.67, y: 98.272 }).to({ x: 153.67, y: 96.761, layer: 'F.Cu', width: 0.2 }));
    this.add(this.track().from({ x: 150.1, y: 96.275 }).to({ x: 149.15, y: 97.225, layer: 'F.Cu', width: 0.2 }));
    this.add(
      this.track()
        .from({ x: 150.6, y: 96.275 })
        .to({ x: 151.1, y: 96.275, layer: 'F.Cu', width: 0.2 })
        .to({ x: 152.164, y: 95.211, layer: 'F.Cu', width: 0.2 })
        .to({ x: 153.67, y: 95.211, layer: 'F.Cu', width: 0.2 }),
    );
  }

  private _validateInputVoltage(voltage?: number) {
    if (voltage === undefined) {
      console.warn('ISL9120IR: Input voltage not specified. Ensure it is between 1.8V and 5.5V.');
      return;
    }
    if (voltage < 1.8 || voltage > 5.5) {
      throw new Error(
        `ISL9120IR input voltage must be between 1.8V and 5.5V. ` +
          `Provided: ${voltage}V is outside the safe operating range.`,
      );
    }
    if (voltage < 2.0) console.warn(`ISL9120IR: ${voltage}V is close to minimum. Consider at least 2.0V.`);
    if (voltage > 5.0) console.warn(`ISL9120IR: ${voltage}V is high. Ensure proper thermal management.`);
  }
}
