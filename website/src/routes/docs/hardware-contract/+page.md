<script lang="ts">
    import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
    import { buttonVariants } from "$lib/components/ui/button";
    import ChevronRight from "lucide-svelte/icons/chevron-right";
    let { data }: { data: PageData } = $props();
</script>

# Hardware Contract

The hardware contract system bridges your **type**CAD hardware design with firmware development. It exports a JSON manifest describing which MCU pins are connected to what, enabling automatic firmware code generation.

## Overview

A hardware contract is a JSON file that describes:
- Which MCU is being used
- Which pins are connected and to what nets
- Available peripherals (I2C, SPI, UART) auto-detected from KiCAD pin names

## Usage

<ScrollArea orientation="both">

```ts
import { PCB, Component } from '@typecad/typecad';

let pcb = new PCB('my_board');

let mcu = new Component({
  symbol: 'MCU_Microchip_ATtiny:ATtiny3227-M',
  footprint: 'Package_DFN_QFN:QFN-20-1EP_4x4mm_P0.5mm',
  typehal: {
    boardPackage: 'ATtiny3227',
    driver: 'megaTinyCore',
    pinLookup: {
      1: 'PB5',
      2: 'PB3',
      5: 'PB0',
      // ...
    }
  }
});

pcb.net(mcu.pin(5), sensor.SDA);
pcb.net(mcu.pin(7), sensor.SCL);

// After create, export the contract
pcb.create(mcu, sensor);
const contract = pcb.contract({ mcu: mcu });
```
</ScrollArea>

## Contract Output

<ScrollArea orientation="both">

```json
{
  "version": "1.0",
  "mcu": {
    "package": "ATtiny3227",
    "driver": "megaTinyCore"
  },
  "connectedPins": [
    {
      "pin": 5,
      "boardPin": "PB0",
      "net": "SDA",
      "peripheral": "I2C"
    },
    {
      "pin": 7,
      "boardPin": "PB2",
      "net": "SCL",
      "peripheral": "I2C"
    }
  ],
  "availablePeripherals": ["I2C", "SPI", "UART"]
}
```
</ScrollArea>

## `typehal` Property

The `typehal` property on `Component` provides the metadata needed for contract generation:

| Field | Description |
|-------|-------------|
| `boardPackage` | MCU package identifier for firmware tools |
| `driver` | Firmware framework/driver name |
| `role` | Component role in the design |
| `config` | Additional configuration for the firmware |
| `pinLookup` | Mapping from IC pin numbers to board framework pin names |

## Peripheral Detection

**type**CAD automatically detects available peripherals by analyzing KiCAD pin names. If a component has pins named `SDA` and `SCL`, I2C is detected. Pins named `MOSI`, `MISO`, `SCK`, and `CS` indicate SPI. `RX` and `TX` pins indicate UART.

## TypeHAL Integration

The hardware contract is designed to work with TypeHAL, a firmware generation tool that can take the contract JSON and produce initialization code for your MCU. This enables a seamless flow from hardware design to firmware development.

<div class="relative">
<br/>
<br/>
<br/>
    <p class="absolute right-0">
       <a href="/docs/ai" class={buttonVariants({ variant: "outline" })}>AI Notes<ChevronRight /></a>
    </p>
</div>
