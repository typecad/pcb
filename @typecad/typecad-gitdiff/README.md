# typeCAD-gitdiff
> Visual PCB comparison tool for KiCAD files with interactive diff viewer

[Online Demo 🛺](https://typecad.net/gitdiff.html)

A tool that generates interactive HTML reports showing differences between KiCAD PCB files. Features include layer-by-layer comparison, multiple viewing modes, and customizable color schemes for highlighting changes.

## ✨ Features

- **Interactive  Viewer**: Modern web-based interface with zoom, pan, and multiple view modes
- **Layer-by-Layer Analysis**: Compare individual PCB layers (copper, mask, paste, silkscreen, etc.)
- **Multiple View Modes**: Side-by-side, overlay, onion skin, swipe compare, and diff-only views
- **Customizable Colors**: Configure colors for modified and new features
- **Theme Support**: Can use KiCAD themes
- **Git Integration**: Integrate with git workflows


## 🚀 Getting Started

### Prerequisites

- **KiCAD v8 or later** - Required for PCB file processing
- **Node.js** - For running the tool
- **git** (optional) - For git integration features

### Installation

Install globally via npm:

```bash
npm i -g @typecad/typecad-gitdiff
```

## 📖 Usage

### Basic Comparison

```bash
typecad-gitdiff <original.kicad_pcb> <modified.kicad_pcb>
```

### Command Line Options

| Option | Description | Example |
|--------|-------------|---------|
| `--full` | Process all layers including User layers (User.1, User.2, etc.) | `--full` |
| `--theme <name>` | Specify KiCAD theme for SVG export | `--theme "Monokai"` |
| `--color-modified <hex>` | Color for modified features | `--color-modified "#ff6600"` |
| `--color-new <hex>` | Color for new features | `--color-new "#4caf50"` |
| `--help, -h` | Show help information | `--help` |
| `--version, -v` | Show version information | `--version` |

### Examples

```bash
# Basic comparison (standard layers only)
typecad-gitdiff board_v1.kicad_pcb board_v2.kicad_pcb

# Full comparison including all User layers
typecad-gitdiff --full board_v1.kicad_pcb board_v2.kicad_pcb

# Custom theme and colors
typecad-gitdiff --theme "typeCAD-light" \
                --color-modified "#ff0000" \
                --color-new "#00ff00" \
                board_v1.kicad_pcb board_v2.kicad_pcb
```

## 🔗 Git Integration

Integrate with git to compare committed versions:

```bash
# Compare current file with last committed version
git difftool <file.kicad_pcb> --extcmd 'typecad-gitdiff'

# Full comparison with git
git difftool <file.kicad_pcb> --extcmd 'typecad-gitdiff --full'

# With custom colors in git
git difftool <file.kicad_pcb> --extcmd 'typecad-gitdiff --color-modified "#ff6600"'
```

## 🎨 Interactive Viewer Features

The generated HTML report includes:

- **Layer Selection**: Toggle individual PCB layers on/off
- **View Modes**:
  - **Diff Only**: Show only the differences
  - **Side by Side**: Original, differences, and modified views
  - **Overlay**: Layered comparison with blend modes
  - **Onion Skin**: Semi-transparent overlay
  - **Swipe Compare**: Interactive left/right comparison
- **Zoom & Pan**: Zoom in/out/reset functions
- **Theme Toggle**: Switch between light and dark themes
- **Layer Transparency**: Adjust opacity for better visibility
- **Dark/Light Mode**: Helps with seeing changes



## 🔗 Links

- **Homepage**: [https://typecad.net/](https://typecad.net/)
- **Support**: [https://www.buymeacoffee.com/typecad](https://www.buymeacoffee.com/typecad)


---

*Part of the typeCAD ecosystem - bringing modern development practices to PCB design*