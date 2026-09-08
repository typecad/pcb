# Test jig/multi-board creation

Making a test jig is a common activity when developing a PCB. Using **type**CAD, you can create a test jig and the board you're developing in a single codebase. This is also a demonstration of how multiple PCBs can be created from code as well. 

## Testing jigs
For this example, our board and jig will be:
1. a board with test points on the bottom
2. another board with pogo pins that connect to the test points
3. the boards will connect with standoffs and mounting holes

There's obviously a lot of options here and this is just a simple example of one way it could be done. 

## Make a **type**CAD project
From a terminal, run:

```bash
typecad-pcb create
```

Call this project `jig`. No need to make a PlatformIO project or initialize a git repo unless you want to. No extra packages are needed either, but feel free to add them later if you want. 

## Code
Add some code which will:
- create a board with two test points and two mounting holes
- create a jig board with two pogo pins and two mounting holes
- add a resistor to pretend to be testing something

```ts
import { PCB, Resistor, MountingHole, TestPoint } from "@typecad/pcb"
import { P70_5000045R } from './P70_5000045R';

let typecad = new PCB('main');

let r1 = new Resistor({ value: '1kohm', pcb: {x: 166.815, y: 86.36, rotation: 0} });
let mh1 = new MountingHole({ size: 'M2.5', pcb: {x: 152.4, y: 76.2, rotation: 0} });
let mh2 = new MountingHole({ size: 'M2.5',  pcb: {x: 177.8, y: 101.6, rotation: 0} });

let tp1 = new TestPoint({  pcb: {x: 165.1, y: 81.28, rotation: 0} });
let tp2 = new TestPoint({  pcb: {x: 168.04, y: 93.98, rotation: 0} });

typecad.create(r1, mh1, mh2, tp1, tp2);

let jig = new PCB('jig');
let pogo1 = new P70_5000045R({  pcb: {x: 165.1, y: 81.28, rotation: 0} });
let pogo2 = new P70_5000045R({  pcb: {x: 168.04, y: 93.98, rotation: 0} });

jig.create(mh1, mh2, pogo1, pogo2);
```

## Code walkthrough

### `import`

```ts
import { PCB, Resistor, MountingHole, TestPoint } from "@typecad/pcb"
import { P70_5000045R } from './P70_5000045R';
```

We import the usual classes, plus a pogo pin from a custom package (_there's a downlink link at the bottom for this whole project_). `MountingHole`, `TestPoint` and `Resistor` are all built into `@typecad/pcb`, which is already installed.

### `PCB`
Now create the two PCBs.

```ts
let typecad = new PCB('main');
let jig = new PCB('jig');
```

Here, we create the main board, and also the jig board.

### Components
Then all the components are created. `mh1`, `mh2` are mounting holes. `tp1`, `tp2` are test points and will go on the main PCB. `pogo1`, `pogo2` are pogo pins and will go on the jig board. 

One important point to see is that the locations are being specified. This will come in handy when we reuse the mounting holes on the jig board. 

Now create the components on the main board.

```ts
pcb.create(r1, mh1, mh2, tp1, tp2);
```

### Jig board components
The last thing to do will be to add the mounting holes and pogo pins to the jig board. Notice that we've copied the xy locations of the test points to the pogo pins. This will ensure that the pogo pins line up with the test points. 

```ts
let pogo1 = new P70_5000045R({  pcb: {x: 165.1, y: 81.28, rotation: 0} });
let pogo2 = new P70_5000045R({  pcb: {x: 168.04, y: 93.98, rotation: 0} });

jig.create(mh1, mh2, pogo1, pogo2);
```

## Build
Build the code and there will be two PCB files created; `main.kicad_pcb` and `jig.kicad_pcb`. You'll see that the mounting holes, testpoints/pogo pins all line up. From here you can add additional functionality as needed. Changes made to one board can be programmatically applied to the other board with just a little bit of code. 

## Downlink
[jig project source](/examples/jig/jig.zip)

Extract the zip file and open `jig.code-workspace` in VSCode. `npm i` to install dependencies.