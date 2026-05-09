# JLCPCB Export

Export all the required files for [JLCPCB](https://jlcpcb.com/) assembly from a [typeCAD](https://typecad.net) project. 

It will:
- run KiCAD's DRC on the PCB
- check if the git repository is clean
- create a folder structure based on the typeCAD project version and board named
- generate drill, position, gerbers, and BOM files formatted for JLCPCB
- zip the gerbers and drill file

## Getting Started

### Prerequisites

- a working [typeCAD](https://typecad.net) project

### Installation
Run the following command in your project directory, where your typeCAD package.json file is located:

```npm i @typecad/jlcpcb-export```

## Usage

```ts
import { PCB, Schematic } from '@typecad/typecad';
import { jlcpcb_export } from "@typecad/jlcpcb-export";

let typecad = new Schematic('project');
let pcb = new PCB('project');

jlcpcb_export(typecad, pcb);
```

If the project doesn't pass DRC or the git repository is not clean, the function will throw an error. They can be ignored by calling the function like:

`jlcpcb_export(typecad, pcb, true);`
