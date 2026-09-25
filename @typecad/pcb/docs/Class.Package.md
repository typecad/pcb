[**@typecad/pcb**](README.md)

***

[@typecad/pcb](globals.md) / Package

# Abstract Class: Package\<TOptions\>

Defined in: [@typecad/pcb/src/package.ts:62](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/package.ts#L62)

### Package

Abstract base class for TypeCAD hardware packages.

A Package is a self-contained module that wraps one or more components,
manages their passive components, connects power, peripherals, and routing,
and groups them on the PCB.

#### Usage
```typescript
export class rd_isl9120ir extends Package<{ inputPower?: Power }> {
    regulator: ISL9120IRTNZ;
    inputCap: Component;

    build(options) {
        this.regulator = new ISL9120IRTNZ(this.reference);
        this.regulator.pcb = { x: 150.6, y: 97.725, rotation: 0 };

        this.inputCap = new this.passives.Capacitor({ value: '22 uF' });
        this.inputCap.pcb = { x: 153.67, y: 99.047, rotation: -90 };

        this.net(this.regulator.VIN_1, this.inputCap.pin(2));
    }
}
```

All `Component` properties set on `this` inside `build()` are automatically
collected — no `this.components.push(...)` required.

For tracks, use `this.add(this.track().from(...).to(...))` since track chains
are not stored as named properties.

## Type Parameters

### TOptions

`TOptions` *extends* `object` = \{ \}

## Constructors

### Constructor

> **new Package**\<`TOptions`\>(`options`): `Package`\<`TOptions`\>

Defined in: [@typecad/pcb/src/package.ts:79](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/package.ts#L79)

#### Parameters

##### options

[`PackageOptions`](Interface.PackageOptions.md) & `TOptions`

#### Returns

`Package`\<`TOptions`\>

## Properties

### components

> `readonly` **components**: ([`Component`](Class.Component.md) \| [`TrackBuilder`](Class.TrackBuilder.md))[] = `[]`

Defined in: [@typecad/pcb/src/package.ts:77](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/package.ts#L77)

All PCB elements belonging to this package (components + track builders).
Populated automatically after `build()` via property reflection.
Use `this.add()` for tracks or any element not stored as a named property.

***

### passives

> `protected` `readonly` **passives**: [`PassiveFactory`](TypeAlias.PassiveFactory.md)

Defined in: [@typecad/pcb/src/package.ts:67](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/package.ts#L67)

The passive component factory (default: 0603).

***

### pcb

> `protected` `readonly` **pcb**: [`PCB`](Class.PCB.md)

Defined in: [@typecad/pcb/src/package.ts:64](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/package.ts#L64)

The PCB instance this package is placed on.

***

### reference

> `protected` `readonly` **reference**: `string` \| `undefined`

Defined in: [@typecad/pcb/src/package.ts:70](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/package.ts#L70)

Optional reference designator prefix for the main IC (e.g. 'U2').

## Methods

### add()

> `protected` **add**(...`items`): `void`

Defined in: [@typecad/pcb/src/package.ts:138](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/package.ts#L138)

Manually register one or more components or track builders.
Use this for tracks (which are not stored as named properties)
or for components inside arrays.

#### Parameters

##### items

...([`Component`](Class.Component.md) \| [`TrackBuilder`](Class.TrackBuilder.md))[]

#### Returns

`void`

***

### build()

> `abstract` `protected` **build**(`options`): `void`

Defined in: [@typecad/pcb/src/package.ts:102](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/package.ts#L102)

Implement all component creation, net connections, and routing here.
All Component properties assigned to `this` are automatically collected.

#### Parameters

##### options

[`PackageOptions`](Interface.PackageOptions.md) & `TOptions`

#### Returns

`void`

***

### net()

> `protected` **net**(...`pins`): `void`

Defined in: [@typecad/pcb/src/package.ts:108](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/package.ts#L108)

Connect one or more pins to the same net.
Shorthand for `this.pcb.net(...)`.

#### Parameters

##### pins

...[`Pin`](Class.Pin.md)[]

#### Returns

`void`

***

### track()

> `protected` **track**(): [`TrackBuilder`](Class.TrackBuilder.md)

Defined in: [@typecad/pcb/src/package.ts:129](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/package.ts#L129)

Start a track chain. Use `this.add()` to register the completed track.

Example:
```typescript
this.add(this.track().from({ x: 152.05, y: 96.87 }).to({ x: 152.4, y: 96.52, layer: 'F.Cu', width: 0.2 }));
```

#### Returns

[`TrackBuilder`](Class.TrackBuilder.md)

***

### via()

> `protected` **via**(`at`, `size?`, `drill?`): [`Component`](Class.Component.md)

Defined in: [@typecad/pcb/src/package.ts:115](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/package.ts#L115)

Place a PCB via and automatically register it in `components`.

#### Parameters

##### at

###### x

`number`

###### y

`number`

##### size?

`number` = `0.6`

##### drill?

`number` = `0.3`

#### Returns

[`Component`](Class.Component.md)
