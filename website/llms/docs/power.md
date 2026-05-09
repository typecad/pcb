# Power
A `Power` object is extra information that is used for:
- ERC: by setting `Pin` types to `power_out` or `power_in`
- voltage compatibility checks

Another thing that is important to know is that `Power` is not the equivalent of a power or ground symbol on a schematic. A `Power` object represents a physical set of pins, not an abstract concept of power or ground. 

## Output `Power`

An output `Power` object defines a source of electrical power within your design.

```ts
import { Component, Power } from '@typecad/typecad';

let bt1 = new Component({ footprint: 'Battery:BatteryHolder_Keystone_3008_1x2450' });
// bt1 represents a coin cell battery holder.
// The following Power object defines its output characteristics:
let coin_cell = new Power({
    power: bt1.pin(1), // Pin 1 is the positive terminal
    gnd: bt1.pin(2),   // Pin 2 is the ground terminal
    voltage: 3.7,      // Nominal voltage of 3.7V
    direction: 'output' // Indicates this is a power source
});
```

In this example, `coin_cell` configures `bt1` (a coin cell battery holder) as a power source.
- It specifies `bt1.pin(1)` as the positive terminal and `bt1.pin(2)` as the ground.
- It declares that this source provides a nominal 3.7 volts.
- Because `direction` is set to `output`, typeCAD automatically sets the `type` of `bt1.pin(1)` and `bt1.pin(2)` to `power_out`. This is important for Electrical Rules Checking (ERC).

### Handling `output` and `input` `Power` in Components

Components like voltage regulators often have both power inputs and outputs. For instance, a voltage regulator takes an input voltage and produces a different output voltage.

A common scenario is when the input and output sides of such a component share the same ground pin. If you define separate `Power` objects for the input and output, and both reference the same physical pin as ground, this can lead to ERC conflicts because a pin would be assigned as `power_out` (from the output `Power` object) and potentially `power_in` or another type (from the input `Power` object).

To avoid such ERC errors for a shared ground pin, you can manually set the pin's type to `passive` after the `Power` objects have been defined:

```ts
// Assuming U1 is a voltage regulator component
// and U1.pin(2) is the shared ground pin.

let vin = new Power({ power: U1.pin(1), gnd: U1.pin(2), voltage: 5, direction: 'input' });
let vout = new Power({ power: U1.pin(3), gnd: U1.pin(2), voltage: 3.3, direction: 'output' });

// Manually set the shared ground pin to passive to avoid ERC conflicts
U1.pin(2).type = 'passive';
```

This tells typeCAD that the pin is a common connection point not actively sourcing or sinking power in a way that conflicts with its dual role.

## Input `Power`

Just as components can source power, they often need to receive it. An input `Power` object is used to specify the power requirements for a component or a part of your circuit.

When creating reusable typeCAD packages (e.g., a module for a specific sensor that requires power), you can define a constructor parameter for a `Power` object. This allows users of your package to easily connect a suitable power source.

Inside your package's code, you can then use the properties of this input `Power` object to make connections. For example, if `vin` is an input `Power` object passed to your component, and `U1` is an internal part that needs power:

```ts
// Assuming 'vin' is a Power object passed as a parameter (direction: 'input')
// and U1 is a component within your design that needs power.

// Connect the power line from the input Power object to U1's VCC pin
typecad.net(vin.power, U1.VCC);

// Connect the ground line from the input Power object to U1's GND pin
typecad.net(vin.gnd, U1.GND);
```

By using `vin.power` and `vin.gnd`, you are connecting to the pins that were defined when the input `Power` object (`vin`) was created. This ensures that your component correctly receives power according to its design.

If `direction` is set to `input`, typeCAD will automatically set the `type` of the associated pins to `power_in` for ERC purposes.

### Voltage checks
A package can check that the voltage levels coming in are correct as well. 

```ts
if (vin.voltage != 3.3) {
    throw new Error('Voltage must be 3.3v');
}
```

       Connections