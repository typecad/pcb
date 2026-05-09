import { PCB, Schematic } from '../index.js'

// Create a new PCB
const pcb = new PCB('text_example', {
  Schematic: new Schematic('text_example')
})

// Basic text example (uses default justification: left bottom)
pcb.text({
  text: 'My PCB Project',
  x: 100,
  y: 20
})

// Text with custom font and size
pcb.text({
  text: 'TYPECAD 1HZ',
  x: 145.415,
  y: 108.585,
  rotation: 0,
  layer: 'F.SilkS',
  font: 'Super Skinny Pixel Bricks',
  width: 5,
  height: 5
})

// Bold and italic text
pcb.text({
  text: 'Important Note',
  x: 50,
  y: 50,
  bold: true,
  italic: true,
  thickness: 0.3,
  layer: 'F.SilkS'
})

// Centered text
pcb.text({
  text: 'Version 1.0',
  x: 100,
  y: 150,
  justify: {
    horizontal: 'center',
    vertical: 'middle'
  }
})

// Rotated text
pcb.text({
  text: 'Left Edge Label',
  x: 10,
  y: 100,
  rotation: 90
})

// Back side text
pcb.text({
  text: 'Back Side Label',
  x: 100,
  y: 100,
  layer: 'B.SilkS'
})

// Hidden text (for manufacturing notes)
pcb.text({
  text: 'Internal Note',
  x: 50,
  y: 150,
  layer: 'Cmts.User',
  hide: true
})

// Create the PCB file
pcb.create()

console.log('PCB with text elements created successfully!')
