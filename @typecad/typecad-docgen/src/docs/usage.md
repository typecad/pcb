# TypeCAD Documentation Generator Usage Guide

The TypeCAD Documentation Generator is a powerful tool that converts markdown files into beautiful HTML documentation with special support for PCB design files. It's particularly useful for documenting KiCad PCB projects with interactive layer visualization and 3D renders.

## Installation

```bash
npm install -g @typecad/typecad-docgen
```

## Basic Usage

```bash
typecad-docgen input.md pcb_file.kicad_pcb
```

This will generate an HTML file with the same name as your input markdown file (e.g., `input.html`).

## Frontmatter Configuration

You can customize the documentation output by adding frontmatter to your markdown file:

```yaml
---
title: My PCB Project
company: Acme Electronics
board_name: Main Controller
variant: v1.0
revision: A
date: 2024-03-30
highlight: github-light
stylesheet: https://cdn.jsdelivr.net/npm/github-markdown-css@5.5.0/github-markdown.min.css
kicad_theme: default
---
```

### Frontmatter Options

| Option | Description | Default |
|--------|-------------|---------|
| `title` | Document title | Empty |
| `company` | Company name | Empty |
| `board_name` | PCB board name | Empty |
| `variant` | Board variant | Empty |
| `revision` | Revision number | Empty |
| `date` | Document date | Current date |
| `highlight` | Code highlighting theme | github-light |
| `stylesheet` | Custom CSS stylesheet URL | GitHub Markdown CSS |
| `kicad_theme` | KiCad color theme | default |

## PCB Layer Visualization

### Layer Stackup Diagram

To include a PCB layer stackup visualization:

```markdown
![{Stackup}](images/stackup.png =800)
```

The number after `=` specifies the width in pixels.

### Individual Layer Views

To show specific PCB layers:

```markdown
![{F.Cu,F.Mask}](images/top-copper.png =600)
![{B.Cu,B.Mask}](images/bottom-copper.png =600)
```

You can combine multiple layers by separating them with commas.

### 3D Renders

To include 3D renders of your PCB:

```markdown
![{Render/top/0/0/0}](images/3d-top.png =800)
![{Render/bottom/180/0/0}](images/3d-bottom.png =800)
```

The render syntax is: `{Render/view/x/y/z}` where:
- `view`: top, bottom, front, back, left, right
- `x,y,z`: rotation angles in degrees

## Advanced Features

### Tables

The documentation generator supports extended table syntax with rowspans and colspans:

```markdown
| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |
| Cell 3   | Cell 4   |
```

### UML Diagrams

You can include UML diagrams using PlantUML syntax:

```markdown
\`\`\`plantuml
@startuml
class PCB {
  +layers: Layer[]
  +render()
}
@enduml
\`\`\`
```

### Code Highlighting

Code blocks are automatically syntax-highlighted:

```markdown
\`\`\`typescript
function processLayers(layers: string[]): void {
  // Your code here
}
\`\`\`
```

## Example Document

Here's a complete example:

```markdown
---
title: Motor Controller Board
company: TypeCAD
board_name: MC-100
variant: Standard
revision: B
date: 2024-03-30
---

# Motor Controller Documentation

## Board Overview

This board is designed to control up to 4 DC motors with PWM capability.

## Layer Stackup

Here's our 4-layer PCB stackup:

![{Stackup}](images/stackup.png =800)

## PCB Layers

### Top Layer
![{F.Cu,F.Mask,F.Silks}](images/top.png =600)

### Bottom Layer
![{B.Cu,B.Mask,B.Silks}](images/bottom.png =600)

## 3D Views

### Top View
![{Render/top/0/0/0}](images/3d-top.png =800)

### Bottom View
![{Render/bottom/180/0/0}](images/3d-bottom.png =800)
```

## Tips and Best Practices

1. Always specify image widths for consistent rendering
2. Use descriptive filenames for your layer images
3. Combine related layers (e.g., copper with mask and silkscreen) for better visualization
4. Keep your markdown files organized with clear sections
5. Use the frontmatter to provide accurate project metadata

## Troubleshooting

### Common Issues

1. **KiCad Not Found**: Ensure KiCad is installed and accessible in your system PATH
2. **Image Generation Fails**: Check if you have write permissions in the output directory
3. **Layer Not Found**: Verify the layer name matches exactly with KiCad layer names
4. **Memory Issues**: When processing large PCBs, try generating fewer layers at once

### Error Messages

- ❌ Failed to generate PCB layer stackup: Check your PCB file format
- ❌ Could not export layer: Verify the layer exists
- ❌ Failed to combine PCB layers: Check layer compatibility
- ❌ Could not render 3D view: Verify KiCad is installed correctly

## Support

For more information and updates, visit:
- Website: https://typecad.net
- Support: https://www.buymeacoffee.com/typecad 