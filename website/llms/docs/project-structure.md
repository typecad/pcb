# Project Structure

A **type**CAD project is self-contained and looks like this:

```bash
project
├── fw
├── hw
│    └── build
│        └── lib
│            └── footprints
└── src
```

## `fw`
Intended for firmware. If a PlatformIO project is created when you run `typecad create`, you can open the `workspace` file to open both the firmware and hardware projects in the same VSCode and have access to their respective build tools.

## `hw`
All the hardware-related files are here.
- `typecad.conf.ts` — configuration file (see [Configuration](/docs/configuration))
- `build` holds all the KiCAD files
- `./build/lib` is where KiCAD symbols are stored
- `./build/lib/footprints` is where KiCad footprints are stored
- `src` is where the TypeScript files are stored

Files under `./build/lib/` come from two sources: components you add locally via the **type**CAD CLI (`typecad add`), and any installed component packages. When a component package that bundles its own `./build/lib/` is used in a project, **type**CAD automatically syncs those bundled files into the project's `./build/lib/` directory the first time the `Package` is constructed during a build — no install script required.

## Self-contained
The entire project is contained in the project folder. Symbols, footprints, 3d files, source files, etc. are all in this project folder.

       Classes