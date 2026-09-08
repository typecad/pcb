# npm Packages for Hardware

## Why Hardware Needs a Package Manager

Traditional hardware design forces you to rebuild the same circuits over and over. typeCAD brings the npm ecosystem to hardware design, letting you install, share, and reuse proven circuit designs as packages.

## The npm Ecosystem for Hardware

### 📦 **Install Hardware Like Software**

```bash
# Common passive components (resistors, capacitors, etc.) are built into @typecad/pcb

# Add specialized sensor packages  
npm install @mycompany/environmental-sensors
npm install @community/power-supplies

# Install development tools
npm install --save-dev @typecad/jlcpcb-export
```

No more hunting through component libraries or rebuilding basic circuits. Install proven designs with a single command.

### 🔌 **Import Circuits Like Modules**

```typescript
// Import exactly what you need
import { Resistor, Capacitor, LED } from '@typecad/pcb';
import { UsbCConnector } from '@acme/connectors';
import { BuckConverter5V } from '@acme/power-supplies';

// Use them immediately
let power = new BuckConverter5V({ inputRange: [7, 24] });
let usb = new UsbCConnector({ dataLines: true });
let led = new LED({ color: 'blue', current: 20 });
```

Import hardware components with the same simplicity as importing software libraries. TypeScript intellisense shows you all available options.

### 🏗️ **Build Complex Systems from Simple Parts**

```typescript
// Combine packages to build complete systems
import { ESP32DevKit } from '@typecad/microcontrollers';
import { SensorCluster } from '@mycompany/environmental';
import { LoRaModule } from '@community/wireless';

let mcu = new ESP32DevKit();
let sensors = new SensorCluster(['temperature', 'humidity', 'pressure']);
let wireless = new LoRaModule({ frequency: 915 });

// Connect them together
typecad.net(mcu.I2C_SDA, sensors.SDA);
typecad.net(mcu.I2C_SCL, sensors.SCL);
typecad.net(mcu.SPI_MOSI, wireless.MOSI);
```

Compose complex IoT devices from well-tested, modular packages. Each package handles its own complexity internally.

### 📋 **Dependency Management That Works**

```json
// package.json for your hardware project
{
  "name": "weather-station-v2",
  "version": "1.2.0",
  "dependencies": {
    "@typecad/pcb": "^2.1.0",
    "@acme/sensors": "^3.2.1",
    "@community/displays": "^2.0.0"
  },
  "devDependencies": {
    "@typecad/validation": "^1.1.0"
  }
}
```

Lock dependency versions for reproducible builds. Update packages when new features or bug fixes are available.

## npm vs. Traditional Hardware Workflows

| Traditional Hardware Design | typeCAD + npm |
|---------------------------|---------------|
| 🔄 Rebuild same circuits repeatedly | 📦 `npm install @company/power-supply` |
| 📁 Copy-paste component groups | 🔌 `import { UsbConnector } from '@lib/usb'` |
| 🔍 Hunt through component libraries | 🔎 `npm search temperature-sensor` |
| ❓ Unknown component reliability | ⭐ Package ratings and download stats |
| 📧 Email circuit files around | 🌐 `npm publish` for instant sharing |
| 🐛 No update notifications | 🔔 `npm outdated` shows available updates |

## Publishing Your Own Packages

### 🚀 **Share Your Designs**

```bash
# Create a reusable sensor breakout package
mkdir my-sensor-package
cd my-sensor-package
npm init @typecad/package

# Develop your sensor circuit
# Edit src/index.ts

# Publish to npm
npm publish
```

Turn your proven designs into packages that others can use. Build a reputation for reliable hardware designs.

### 🏢 **Private Company Packages**

```bash
# Keep proprietary designs private
npm publish --registry=https://npm.company.com

# Team members install from private registry
npm install @company/secret-sauce-v2
```

Share designs within your organization while keeping IP protected. Use npm's private registry features.

## The Package Ecosystem Advantage

npm transforms hardware design from isolated, repetitive work into a collaborative ecosystem:

- **Reusability**: Never rebuild the same circuit twice
- **Quality**: Use tested designs from the community
- **Speed**: Compose complex systems from proven modules
- **Collaboration**: Share and improve designs across teams
- **Innovation**: Focus on unique value, not reinventing basics
- **Maintenance**: Get updates and bug fixes automatically

Ready to tap into the world's largest package ecosystem for your hardware designs?

[Get Started →](/getting-started)