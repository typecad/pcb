---
title: Schematics               
description: Generate a schematic file from typeCAD projects
date: '2025-5-13'
categories:
  - tools
  - command-line
  - schematic
  - code-as-schematic
published: true
cover: https://unsplash.com/photos/QCOg4dicY74/download?ixid=M3wxMjA3fDB8MXxzZWFyY2h8N3x8ZWxlY3RyaWNhbCUyMHNjaGVtYXRpY3xlbnwwfHx8fDE3NDcxNDE4OTB8MA&force=true&w=640
---
<br />

# Make a schematic file in typeCAD

A schematic file isn't needed since typeCAD code takes the place of it, but it can be useful to have one available. People will likely still want to look at a schematic rather than code.

Schematic generation is now built into `PCB.create()` — calling `create()` produces a `.kicad_pcb`, `.kicad_sch`, and `.net` file automatically.

```ts
import { PCB } from '@typecad/typecad';

let typecad = new PCB('my-board');
typecad.create(r1, c1, led);
// Generates: ./build/my-board.kicad_pcb, ./build/my-board.kicad_sch, ./build/my-board.net
```

No separate import or function call is needed.
