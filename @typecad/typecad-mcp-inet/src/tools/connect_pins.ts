import { MCPServer } from '../server';

export function registerConnectPinsTool(server: MCPServer) {
  server.registerTool({
    name: 'connect_pins',
    description: 'Provides instructions on how to connect multiple pins together in typeCAD',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  });

  server.on('tool_call', async ({ name, args, resolve, reject }) => {
    if (name !== 'connect_pins') return;
    try {
      const instructions = `Use typeCAD's net() method to connect multiple pins together in electrical networks.

Basic Pin Connections:
import { PCB } from '@typecad/typecad';

let typecad = new PCB('project_name');

// Connect two pins
typecad.net(u1.pin(1), r1.pin(1));

// Connect multiple pins in one net
typecad.net(u1.VCC, c1.pin(1), r1.pin(1), led1.pin(2));

// Connect using component pin names (if available)
typecad.net(mcu.VCC, regulator.VOUT, cap1.pin(1));

Named Connections:
// Create named nets for better organization
typecad.named('power_3v3').net(regulator.VOUT, mcu.VCC, cap1.pin(1));
typecad.named('ground').net(regulator.GND, mcu.GND, cap1.pin(2));
typecad.named('led_control').net(mcu.GPIO1, led1.pin(1));

Power Connections:
// Use Power objects for automatic connections
let vin = new Power({ power: regulator.VIN, gnd: regulator.GND, voltage: 5, direction: 'input' });
let vout = new Power({ power: regulator.VOUT, gnd: regulator.GND, voltage: 3.3, direction: 'output' });

// Connect power networks
typecad.net(vin.power, battery.pin(1));
typecad.net(vin.gnd, battery.pin(2));
typecad.net(vout.power, mcu.VCC);
typecad.net(vout.gnd, mcu.GND);

Notes: All pins in a net() call are electrically connected. Named nets appear with specified names in KiCAD. Power objects automatically handle power and ground connections. Net merging may occur if pins are already connected to other nets. Documentation can be found in the typeCAD documentation which can be downloaded with 'download_typecad_docs'.`;
      resolve(instructions);
    } catch (error) {
      reject(error);
    }
  });
}