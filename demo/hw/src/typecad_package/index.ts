import { Package, PackageOptions, Component } from '@typecad/pcb';
/**
 * ### Typecad_package - Description
 *
 * #### Input Connections
 *
 * #### Output Connections
 *
 */
export class Typecad_package extends Package {
  declare r1: Component;
  build(options: PackageOptions) {
    // Passives
    this.r1 = new this.passives.Resistor({ value: '10k' });

    // Nets
    // this.net(this.U1.pin(1), r1.pin(1));

    // Vias
    // let v1 = this.via({ x: 0, y: 0 });

    // Tracks
    // this.add(this.track().from({ x: 0, y: 0 }).to({ x: 1, y: 1, layer: 'F.Cu', width: 0.2 }));
  }
}
