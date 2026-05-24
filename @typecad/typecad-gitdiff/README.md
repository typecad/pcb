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

### Git Revision Comparison

Compare different revisions of a PCB file from git history:

```bash
typecad-gitdiff HEAD~1 HEAD -- board.kicad_pcb
typecad-gitdiff main feature-branch -- board.kicad_pcb
```

### Command Line Options

| Option | Description | Example |
|--------|-------------|---------|
| `--full` | Process all layers including User layers (User.1, User.2, etc.) | `--full` |
| `--theme <name>` | Specify KiCAD theme for SVG export | `--theme "Monokai"` |
| `--color-modified <hex>` | Color for modified features | `--color-modified "#ff6600"` |
| `--color-new <hex>` | Color for new features | `--color-new "#4caf50"` |
| `--output <path>` | Output HTML report path | `--output report.html` |
| `--help, -h` | Show help information | `--help` |
| `--version, -v` | Show version information | `--version` |

### Examples

```bash
# Basic comparison (standard layers only)
typecad-gitdiff board_v1.kicad_pcb board_v2.kicad_pcb

# Full comparison including all User layers
typecad-gitdiff --full board_v1.kicad_pcb board_v2.kicad_pcb

# Custom output path
typecad-gitdiff --output ./report.html board_v1.kicad_pcb board_v2.kicad_pcb

# Custom theme and colors
typecad-gitdiff --theme "typeCAD-light" \
                --color-modified "#ff0000" \
                --color-new "#00ff00" \
                board_v1.kicad_pcb board_v2.kicad_pcb

# Git revision comparison
typecad-gitdiff HEAD~1 HEAD -- board.kicad_pcb
typecad-gitdiff --full main feature-branch -- board.kicad_pcb
```

### Key Improvements

- **Inner Copper Layer Detection** — Automatically detects and compares inner copper layers (In1.Cu, In2.Cu, etc.) by parsing the PCB file's `(layers ...)` section. No configuration needed.
- **SVG Caching** — Caches exported SVGs by file content hash, so re-running on the same files is instant. Cache is cleared when file content changes.
- **Per-Layer Error Recovery** — If a single layer fails to export, the tool continues processing remaining layers and reports the error.
- **Hash-Based Comparison** — Uses SHA256 hashing for robust SVG comparison, avoiding false positives from whitespace or metadata differences.

## 🔗 Git Integration

Integrate with git to compare committed versions:

```bash
# Compare current file with last committed version
git difftool <file.kicad_pcb> --extcmd 'typecad-gitdiff'

# Full comparison with git
git difftool <file.kicad_pcb> --extcmd 'typecad-gitdiff --full'

# With custom colors in git
git difftool <file.kicad_pcb> --extcmd 'typecad-gitdiff --color-modified "#ff6600"'

# With custom output path
git difftool <file.kicad_pcb> --extcmd 'typecad-gitdiff --output ./diff.html'
```

### Command-line Git Revision Comparison

Compare arbitrary git revisions without git-difftool:

```bash
# Compare HEAD~1 vs HEAD for a PCB file
typecad-gitdiff HEAD~1 HEAD -- board.kicad_pcb

# Compare two branches
typecad-gitdiff main feature-branch -- board.kicad_pcb

# Full mode with git revisions
typecad-gitdiff --full HEAD~3 HEAD -- board.kicad_pcb
```

## 📦 Programmatic API

Use the tool programmatically in your Node.js projects:

```typescript
import { generateDiffs } from '@typecad/typecad-gitdiff';

const reportPath = await generateDiffs({
    originalFile: 'board_v1.kicad_pcb',
    modifiedFile: 'board_v2.kicad_pcb',
    fullMode: false,
    theme: 'typeCAD-light',
    colorModified: '#ff6600',
    colorNew: '#4caf50',
    outputHtmlPath: './report.html',
});
```

### API Exports

| Export | Description |
|--------|-------------|
| `generateDiffs()` | Main function to generate diff HTML report |
| `computeTextualDiff()` | Parse and compare two PCB file contents |
| `annotateLayerSvgs()` | Annotate SVG differences between two layers |
| `cropSvg()` | Crop SVG to content bounding box |
| `sanitizeSvg()` | Strip script/event handlers from SVG |
| `getFileHash()` | Get SHA256 hash of a file |
| `clearCache()` | Clear in-memory SVG and file hash caches |
| `detectInnerCopperLayers()` | Parse PCB file to detect inner copper layers |
| `allLayers` / `standardLayers` | Layer constant arrays |

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