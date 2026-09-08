# Power
A `Power` object is extra information that is used for:
- ERC: by setting `Pin` types to `power_out` or `power_in`
- voltage compatibility checks
- automatic trace width calculation via `powerInfo`

A `Power` object represents a physical set of pins, not an abstract concept of power or ground.

Options for the `Power` class are:
- _power_ — pin that supplies power
- _gnd_ — pin that supplies ground
- _voltage_ — voltage of the power source
- _current_ — current capacity
- _direction_ — `'output'` (default) for power sources, `'input'` for power consumers

## How Pin Types Are Set

When a `Power` object is created, pin types are set automatically for ERC:

- The `power` pin is set to `power_out` when `direction` is `'output'`, or `power_in` when `direction` is `'input'`.
- The `gnd` pin is **always** set to `power_in`, regardless of direction.

Additionally, `voltage` and `current` are propagated to the pins' `powerInfo` property, which is used by ERC for voltage compatibility checks and by the routing system for automatic trace width calculation.

## Output `Power`

An output `Power` object defines a source of electrical power within your design. If `direction` is omitted, it defaults to `'output'`.

```ts
import { Component, Power } from '@typecad/pcb';

let bt1 = new Component({ footprint: 'Battery:BatteryHolder_Keystone_3008_1x2450' });
let coin_cell = new Power({
    power: bt1.pin(1),  // Pin 1 is the positive terminal → type set to 'power_out'
    gnd: bt1.pin(2),    // Pin 2 is the ground terminal → type set to 'power_in'
    voltage: 3.7,       // Nominal voltage
    current: 0.5,       // Current capacity
    direction: 'output' // This is a power source (default)
});
```

In this example:
- `bt1.pin(1)` gets `type: 'power_out'` and `powerInfo: { minimum_voltage: 3.7, maximum_voltage: 3.7, current: 0.5 }`
- `bt1.pin(2)` gets `type: 'power_in'` and `powerInfo: { current: 0.5 }`

### Shared Ground Pins

Components like voltage regulators often have both power inputs and outputs that share the same ground pin. Since the `gnd` pin is always set to `power_in` regardless of direction, this typically works without conflict. However, if you need to override the pin type for ERC purposes, you can set it manually:

```ts
// U1 is a voltage regulator, pin 2 is shared ground
let vin = new Power({ power: U1.pin(1), gnd: U1.pin(2), voltage: 5, direction: 'input' });
let vout = new Power({ power: U1.pin(3), gnd: U1.pin(2), voltage: 3.3, direction: 'output' });

// Both Power objects set U1.pin(2) to 'power_in', so no conflict here.
// If needed, override manually:
// U1.pin(2).type = 'passive';
```

## Input `Power`

An input `Power` object specifies the power requirements for a component or sub-circuit. It is commonly passed into reusable packages so users can connect a suitable power source.

```ts
// 'vin' is an input Power object passed as a parameter
// U1 is a component within your design that needs power

typecad.net(vin.power, U1.VCC);
typecad.net(vin.gnd, U1.GND);
```

When `direction` is `'input'`, the `power` pin is set to `power_in` and the `gnd` pin is also set to `power_in`.

### Voltage checks
A package can check that the voltage levels coming in are correct as well.

```ts
if (vin.voltage != 3.3) {
    throw new Error('Voltage must be 3.3v');
}
```