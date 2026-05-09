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

# Make a schematic file in typeCAD

A schematic file isn't needed since typeCAD code takes the place of it, but it can be useful to have one available. People will likely still want to look at a schematic rather than code.

This functionality is now built into `@typecad/typecad`. Use the `schematic` export to generate KiCAD schematic files from your typeCAD project.

```ts
import { schematic } from '@typecad/typecad';
```