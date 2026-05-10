[**@typecad/typecad**](README.md)

***

[@typecad/typecad](globals.md) / PadResolver

# Class: PadResolver

Defined in: @typecad/typecad/src/routing/shared/pad\_resolver.ts:48

Resolves pin objects to their physical pad positions on the PCB.
Handles coordinate transformation from footprint-relative to board-absolute coordinates.

## Constructors

### Constructor

> **new PadResolver**(): `PadResolver`

#### Returns

`PadResolver`

## Methods

### getAllPadGeometries()

> `static` **getAllPadGeometries**(`component`): [`IPadGeometry`](Interface.IPadGeometry.md)[]

Defined in: @typecad/typecad/src/routing/shared/pad\_resolver.ts:340

Get all pad geometries for a component.
Useful for obstacle detection and collision checking.

#### Parameters

##### component

[`Component`](Class.Component.md)

The component to get pads from

#### Returns

[`IPadGeometry`](Interface.IPadGeometry.md)[]

Array of pad geometries

***

### getPadCenter()

> `static` **getPadCenter**(`pin`): `object`

Defined in: @typecad/typecad/src/routing/shared/pad\_resolver.ts:63

Get the absolute center position of a pin's pad on the PCB.

#### Parameters

##### pin

[`Pin`](Class.Pin.md)

The pin to resolve

#### Returns

`object`

The absolute X,Y coordinates in mm, or null if unable to resolve

##### layer

> **layer**: `string`

##### x

> **x**: `number`

##### y

> **y**: `number`

#### Example

```ts
const center = PadResolver.getPadCenter(resistor.pin(1));
if (center) {
  console.log(`Pad is at ${center.x}, ${center.y}`);
}
```

***

### getPadGeometry()

> `static` **getPadGeometry**(`component`, `pinNumber`): [`IPadGeometry`](Interface.IPadGeometry.md)

Defined in: @typecad/typecad/src/routing/shared/pad\_resolver.ts:96

Get complete geometry information for a specific pad.

#### Parameters

##### component

[`Component`](Class.Component.md)

The component containing the pad

##### pinNumber

`string` \| `number`

The pin/pad number to look up

#### Returns

[`IPadGeometry`](Interface.IPadGeometry.md)

Complete pad geometry, or null if not found

#### Example

```ts
const padGeom = PadResolver.getPadGeometry(resistor, 1);
if (padGeom) {
  console.log(`Pad shape: ${padGeom.shape}, size: ${padGeom.size.width}x${padGeom.size.height}mm`);
}
```
