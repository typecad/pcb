---
title: Hardware Contract
description: Generate a JSON manifest of connected MCU pins to bridge hardware and firmware
date: '2026-5-13'
categories:
  - typecad
  - firmware
  - code-as-schematic
published: true
cover: https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=640
---
<script lang="ts">
  import { ScrollArea } from '$lib/components/ui/scroll-area/index.js';
</script>

<br />

# Bridging Hardware and Firmware

When you design a board in **type**CAD, you know exactly which MCU pins are connected to what. But your firmware code doesn't — it just sees a generic board package with every pin available. The new **hardware contract** feature closes that gap.

`pcb.contract()` generates a JSON manifest describing which MCU pins are wired in your circuit. Your firmware toolchain consumes this to generate a board wrapper that only exposes the pins and peripherals that actually exist on your board.

## The Problem

Most firmware projects start with a board support package that exposes every pin on the MCU. But your actual board only uses a subset. Without a way to communicate the hardware layout to the firmware, you end up with:

- Pin mismatches between hardware and firmware
- No automated way to know which peripherals (I2C, SPI, UART) are available
- Manual coordination between hardware and firmware developers

## The Solution

After creating your board, call `contract()` with a pin mapping from your TypeHAL board package:

<ScrollArea orientation="both">

```ts
import { PCB } from '@typecad/typecad';
import { pinMapping } from '@typehal/board-arduino-uno';

let pcb = new PCB('sensor_board');

// ... add components, create nets, place everything ...

pcb.create();

// Generate the contract
pcb.contract({
  mcuSymbolPattern: 'ATmega328',
  pinMapping: pinMapping,
  outputPath: '../fw/hw-board/contract.json',
});
```

</ScrollArea>

This produces a JSON file that looks like:

<ScrollArea orientation="both">

```json
{
  "version": 1,
  "boardPackage": "@typehal/board-arduino-uno",
  "mcu": {
    "symbol": "MCU_Microchip_ATmega:ATmega328P-PU",
    "reference": "U1"
  },
  "connectedPins": {
    "D13": {
      "boardName": "D13",
      "net": "led_net",
      "externalComponents": [
        { "reference": "R1", "symbol": "Device:R", "value": "330" },
        { "reference": "LED1", "symbol": "Device:LED", "value": "" }
      ]
    },
    "A4": {
      "boardName": "A4",
      "net": "i2c_sda",
      "externalComponents": [
        { "reference": "U2", "symbol": "Sensor:BME280", "value": "BME280" }
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

</ScrollArea>

## How It Works

1. **Finds the MCU** — matches against the component symbol (e.g. `'ATmega328'`) or by exact reference designator
2. **Walks every net** — identifies which MCU GPIO pins are actually connected
3. **Collects external components** — for each connected pin, lists what else is on that net
4. **Checks peripheral availability** — reports whether I2C, SPI, and UART pins are all connected
5. **Writes the JSON** — outputs a clean manifest for your firmware toolchain

Power, ground, clock, and reset pins are filtered out automatically — only GPIO shows up in the contract.

## Multiple MCUs

If your board has more than one MCU, target a specific one by reference designator:

<ScrollArea orientation="both">

```ts
pcb.contract({
  mcuReference: 'U1',
  mcuSymbolPattern: 'ATmega328',
  pinMapping: pinMapping,
});
```

</ScrollArea>

## Custom Peripherals

By default, the contract checks for Arduino Uno peripheral pins. You can override these for other boards:

<ScrollArea orientation="both">

```ts
pcb.contract({
  mcuSymbolPattern: 'ESP32',
  pinMapping: esp32PinMapping,
  peripheralPins: {
    i2c: ['D21', 'D22'],
    spi: ['D23', 'D19', 'D18'],
    uart: ['D1', 'D3'],
  },
  boardPackage: '@typehal/board-esp32-devkit',
});
```

</ScrollArea>

## What's Next

This is the TypeCAD side of the bridge. The firmware toolchain (TypeHAL) reads this contract and generates a typed board wrapper so your firmware can only access pins that are actually wired. No more guessing.

Update to the latest `@typecad/typecad` to start using contracts today.