import * as _0603 from '@typecad/passives/0603';
import { Package, TrackBuilder, Component, Pin } from '@typecad/typecad';
import { ATmega328_MM } from './ATmega328_MM';

export interface PowerInterface {
    vcc: Pin;
    gnd: Pin;
}

export interface Atmega328_mmOptions {
    power: PowerInterface;
}

export class Atmega328_mm extends Package<Atmega328_mmOptions> {
    declare U1: ATmega328_MM;
    declare R_pullup: Component;
    declare C_reset: Component;
    declare Crystal: Component;
    declare C_load1: Component;
    declare C_load2: Component;

    build(options: import('@typecad/typecad').PackageOptions & Atmega328_mmOptions) {
        this.U1 = new ATmega328_MM(this.reference);
        this.U1.pcb = { x: 118.9, y: 94.6, rotation: 0 };
        this.R_pullup = new this.passives.Resistor({ value: '10k' });
        this.R_pullup.pcb = { x: 127.825, y: 101, rotation: 0 };
        this.C_reset = new this.passives.Capacitor({ value: '100nF' });
        this.C_reset.pcb = { x: 127.775, y: 104.5, rotation: 0 };
        this.Crystal = new Component({
            symbol: 'Device:Crystal',
            footprint: 'Crystal:Crystal_SMD_5032-2Pin_5.0x3.2mm',
            reference: ['Y11', { x: 4.5, y: 0, rotation: 180, thickness: 0.15, width: 1, height: 1 }],
            fab: ['bbbb', { x: 0, y: 3, rotation: 180, thickness: 0.15, width: 1, height: 1 }],
        });
        this.Crystal.pcb = { x: 131, y: 111, rotation: 0 };
        this.C_load1 = new this.passives.Capacitor({ value: '22pF' });
        this.C_load1.pcb = { x: 135.775, y: 94, rotation: 0 };
        this.C_load2 = new this.passives.Capacitor({ value: '22pF' });
        this.C_load2.pcb = { x: 136.275, y: 96.5, rotation: 0 };

        const power_route = this.pcb.net(this.U1.VCC, this.U1.AVCC, options.power.vcc);
        const gnd_route = this.pcb.net(this.U1.GND, this.U1.GND_18, this.U1.GND_29, options.power.gnd);

        const reset_route = this.pcb.net(this.U1._RESET_PC6, this.R_pullup.pin(1), this.C_reset.pin(1));
        this.pcb.net(this.R_pullup.pin(2), options.power.vcc);
        this.pcb.net(this.C_reset.pin(2), options.power.gnd);

        const xtal1_route = this.pcb.net(this.U1.XTAL1_PB6, this.Crystal.pin(1), this.C_load1.pin(1));
        const xtal2_route = this.pcb.net(this.U1.XTAL2_PB7, this.Crystal.pin(2), this.C_load2.pin(1));
        this.pcb.net(this.C_load1.pin(2), options.power.gnd);
        this.pcb.net(this.C_load2.pin(2), options.power.gnd);

        this.pcb.stage(this.U1, this.R_pullup, this.C_reset, this.Crystal, this.C_load1, this.C_load2);

        const route_opts = { gridResolution: 0.1, layers: ['F.Cu'], maxIterations: 100000 };
        this.pcb.route(reset_route, route_opts);
        this.pcb.route(xtal1_route, route_opts);
        this.pcb.route(xtal2_route, route_opts);
        this.pcb.route(power_route, route_opts);
        // this.pcb.route(gnd_route, route_opts);
    }
}
