# Documentation Generation

The `typecad doc` command generates self-contained HTML documentation from a Markdown file combined with a KiCAD PCB file. It automatically embeds PCB layer images, 3D renders, and other visuals.

## Basic Usage

```bash
typecad doc docs/board.md build/board.kicad_pcb -o docs/board.html
```

## Creating Your Document

Create a Markdown file with frontmatter and content:

```text
---
title: Sensor Board Documentation
company: Acme Corp
board_name: SensorBoard
revision: "1.0"
---

# Sensor Board Documentation

## Top Copper Layer

![{F.Cu}](top_copper.svg =600)

## Bottom Copper Layer

![{B.Cu}](bottom_copper.svg =600)

## Component Placement

![{F.SilkS,F.Mask}](placement.svg =600)

## 3D View

![{Render/30/45/0}](render.png)

## Schematic Notes

The board uses an ATtiny3227 MCU with I2C-connected sensors.
```

## Layer Export Syntax

Use custom image syntax to reference PCB layers:

| Syntax | Description |
|--------|-------------|
| `![{F.Cu}](out.svg)` | Front copper layer |
| `![{F.Cu,F.Mask}](out.svg =600)` | Multiple layers combined |
| `![{B.Cu}](out.svg)` | Bottom copper layer |
| `![{F.SilkS}](out.svg)` | Front silkscreen |
| `![{Edge.Cuts}](out.svg)` | Board outline |
| `![{Render/30/45/0}](out.png)` | 3D render with rotation |
| `![{Drill}](out.svg)` | Drill map |
| `![{Stackup}](out.svg)` | Layer stackup diagram |

## Assembly Documentation

A common use case is generating assembly documentation:

```bash
typecad doc assembly.md build/sensor_board.kicad_pcb -o build/assembly-docs.html
```

This creates a shareable, self-contained HTML file with all images embedded — perfect for sending to manufacturers or archiving.