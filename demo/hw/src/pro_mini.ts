import { PCB, Power } from '@typecad/typecad'
import { Resistor } from '@typecad/passives/0603';

const typecad = new PCB('merge_doc_diff');

const r1 = new Resistor({ value: '1kohm' });
const r2 = new Resistor({ value: '10kohm' });
const r3 = new Resistor({ value: '4.7kohm' });

const power = new Power({ power: r1.pin(1), gnd: r2.pin(2), voltage: 5.0 });
// const power2 = new Power({ power: r3.pin(1), gnd: r3.pin(2), voltage: 3.3 });

typecad.named('VCC').net(power.power);
typecad.named('GND').net(power.gnd);
// typecad.named('+3V3').net(power2.power);
// typecad.named('GNDA').net(power2.gnd);

typecad.named('vdiv').net(r1.pin(2), r2.pin(1));

typecad.create(r1, r2, r3);