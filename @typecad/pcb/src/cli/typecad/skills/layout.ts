import type { Skill } from './types.js';

export const layoutSkills: Skill[] = [
  {
    name: 'track',
    category: 'pcb-layout',
    description:
      'Create PCB traces with the TrackBuilder fluent API for manual routing between points with layer transitions',
    package: '@typecad/pcb',
    import: "import { PCB, TrackBuilder } from '@typecad/pcb';",
    examples: [
      {
        title: 'Basic track',
        code: `let track: TrackBuilder = pcb
  .track()
  .from({ x: 10, y: 10 }, 'F.Cu', 0.25)
  .to({ x: 20, y: 10 })
  .to({ x: 20, y: 30 });`,
      },
      {
        title: 'Track with via and layer change',
        code: `let power_track = pcb
  .track()
  .powerInfo({ current: 1.0, maxTempRise: 10, thickness: 35 })
  .from({ x: 100, y: 100 }, 'F.Cu', 0.5)
  .to({ x: 110, y: 100 })
  .via({ size: 0.8, drill: 0.4 })
  .to({ x: 110, y: 120, layer: 'B.Cu' });`,
      },
      {
        title: 'Track in a group',
        code: `let t1 = pcb.track().from({ x: 0, y: 0 }, 'F.Cu', 0.2).to({ x: 10, y: 10 });
let t2 = pcb.track().from({ x: 10, y: 10 }, 'F.Cu', 0.2).to({ x: 20, y: 10 });

pcb.group('routing_group', t1, t2);
pcb.create();`,
      },
    ],
    notes: [
      'from() must be called first to set the starting point',
      'Layer defaults to F.Cu, width defaults to 0.2mm',
      'via() inserts a via at the current position and switches layer',
      'powerInfo() enables IPC-2221 current/thermal checking',
      'Tracks are passed to create() or group() to be included in output',
    ],
    related: ['via', 'zone', 'autoroute', 'pcb-structure'],
  },
  {
    name: 'via',
    category: 'pcb-layout',
    description: 'Create vias for layer transitions using the PCB.via() method with optional power-aware sizing',
    package: '@typecad/pcb',
    import: "import { PCB } from '@typecad/pcb';",
    examples: [
      {
        title: 'Standalone via',
        code: `let via = pcb.via({
  at: { x: 15, y: 15 },
  size: 0.6,
  drill: 0.3,
});

// Connect via to a net
typecad.net(r1.pin(1), via.pin(1));
pcb.create(via);`,
      },
      {
        title: 'Power-aware via',
        code: `let via = pcb.via({
  at: { x: 10, y: 10 },
  powerInfo: {
    current: 2,
    maxTempRise: 5,
    thickness: 35,
  },
});
// Size and drill are auto-calculated from powerInfo using IPC-2221`,
      },
    ],
    notes: [
      'Vias are accessed through pin(1) for net connections',
      'powerInfo enables automatic via sizing based on IPC-2221 current capacity',
      'Default size: 0.8mm, default drill: 0.4mm',
      'For track-embedded vias, use TrackBuilder.via() instead',
    ],
    related: ['track', 'zone', 'pcb-structure'],
  },
  {
    name: 'zone',
    category: 'pcb-layout',
    description: 'Create filled copper zones (copper pours) for power planes, ground planes, or thermal management',
    package: '@typecad/pcb',
    import: "import { PCB } from '@typecad/pcb';",
    examples: [
      {
        title: 'Ground plane',
        code: `pcb.zone({
  net: 'GND',
  layers: ['F.Cu', 'B.Cu'],
  x: 0,
  y: 0,
  width: 50,
  height: 40,
  fillMode: 'solid',
  clearance: 0.3,
});`,
      },
      {
        title: 'Power zone connected to a pin',
        code: `pcb.zone({
  pin: vreg.VOUT,
  layers: ['F.Cu'],
  x: 20,
  y: 15,
  width: 10,
  height: 8,
  filled: true,
  priority: 1,
});`,
      },
    ],
    notes: [
      'Either pin or net is required to associate the zone with a net',
      'layers is required — specify which copper layers the zone appears on',
      'Common options: fillMode ("solid"|"hatch"), clearance, thermalBridgeWidth, priority',
      'Higher priority zones override lower priority zones in overlapping areas',
      'FILLS ARE MATERIALIZED: create() round-trips the written board through kicad-cli (--refill-zones --save-board), so fill geometry lands in the file and exports include pour copper. Requires KiCad 10; without kicad-cli the fill is skipped with a warning',
      'Opt out per zone with fill: false, or globally with new PCB(name, { fill_zones: false })',
      'Verify with "typecad-pcb query zones" — it distinguishes materialized pours from declared-but-unfilled ones; "typecad-pcb check" DRC judges the filled copper',
    ],
    related: ['keepout', 'via', 'pcb-structure'],
  },
  {
    name: 'keepout',
    category: 'pcb-layout',
    description: 'Create keepout zones that restrict routing, via placement, and copper pours in specific board areas',
    package: '@typecad/pcb',
    import: "import { PCB } from '@typecad/pcb';",
    examples: [
      {
        title: 'Keepout zone around RF area',
        code: `pcb.keepout({
  layers: ['F.Cu', 'B.Cu'],
  x: 30,
  y: 20,
  width: 10,
  height: 8,
  restrictions: {
    tracks: true,
    vias: true,
    copperpour: true,
  },
});`,
      },
    ],
    notes: [
      'layers is required',
      'restrictions controls what is blocked: tracks, vias, pads, copperpour, footprints',
      'Use keepouts to protect sensitive analog or RF areas from digital routing',
    ],
    related: ['zone', 'pcb-structure'],
  },
  {
    name: 'outline',
    category: 'pcb-layout',
    description: 'Define the board outline (edge cuts) using rectangular shapes',
    package: '@typecad/pcb',
    import: "import { PCB } from '@typecad/pcb';",
    examples: [
      {
        title: 'Rectangular board outline',
        code: `let pcb = new PCB('my-board');

pcb.outline(0, 0, 50, 40);

pcb.create();`,
      },
      {
        title: 'Board with rounded corners',
        code: `pcb.outline(0, 0, 50, 40, 3); // 3mm fillet radius`,
      },
    ],
    notes: [
      'Parameters: x, y, width, height in mm',
      'Optional filletRadius for rounded corners',
      'Drawn on Edge.Cuts layer',
      'If no outline is defined, KiCad uses default board bounds',
    ],
    related: ['pcb-structure', 'mounting-hole'],
  },
  {
    name: 'autoroute',
    category: 'pcb-layout',
    description: 'Automatic routing between pins using the route() API with configurable algorithms and constraints',
    package: '@typecad/pcb',
    import: "import { PCB } from '@typecad/pcb';",
    examples: [
      {
        title: 'Route between two pins',
        code: `let result = pcb.route({
  from: u1.pin(1),
  to: r1.pin(1),
  width: 0.25,
  layers: ['F.Cu', 'B.Cu'],
});

// Or use a net definition:
let net = pcb.net(u1.pin(1), r1.pin(1));
let result2 = pcb.route(net);`,
      },
      {
        title: 'Batch routing',
        code: `let results = await autorouteBatchOnPcb(pcb, [
  { from: u1.pin(1), to: r1.pin(1) },
  { from: u1.pin(2), to: r2.pin(1) },
  { from: u1.pin(3), to: r3.pin(1) },
], {
  rounds: 3,
  reorder: 'byDistance',
});`,
      },
    ],
    notes: [
      'route() is synchronous and returns an IAutorouteResult with success status and route details',
      'ORDER IS LOAD-BEARING: put the pins on a net first, and call route() BEFORE create() — create() writes the board, and route() after create() throws a TypeCadError telling you to reorder (routes staged after the write can never reach the board)',
      'Stitch vias materialize inside create() regardless of where stitch() is registered, so routing before create is what matters, not stitch() call order',
      'autorouteBatchOnPcb() supports rip-up-and-retry with multiple rounds',
      'Register external routers with pcbRegisterRouter() (e.g. @typecad-astar)',
      'Options include: width, layers, allowVias, clearance, gridResolution, impedance constraints; on crowded boards raise maxIterations and set gridResolution 0.5',
      'CLI: "typecad-pcb edit route U1.3 R1.1" writes a validated route() call into the source (inserted before the first .create())',
      'CLI: "typecad-pcb query routes" reports per-net copper status (routed pins, lengths, pours); "typecad-pcb query zones" lists pours and keepouts',
    ],
    related: ['track', 'via', 'pcb-structure'],
  },
  {
    name: 'pcb-placement',
    category: 'pcb-layout',
    description: 'Position components on the PCB using the pcb property, groups, and coordinate offsets',
    package: '@typecad/pcb',
    import: "import { PCB } from '@typecad/pcb';",
    examples: [
      {
        title: 'Inline placement',
        code: `let r1 = new Resistor({ value: '10kOhm', pcb: { x: 10, y: 20, rotation: 90 } });
let c1 = new Capacitor({ value: '100nF', pcb: { x: 12, y: 20 } });`,
      },
      {
        title: 'Groups for relative placement',
        code: `pcb.group('power_section', regulator, c_in, c_out);
pcb.group('mcu_section', mcu, bypass1, bypass2);`,
      },
      {
        title: 'Coordinate offsets',
        code: `pcbPushOffset(pcb, 25, 10);
// All subsequent coordinates are relative to (25, 10)
let r1 = new Resistor({ pcb: { x: 0, y: 0 } }); // actually at (25, 10)
let r2 = new Resistor({ pcb: { x: 5, y: 0 } }); // actually at (30, 10)
pcbPopOffset(pcb);`,
      },
    ],
    notes: [
      'Coordinates are in mm, rotation in degrees',
      'side: "front" (default) or "back" for component placement on either side',
      'group() keeps components together on the board',
      'pcbPushOffset/pcbPopOffset for relative positioning of component clusters',
      'kicad2typecad --apply syncs KiCad position changes back; use --capture-layouts to also import text layouts',
    ],
    related: ['component', 'pcb-structure', 'track', 'roundtrip'],
  },
];
