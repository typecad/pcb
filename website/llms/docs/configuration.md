# Configuration
Everything should work out-of-the-box, but there are several items that can be customized. 

**type**CAD projects can be configured using a `typecad.conf.ts` file in the project's `hw/` directory. This file lets you specify build settings, KiCAD paths, and other options.

## `typecad.conf.ts`

```ts
import { defineConfig } from '@typecad/pcb';

export default defineConfig({
  entry: 'src/index.ts',
  kicad_cli: '/usr/bin/kicad-cli',
  kicad_path: '/usr/share/kicad',
  use_flatpak: false,
  verbose: false,
});
```

### Options

| Option | Type | Description |
|--------|------|-------------|
| `entry` | `string` | Path to the TypeScript entry file (relative to `hw/`) |
| `kicad_cli` | `string` | Path to the `kicad-cli` binary |
| `kicad_path` | `string` | Path to the KiCAD installation directory |
| `use_flatpak` | `boolean` | Prioritizes a Flatpak installation if ``true`` |
| `verbose` | `boolean` | Enable verbose output during builds |

## KiCAD Detection

**type**CAD automatically detects KiCAD installations on your system. It supports:

- **Windows**: Standard install locations
- **macOS**: `/Applications/KiCad/`
- **Linux**: `/usr/share/kicad`, `/usr/local/share/kicad`
- **Flatpak**: Auto-detected when `use_flatpak`

Supported versions: KiCAD 10.0.

## `typecad-pcb doctor`

Use `typecad-pcb doctor` to verify your configuration and environment:

```bash
typecad-pcb doctor
```

This checks that KiCAD, Node.js, and all required tools are installed and accessible. Use `--fix` to attempt automatic fixes and `--json` for machine-readable output.