# TypeHAL Contract Integration Guide

## Overview

TypeCAD generates a `contract.json` file describing which MCU pins are wired in the circuit. TypeHAL reads this contract to generate a board wrapper that only exposes connected pins and peripherals.

This document describes the contract format and what TypeHAL needs to do to consume it.

---

## Contract Format

```json
{
  "version": 1,
  "mcu": {
    "symbol": "MCU_Microchip_ATmega:ATmega328-MM",
    "reference": "U1",
    "value": "ATmega328-MM",
    "footprint": "Package_DFN_QFN:QFN-28-1EP_4x4mm_P0.45mm_EP2.4x2.4mm",
    "mpn": "ATmega328-MM",
    "datasheet": "",
    "description": ""
  },
  "connectedPins": {
    "3": {
      "pinName": "VCC",
      "pinType": "power_in",
      "boardName": undefined,
      "net": "net6",
      "externalComponents": [
        {
          "reference": "J1",
          "symbol": "Connector:Conn_01x02_Pin",
          "value": "",
          "footprint": "Connector_PinHeader_2.54mm:PinHeader_1x02_P2.54mm_Vertical",
          "mpn": "",
          "datasheet": "",
          "description": "",
          "voltage": "",
          "wattage": "",
          "dnp": false
        }
      ]
    },
    "15": {
      "pinName": "PB5",
      "pinType": "bidirectional",
      "boardName": "D13",
      "net": "led_net",
      "externalComponents": [
        {
          "reference": "R1",
          "symbol": "Device:R_Small",
          "value": "330",
          "footprint": "Resistor_SMD:R_0402_1005Metric",
          "mpn": "",
          "datasheet": "",
          "description": "",
          "voltage": "",
          "wattage": "",
          "dnp": false
        }
      ]
    }
  },
  "availablePeripherals": {
    "i2c": true,
    "spi": false,
    "uart": false
  }
}
```

### Field Reference

| Field | Type | Description |
|-------|------|-------------|
| `version` | `1` | Contract format version |
| `mcu.symbol` | `string` | KiCAD symbol library identifier |
| `mcu.reference` | `string` | Reference designator on the PCB (e.g. `U1`) |
| `mcu.value` | `string` | Component value (e.g. `ATmega328P-PU`) |
| `mcu.footprint` | `string` | KiCAD footprint identifier (e.g. `Package_DIP:DIP-28_W7.62mm`) |
| `mcu.mpn` | `string` | Manufacturer part number |
| `mcu.datasheet` | `string` | Link to datasheet URL |
| `mcu.description` | `string` | Human-readable component description |
| `connectedPins` | `Record<string, ContractPin>` | Keys are **IC pin numbers** (as strings). Values describe each connected pin. |
| `connectedPins[key].pinName` | `string` | Pin name from the KiCAD symbol (e.g. `PB5`, `VCC`, `XTAL1/PB6`) |
| `connectedPins[key].pinType` | `string` | KiCAD electrical type: `bidirectional`, `power_in`, `passive`, `input`, `output`, `open_collector`, etc. |
| `connectedPins[key].boardName` | `string \| undefined` | Board framework pin name (e.g. `D13`, `A4`). **Only present** when the TypeCAD component has `typehal.pinLookup` configured. |
| `connectedPins[key].net` | `string` | Net name from the schematic |
| `connectedPins[key].externalComponents` | `array` | Other components connected to the same net (see below) |
| `availablePeripherals` | `object` | Whether all required pins for I2C/SPI/UART are connected |

---

## The Pin Name → Board Name Bridge

The contract provides **IC pin numbers** and **KiCAD pin names** (e.g. pin `15` = `PB5`). But the board package uses **Arduino-style names** (e.g. `D13` = `new Pin(13)`). TypeHAL needs to bridge these.

### External Component Fields

Each entry in `externalComponents` contains:

| Field | Type | Description |
|-------|------|-------------|
| `reference` | `string` | Reference designator (e.g. `R1`, `U2`) |
| `symbol` | `string` | KiCAD symbol library identifier (e.g. `Device:R_Small`) |
| `value` | `string` | Component value (e.g. `330`, `100nF`) |
| `footprint` | `string` | KiCAD footprint identifier (e.g. `Resistor_SMD:R_0402_1005Metric`) |
| `mpn` | `string` | Manufacturer part number |
| `datasheet` | `string` | Link to datasheet URL |
| `description` | `string` | Human-readable component description |
| `voltage` | `string` | Voltage rating (e.g. `3.3V`) |
| `wattage` | `string` | Wattage/power rating |
| `dnp` | `boolean` | Do Not Place flag — component is excluded from assembly |

TypeHAL can use this rich metadata to:
- Look up drivers by MPN or symbol (e.g. `Sensor:BME280` → import BME280 driver)
- Validate voltage compatibility between MCU and peripherals
- Skip `dnp: true` components in generated code
- Link to datasheets for documentation generation

---

### When `boardName` is present (preferred)

If the TypeCAD component had `typehal.pinLookup` configured, each `ContractPin` includes `boardName` directly:

```json
{
  "15": { "pinName": "PB5", "boardName": "D13", "net": "led_net", ... },
  "23": { "pinName": "PC4", "boardName": "A4", "net": "i2c_sda", ... }
}
```

TypeHAL uses `boardName` to look up the Pin instance from its configured board package:

```ts
import { D13, A4 } from '@typehal/board-arduino-uno'; // board is defined in typehal.config.ts
// boardName "D13" → D13 (Pin instance)
```

### When `boardName` is absent

TypeHAL must resolve `pinName` → board pin using its own mapping. This could be:

1. **A `mcuPinNames` export in each board package:**

```ts
// In @typehal/board-arduino-uno
export const mcuPinNames: Record<string, string> = {
  'PD0': 'D0', 'PD1': 'D1', 'PD2': 'D2', 'PD3': 'D3',
  'PD4': 'D4', 'PD5': 'D5', 'PD6': 'D6', 'PD7': 'D7',
  'PB0': 'D8', 'PB1': 'D9', 'PB2': 'D10', 'PB3': 'D11',
  'PB4': 'D12', 'PB5': 'D13',
  'PC0': 'A0', 'PC1': 'A1', 'PC2': 'A2', 'PC3': 'A3',
  'PC4': 'A4', 'PC5': 'A5',
};
```

2. **Convention-based derivation** — for ATmega, port names follow patterns: `PB5` → D(8+5) = D13, `PC4` → A(4) = A4.

3. **The `pins.all` array in the board definition** — has `name` and `functions` fields that could be reverse-matched.

---

## What TypeHAL Needs to Implement

### 1. Contract reader

Parse `contract.json`:

```ts
import { readFileSync } from 'fs';
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
```

### 2. Pin name resolver

Map contract pin names to board package Pin instances:

```ts
// If boardName is available:
const pinExportName = contract.connectedPins['15'].boardName; // "D13"

// Resolve the Pin instance from the board package
// This requires dynamic import or a lookup table
```

### 3. Board wrapper generator

Generate a TypeScript file that re-exports only the connected pins from the board package:

```ts
// Generated by TypeHAL from contract.json
import { D13 as Pin_D13, A4 as Pin_A4 } from '@typehal/board-arduino-uno';

// Only pins that are actually wired on the PCB
export const connectedPins = {
  D13: Pin_D13,
  A4: Pin_A4,
} as const;

// Peripheral availability from contract
export const availablePeripherals = {
  i2c: true,
  spi: false,
  uart: false,
} as const;
```

### 4. Peripheral-aware code generation

When `availablePeripherals.i2c` is `true`, TypeHAL can:
- Auto-import `I2C0` from the board package
- Know that `A4` (SDA) and `A5` (SCL) are wired and available
- Warn if user code tries to use I2C when it's not wired

### 5. Component-awareness

The `externalComponents` field provides rich metadata about what's connected to each MCU pin. Example:

```json
{
  "23": {
    "pinName": "PC4",
    "boardName": "A4",
    "net": "i2c_sda",
    "externalComponents": [
      {
        "reference": "U2",
        "symbol": "Sensor:BME280",
        "value": "BME280",
        "footprint": "Package_LGA:Bosch_LGA-8_2.5x2.5mm_P0.65mm",
        "mpn": "BME280",
        "datasheet": "https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bme280-ds002.pdf",
        "description": "Digital Humidity, Pressure and Temperature Sensor",
        "voltage": "3.3V",
        "wattage": "",
        "dnp": false
      }
    ]
  }
}
```

TypeHAL can use this to:
- Auto-import sensor drivers (by MPN or symbol pattern)
- Generate initialization code for known peripherals
- Provide IDE autocomplete for what's on the board
- Validate voltage compatibility
- Link to datasheets from generated docs

---

## Pin Category Filtering

The contract includes **all** connected MCU pins with their KiCAD electrical type in the `pinType` field. TypeHAL should filter based on this type:

| `pinType` value | Meaning | TypeHAL action |
|-----------------|---------|---------------|
| `bidirectional` | GPIO (can be input or output) | Export as available digital/analog pin |
| `input` | Input-only pin | Export as input-only pin |
| `output` | Output-only pin | Export as output-only pin |
| `passive` | Passive connection (caps, resistors) | Skip or use for validation |
| `power_in` | Power supply pin | Skip |
| `power_out` | Regulated power output | Skip |
| `open_collector` | Open collector output | Export with constraint |
| `open_emitter` | Open emitter output | Export with constraint |
| `unspecified` | KiCAD didn't categorize | Heuristic check on pin name |
| `free` | Unconnected / TIE | Skip |
| `no_connect` | Explicit no-connect | Skip |

The `pinType` comes directly from the KiCAD symbol definition, so it's accurate — no need for name-based heuristics.

---

## Config Integration

The TypeHAL config (`typehal.config.ts`) would reference the contract:

```ts
export default {
  target: 'avr',
  framework: 'arduino',
  board: '@typehal/board-arduino-uno',
  contract: '../hw/build/pro_mini.contract.json',
};
```

When `typehal build` runs:
1. Read `contract.json`
2. Resolve pin names → board Pin instances
3. Generate board wrapper with only connected pins
4. Transpile user firmware code using the constrained board API

---

## Example: Full Flow

### TypeCAD (hardware)

```ts
const mcu = new Component({
    symbol: 'MCU_Microchip_ATmega:ATmega328P-PU',
    reference: 'U1',
    typehal: {
        boardPackage: '@typehal/board-arduino-uno',
        pinLookup: {
            'PD0': 'D0', 'PD1': 'D1', /* ... */ 'PB5': 'D13',
            'PC0': 'A0', /* ... */ 'PC5': 'A5',
        },
    }
});

pcb.net(mcu.pin(15), led.pin(1));  // PB5 → D13
pcb.net(mcu.pin(23), sensor.pin('SDA')); // PC4 → A4
pcb.net(mcu.pin(24), sensor.pin('SCL')); // PC5 → A5

pcb.contract();
```

### Generated contract.json

```json
{
  "version": 1,
  "mcu": { "symbol": "MCU_Microchip_ATmega:ATmega328P-PU", "reference": "U1", "value": "ATmega328P-PU", "footprint": "Package_DIP:DIP-28_W7.62mm", "mpn": "", "datasheet": "", "description": "" },
  "connectedPins": {
    "15": { "pinName": "PB5", "pinType": "bidirectional", "boardName": "D13", ... },
    "23": { "pinName": "PC4", "pinType": "bidirectional", "boardName": "A4", ... },
    "24": { "pinName": "PC5", "pinType": "bidirectional", "boardName": "A5", ... }
  },
  "availablePeripherals": { "i2c": true, "spi": false, "uart": false }
}
```

### TypeHAL (firmware) — board package is defined in `typehal.config.ts`

```ts
// User code — only D13, A4, A5 are available
import { D13, A4, A5, I2C0 } from '@typehal/board-arduino-uno';

D13.asOutput();
D13.high();

const bus = I2C0; // Available because contract says i2c: true