<script lang="ts">
    import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
    import { buttonVariants } from "$lib/components/ui/button";
    import ChevronRight from "lucide-svelte/icons/chevron-right";
    let { data }: { data: PageData } = $props();
</script>

# Configuration

**type**CAD projects can be configured using a `typecad.conf.ts` file in the project's `hw/` directory. This file lets you specify build settings, KiCAD paths, and other options.

## `typecad.conf.ts`

<ScrollArea orientation="both">

```ts
import { defineConfig } from '@typecad/typecad';

export default defineConfig({
  entry: 'src/index.ts',
  kicad_cli: '/usr/bin/kicad-cli',
  kicad_path: '/usr/share/kicad',
  use_flatpak: false,
  verbose: false,
});
```
</ScrollArea>

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

## `typecad doctor`

Use `typecad doctor` to verify your configuration and environment:

<ScrollArea orientation="both">

```bash
typecad doctor
```
</ScrollArea>

This checks that KiCAD, Node.js, and all required tools are installed and accessible. Use `--fix` to attempt automatic fixes and `--json` for machine-readable output.

<div class="relative">
<br/>
<br/>
<br/>
    <p class="absolute right-0">
       <a href="/docs/cli" class={buttonVariants({ variant: "outline" })}>CLI Reference<ChevronRight /></a>
    </p>
</div>
