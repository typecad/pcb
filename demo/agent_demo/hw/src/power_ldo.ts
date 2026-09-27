import { Package, PackageOptions, Component } from '@typecad/pcb';
import { AP2112K_3_3 } from './AP2112K_3_3';

/**
 * 3.3 V power supply: AP2112K-3.3 LDO with 10 uF bulk + 100 nF HF
 * ceramics on both rails. EN is tied to VIN (always on).
 *
 * Coordinates inside build() are relative to the (x, y) passed to the
 * constructor — the package moves as one unit on the board.
 */
export class PowerLdo3V3 extends Package {
  declare regulator: AP2112K_3_3;
  declare cin: Component;
  declare cinHf: Component;
  declare cout: Component;
  declare coutHf: Component;

  build(_options: PackageOptions) {
    this.regulator = new AP2112K_3_3(this.reference);
    this.regulator.pcb = { x: 7, y: 5, rotation: 270 };

    this.cin = new this.passives.Capacitor({ value: '10 uF', size: '0805' });
    this.cin.pcb = { x: 3, y: 3, rotation: 90 };
    this.cinHf = new this.passives.Capacitor({ value: '100 nF' });
    this.cinHf.pcb = { x: 3, y: 7.2, rotation: 90 };

    this.cout = new this.passives.Capacitor({ value: '10 uF', size: '0805' });
    this.cout.pcb = { x: 11, y: 3, rotation: 90 };
    this.coutHf = new this.passives.Capacitor({ value: '100 nF' });
    this.coutHf.pcb = { x: 11, y: 7.2, rotation: 90 };

    this.net(this.regulator.VIN, this.cin.pin(1), this.cinHf.pin(1));
    this.net(this.regulator.VOUT, this.cout.pin(1), this.coutHf.pin(1));
    this.net(this.regulator.GND, this.cin.pin(2), this.cinHf.pin(2), this.cout.pin(2), this.coutHf.pin(2));
    this.net(this.regulator.EN, this.regulator.VIN);
  }
}
