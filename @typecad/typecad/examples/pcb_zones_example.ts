import { PCB, Schematic, Component } from '../index.js'

// Create a schematic with some components and nets
const schematic = new Schematic('zones_example')

// Create some components
const U1 = new Component({ reference: 'U1', value: 'MCU', footprint: 'QFP-64' })
const C1 = new Component({ reference: 'C1', value: '0.1uF', footprint: 'C_0805' })
const C2 = new Component({ reference: 'C2', value: '10uF', footprint: 'C_0805' })

// Add components to schematic
schematic.add(U1, C1, C2)

// Create named nets
schematic.named('GND').net(U1.pin(1), C1.pin(1), C2.pin(1))
schematic.named('VCC').net(U1.pin(2), C1.pin(2), C2.pin(2))
schematic.named('SIGNAL').net(U1.pin(3))

// Create the PCB
const pcb = new PCB('zones_example', {
  Schematic: schematic
})

// ============================================
// BASIC FILLED ZONES
// ============================================

// Basic GND plane on both sides (minimal parameters)
pcb.zone({
  net: 'GND',
  layers: ['F.Cu', 'B.Cu'],
  x: 0, y: 0,
  width: 100, height: 80
})

// VCC power plane on top layer only
pcb.zone({
  net: 'VCC',
  layers: ['F.Cu'],
  x: 10, y: 10,
  width: 50, height: 40
})

// Using pin reference instead of net name
pcb.zone({
  pin: U1.pin(3),
  layers: ['F.Cu'],
  x: 70, y: 10,
  width: 20, height: 20
})

// ============================================
// ZONES WITH MANAGEMENT OPTIONS
// ============================================

// Named, locked zone with priority
pcb.zone({
  net: 'GND',
  layers: ['F.Cu'],
  x: 0, y: 85,
  width: 100, height: 30,
  name: 'Main Ground Plane',
  locked: true,
  priority: 10
})

// High priority zone (fills first)
pcb.zone({
  net: 'VCC',
  layers: ['F.Cu'],
  x: 20, y: 90,
  width: 30, height: 20,
  priority: 20
})

// ============================================
// THERMAL RELIEF AND PAD CONNECTION
// ============================================

// Custom thermal relief settings
pcb.zone({
  net: 'GND',
  layers: ['B.Cu'],
  x: 0, y: 0,
  width: 50, height: 50,
  thermalGap: 0.3,
  thermalBridgeWidth: 0.5
})

// Full pad connection (no thermal relief)
pcb.zone({
  net: 'VCC',
  layers: ['B.Cu'],
  x: 55, y: 0,
  width: 40, height: 40,
  connectPads: 'full',
  clearance: 0.3
})

// Through-hole only connection
pcb.zone({
  net: 'GND',
  layers: ['F.Cu', 'B.Cu'],
  x: 0, y: 55,
  width: 40, height: 20,
  connectPads: 'thru_hole_only',
  clearance: 0.2
})

// No pad connection (isolated zone)
pcb.zone({
  net: 'SIGNAL',
  layers: ['F.Cu'],
  x: 45, y: 55,
  width: 30, height: 20,
  connectPads: 'no',
  clearance: 0.5
})

// ============================================
// CORNER SMOOTHING
// ============================================

// Filleted corners
pcb.zone({
  net: 'GND',
  layers: ['F.Cu'],
  x: 105, y: 0,
  width: 30, height: 30,
  smoothing: 'fillet',
  smoothingRadius: 2.0,
  name: 'Smooth GND Zone'
})

// Chamfered corners
pcb.zone({
  net: 'VCC',
  layers: ['F.Cu'],
  x: 105, y: 35,
  width: 30, height: 30,
  smoothing: 'chamfer',
  smoothingRadius: 1.5
})

// ============================================
// ISLAND REMOVAL
// ============================================

// Always remove islands
pcb.zone({
  net: 'GND',
  layers: ['F.Cu'],
  x: 0, y: 120,
  width: 40, height: 30,
  islandRemovalMode: 0
})

// Never remove islands (preserve all copper)
pcb.zone({
  net: 'SIGNAL',
  layers: ['F.Cu'],
  x: 45, y: 120,
  width: 30, height: 30,
  islandRemovalMode: 1,
  name: 'Antenna Zone'
})

// Remove islands below minimum area
pcb.zone({
  net: 'GND',
  layers: ['F.Cu'],
  x: 80, y: 120,
  width: 50, height: 30,
  islandRemovalMode: 2,
  islandAreaMin: 0.5  // Remove islands smaller than 0.5mm²
})

// ============================================
// HATCHED FILL ZONES
// ============================================

// Hatched fill with custom settings
pcb.zone({
  net: 'GND',
  layers: ['F.Cu'],
  x: 140, y: 0,
  width: 40, height: 40,
  fillMode: 'hatched',
  hatchThickness: 0.2,
  hatchGap: 0.5,
  hatchOrientation: 45,
  hatchSmoothingLevel: 2,
  name: 'Hatched Ground'
})

// Hatched fill with different orientation
pcb.zone({
  net: 'VCC',
  layers: ['F.Cu'],
  x: 185, y: 0,
  width: 40, height: 40,
  fillMode: 'hatched',
  hatchThickness: 0.3,
  hatchGap: 1.0,
  hatchOrientation: 90
})

// ============================================
// HATCH DISPLAY SETTINGS
// ============================================

// No hatch outline display
pcb.zone({
  net: 'GND',
  layers: ['F.Cu'],
  x: 140, y: 45,
  width: 30, height: 25,
  hatchStyle: 'none'
})

// Edge hatch with custom spacing
pcb.zone({
  net: 'VCC',
  layers: ['F.Cu'],
  x: 175, y: 45,
  width: 30, height: 25,
  hatchStyle: 'edge',
  hatchPitch: 1.0
})

// Full hatch display
pcb.zone({
  net: 'SIGNAL',
  layers: ['F.Cu'],
  x: 210, y: 45,
  width: 30, height: 25,
  hatchStyle: 'full',
  hatchPitch: 0.5
})

// ============================================
// COMPREHENSIVE FILLED ZONE
// ============================================

pcb.zone({
  // Net specification
  net: 'GND',

  // Position and layers
  layers: ['F.Cu', 'B.Cu'],
  x: 140, y: 75,
  width: 100, height: 75,

  // Zone management
  name: 'Main Ground Plane',
  locked: true,
  priority: 5,

  // Fill settings
  fillMode: 'solid',
  filled: true,
  minThickness: 0.2,
  fillArcSegments: 32,

  // Thermal relief
  thermalGap: 0.3,
  thermalBridgeWidth: 0.5,

  // Pad connection
  connectPads: 'thru_hole_only',
  clearance: 0.25,

  // Corner smoothing
  smoothing: 'fillet',
  smoothingRadius: 1.0,

  // Island removal
  islandRemovalMode: 2,
  islandAreaMin: 0.5,

  // Hatch display
  hatchStyle: 'edge',
  hatchPitch: 0.508
})

// ============================================
// KEEPOUT ZONES
// ============================================

// Basic keepout (restricts everything)
pcb.keepout({
  layers: ['F.Cu', 'B.Cu'],
  x: 250, y: 0,
  width: 30, height: 30,
  name: 'Component Keepout'
})

// Restrict only tracks and vias, allow pads
pcb.keepout({
  layers: ['F.Cu'],
  x: 285, y: 0,
  width: 30, height: 30,
  restrictions: {
    tracks: true,
    vias: true,
    pads: false,
    copperpour: true,
    footprints: false
  },
  name: 'Routing Keepout'
})

// Restrict only copper pour (allow routing)
pcb.keepout({
  layers: ['F.Cu', 'B.Cu'],
  x: 250, y: 35,
  width: 30, height: 30,
  restrictions: {
    tracks: false,
    vias: false,
    pads: false,
    copperpour: true,
    footprints: false
  },
  name: 'No Copper Pour'
})

// High-priority keepout with smoothing
pcb.keepout({
  layers: ['F.Cu', 'B.Cu'],
  x: 285, y: 35,
  width: 30, height: 30,
  priority: 100,
  smoothing: 'fillet',
  smoothingRadius: 1.0,
  locked: true,
  name: 'Critical Area'
})

// Keepout with custom hatch display
pcb.keepout({
  layers: ['F.Cu'],
  x: 250, y: 70,
  width: 30, height: 30,
  hatchStyle: 'full',
  hatchPitch: 0.5,
  name: 'Visible Keepout'
})

// ============================================
// COMPREHENSIVE KEEPOUT ZONE
// ============================================

pcb.keepout({
  // Position and layers
  layers: ['F.Cu', 'B.Cu'],
  x: 285, y: 70,
  width: 35, height: 35,

  // Zone management
  name: 'High Priority Antenna Area',
  locked: true,
  priority: 50,

  // Restrictions (customize what's not allowed)
  restrictions: {
    tracks: true,      // Don't allow tracks
    vias: true,        // Don't allow vias
    pads: false,       // Allow pads
    copperpour: true,  // Don't allow copper pour
    footprints: true   // Don't allow footprints
  },

  // Corner smoothing
  smoothing: 'fillet',
  smoothingRadius: 1.0,

  // Hatch display
  hatchStyle: 'edge',
  hatchPitch: 0.508
})

// Create the PCB file
pcb.create(U1, C1, C2)

console.log('PCB with comprehensive zone examples created successfully!')
console.log('Check build/zones_example.kicad_pcb')
console.log('')
console.log('This example demonstrates:')
console.log('  ✓ Basic filled zones with net connection')
console.log('  ✓ Zone management (name, locked, priority)')
console.log('  ✓ Thermal relief and pad connection options')
console.log('  ✓ Corner smoothing (fillet and chamfer)')
console.log('  ✓ Island removal modes')
console.log('  ✓ Hatched fill zones with custom settings')
console.log('  ✓ Hatch display settings')
console.log('  ✓ Keepout zones with custom restrictions')
console.log('  ✓ All possible zone configuration options')
