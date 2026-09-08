import { PCB, Component } from '@typecad/pcb';
export function runTest15(typecad: PCB): Component[] {
  const U1 = new Component({
    reference: 'U1',
    value: 'SIT8008BI-82-30E-4.194304',
    footprint: 'lib:QFN_7050_4pins',
    description: '4.194304 MHz TCXO, ±25ppm, 3V supply, 7.0x5.0mm QFN-4 package',
    datasheet: 'https://www.sitime.com/products/oscillators/tcxo/sit8008bi',
    mpn: 'SIT8008BI-82-30E-4.194304',
    symbol: 'SiT8008BI-82-30E-4_194304:SiT8008BI-82-30E-4.194304',
    sch: { x: 35, y: 80, rotation: 0 },
    pcb: { x: 140.432, y: 102.905, rotation: 0, side: 'front' },
  });
  return [U1];
}
