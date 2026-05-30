# Package Use
Now that we've created a package, we need to know how to use it.

## Self-documenting
A benefit of TypeScript is that you can write a lot of documentation in the code itself. You'll notice the JSDoc comments in the package code. This will result in VSCode hints and tips as you write the code, explaining parameters and providing examples if fully implemented.

## Copying files
Refer to the [structure](../package/structure) section for the file structure of a package, particularly the `postinstall.js` file. KiCAD expects symbols and footprints to be in the `./build` directory, but we haven't actually `npm install`ed the package, so those files will need to be manually copied there.

## `import`
The tooling gave us the `import` statement for the package.

```ts
import { TypecadPackage } from "./typecad_package";
```

## `new`
Now create a new instance of the package. `pcb`, `x`, and `y` are required:

```ts
import { PCB } from '@typecad/typecad';
import { TypecadPackage } from "./typecad_package";
import * as _0805 from '@typecad/passives/0805'

let typecad = new PCB('typecad_docs');

let u1 = new TypecadPackage({ pcb: typecad, x: 50, y: 50 });
let u2 = new TypecadPackage({ pcb: typecad, x: 100, y: 50, reference: 'U2' });
let u3 = new TypecadPackage({ pcb: typecad, x: 150, y: 50, passives: _0805 });
```

Options:
- _pcb_ — the PCB instance (required)
- _x_ / _y_ — position on the board (required)
- _reference_ — reference designator for the main IC
- _name_ — name for the PCB group (defaults to the class name)
- _passives_ — override the default 0603 passives factory

## Connections
After creating the instance, you can access the pins of any component in the package:

```ts
u1.ATtiny3227_M.GND // the ground pin of the ATtiny3227
u1.ATtiny3227_M.VCC // the power pin of the ATtiny3227
```

## Include the package
After the package has been pulled in with an `import` and a `new` instance created, configuration is done, and connections made, you `create` it to the schematic.

```ts
import { PCB } from '@typecad/typecad';
import { TypecadPackage } from "./typecad_package";
let typecad = new PCB('typecad_docs');

let u1 = new TypecadPackage({ pcb: typecad, x: 50, y: 50 });

typecad.create(u1.components);
```

The package's components will be added to the PCB.

## Do Not Populate
If a package includes a component you don't want included in the netlist or layout:

```ts
let u1 = new TypecadPackage({ pcb: typecad, x: 50, y: 50 });
u1.ATtiny3227_M.dnp = true;
```