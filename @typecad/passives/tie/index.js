import { Component } from '@typecad/typecad';
export class Tie extends Component {
    constructor({ reference, xy, schematic, net1, net2, net3, net4, footprint, uuid } = {}) {
        if (net4 && net3) {
            super(footprint || "NetTie:NetTie-4_SMD_Pad0.5mm");
            this.symbol = "Device:NetTie_4";
        }
        else if (net3) {
            super(footprint || "NetTie:NetTie-3_SMD_Pad0.5mm");
            this.symbol = "Device:NetTie_3";
        }
        else {
            super(footprint || "NetTie:NetTie-2_SMD_Pad0.5mm");
            this.symbol = "Device:NetTie_2";
        }
        if (reference)
            this.reference = reference;
        if (uuid)
            this.uuid = uuid;
        if (!schematic || !net1 || !net2)
            return;
        schematic.net(this.pin(1), net1);
        schematic.net(this.pin(2), net2);
        if (net3) {
            schematic.net(this.pin(3), net3);
        }
        if (net4 && net3) {
            schematic.net(this.pin(4), net4);
        }
        schematic.add(this);
    }
}
//# sourceMappingURL=index.js.map