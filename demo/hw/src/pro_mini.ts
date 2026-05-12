import { PCB } from '@typecad/typecad'
import { Atmega328_mm } from "./atmega328_mm";
import { Connector } from '@typecad/passives/connector';
import { rd_isl9120ir } from "./rd_ISL9120IR";

const typecad = new PCB('pro_mini');
const isl9120 = new rd_isl9120ir({ pcb: typecad, x: 0, y: 0, name: 'isl9120' });

const pwr_conn = new Connector({ number: 2, reference: 'J1' });
pwr_conn.pcb = { x: 107, y: 94.46, rotation: 0 };

const power = {
  vcc: pwr_conn.pin(1),
  gnd: pwr_conn.pin(2)
};

const u1 = new Atmega328_mm({ pcb: typecad, x: 0, y: 0, power: power });

typecad.text({
  text: 'adfsasfadsf',
  x: 121.5, y: 86, rotation: 0,
  layer: 'F.SilkS',
  font: 'Super Skinny Pixel Bricks', width: 4, height: 4,
  justify: { horizontal: 'left', vertical: 'top' },
});

typecad.create(pwr_conn, u1.components, isl9120.components);