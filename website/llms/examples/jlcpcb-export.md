# JLCPCB-Export

The [@typecad/jlcpcb-export](https://www.npmjs.com/package/@typecad/jlcpcb-export) package exports all the assembly files for JLCPCB. 

Install the package in a **type**CAD project:

```ts
npm i @typecad/jlcpcb-export
```

Then `import` it and use it:

```ts
import { PCB } from '@typecad/typecad';
import { jlcpcb_export } from '@typecad/jlcpcb-export';// [!code highlight]

let typecad = new PCB('project');

// all your code

jlcpcb_export(typecad, pcb);// [!code highlight]
```

## Pre-checks
The most appropriate place to run `jlcpcb_export` may not be at the bottom of your code. This would work nicely in a Github CI/CD setup. When an update is pushed, the build files are created. Another option would be running it as a git hook. 

Regardless of where you run it, it will check:
- that the board passes KiCAD's DRC
- that the git repo is clean

If you don't care, you can disable these checks:

`jlcpcb_export(typecad, pcb, true);`

## Output
Several files will be created, with a single zip file ready to upload to JLCPCB.