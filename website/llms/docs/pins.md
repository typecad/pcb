# Pins
In **type**CAD, the `Pin` object represents the pin/leg/lead/ball etc. of a component. 

## Pin Access Methods

There are two ways to access pins in **type**CAD:

### Numeric Pin Access: `component.pin(number)`
Use this for simple components like passives where pin numbers are straightforward:

```ts
import { Resistor } from '@typecad/passives/0805'
let r1 = new Resistor({ value: '1kohm' });

r1.pin(1);      // first pin
r1.pin(2);      // second pin
```

### Named Pin Access: `component.PINNAME`
Use this for complex components (ICs, connectors) where pins have descriptive names:

```ts
import { ATtiny85_20S } from './ATtiny85_20S';
let u1 = new ATtiny85_20S();

u1.VCC      // power pin (internally pin 8)
u1.GND      // ground pin (internally pin 4)
u1.PB0      // GPIO pin PB0
```

**When to use each:**
- **Passives** (resistors, capacitors, LEDs): Use `component.pin(1)`, `component.pin(2)`
- **ICs and complex components**: Use named pins like `component.VCC`, `component.GND`
- **Connectors**: Can use either `connector.pin(1)` or named pins if defined

## Power aware
Each `Pin` object has a `powerInfo` object that can be optionally passed when creating the `Pin`. It has the following properties:
- `minimum_voltage` — minimum voltage the pin can tolerate
- `maximum_voltage` — maximum voltage the pin can tolerate
- `current` — maximum current the pin can handle

When pins have the object passed with data, **type**CAD can check that the voltage levels and current draw are compatible with each other. 

```ts
  VCC = new Pin(this.reference, 8, 'power_in', this, {
    minimum_voltage: -0.5,
    maximum_voltage: 6,
    current: 0.2,
  });
```
`VCC` can accept -0.5 to 6 volts and supply up to 0.2 amps. When connected to other pins, **type**CAD can check that the voltage and current levels are compatible and issue error or warning messages if the voltage is too high or the current draw is too much.

       Power