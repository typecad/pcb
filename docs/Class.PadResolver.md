[**@typecad/pcb**](README.md)

***

[@typecad/pcb](globals.md) / PadResolver

# Class: PadResolver

Defined in: [@typecad/pcb/src/routing/shared/pad\_resolver.ts:49](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/pad_resolver.ts#L49)

Resolves pin objects to their physical pad positions on the PCB.
Handles coordinate transformation from footprint-relative to board-absolute coordinates.

## Constructors

### Constructor

> **new PadResolver**(): `PadResolver`

#### Returns

`PadResolver`

## Methods

### clearParseCache()

> `static` **clearParseCache**(): `void`

Defined in: [@typecad/pcb/src/routing/shared/pad\_resolver.ts:65](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/pad_resolver.ts#L65)

#### Returns

`void`

***

### getAllPadGeometries()

> `static` **getAllPadGeometries**(`component`): [`IPadGeometry`](Interface.IPadGeometry.md)[]

Defined in: [@typecad/pcb/src/routing/shared/pad\_resolver.ts:345](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/pad_resolver.ts#L345)

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

> `static` **getPadCenter**(`pin`): \{ `layer`: `string`; `x`: `number`; `y`: `number`; \} \| `null`

Defined in: [@typecad/pcb/src/routing/shared/pad\_resolver.ts:82](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/pad_resolver.ts#L82)

Get the absolute center position of a pin's pad on the PCB.

#### Parameters

##### pin

[`Pin`](Class.Pin.md)

The pin to resolve

#### Returns

\{ `layer`: `string`; `x`: `number`; `y`: `number`; \} \| `null`

The absolute X,Y coordinates in mm, or null if unable to resolve

#### Example

```ts
const center = PadResolver.getPadCenter(resistor.pin(1));
if (center) {
  console.log(`Pad is at ${center.x}, ${center.y}`);
}
```

***

### getPadGeometry()

> `static` **getPadGeometry**(`component`, `pinNumber`): [`IPadGeometry`](Interface.IPadGeometry.md) \| `null`

Defined in: [@typecad/pcb/src/routing/shared/pad\_resolver.ts:115](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/pad_resolver.ts#L115)

Get complete geometry information for a specific pad.

#### Parameters

##### component

[`Component`](Class.Component.md)

The component containing the pad

##### pinNumber

`string` \| `number`

The pin/pad number to look up

#### Returns

[`IPadGeometry`](Interface.IPadGeometry.md) \| `null`

Complete pad geometry, or null if not found

#### Example

```ts
const padGeom = PadResolver.getPadGeometry(resistor, 1);
if (padGeom) {
  console.log(`Pad shape: ${padGeom.shape}, size: ${padGeom.size.width}x${padGeom.size.height}mm`);
}
```
