[**@typecad/typecad**](README.md)

***

[@typecad/typecad](globals.md) / PadResolver

# Class: PadResolver

Defined in: [routing/shared/pad\_resolver.ts:47](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/routing/shared/pad_resolver.ts#L47)

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

Defined in: [routing/shared/pad\_resolver.ts:339](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/routing/shared/pad_resolver.ts#L339)

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

> `static` **getPadCenter**(`pin`): `null` \| \{ `layer`: `string`; `x`: `number`; `y`: `number`; \}

Defined in: [routing/shared/pad\_resolver.ts:62](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/routing/shared/pad_resolver.ts#L62)

Get the absolute center position of a pin's pad on the PCB.

#### Parameters

##### pin

[`Pin`](Class.Pin.md)

The pin to resolve

#### Returns

`null` \| \{ `layer`: `string`; `x`: `number`; `y`: `number`; \}

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

> `static` **getPadGeometry**(`component`, `pinNumber`): `null` \| [`IPadGeometry`](Interface.IPadGeometry.md)

Defined in: [routing/shared/pad\_resolver.ts:95](https://github.com/typecad/typecad/blob/12a6d1639e8fbe269a2e7ccf4d2a507400fe5211/routing/shared/pad_resolver.ts#L95)

Get complete geometry information for a specific pad.

#### Parameters

##### component

[`Component`](Class.Component.md)

The component containing the pad

##### pinNumber

The pin/pad number to look up

`string` | `number`

#### Returns

`null` \| [`IPadGeometry`](Interface.IPadGeometry.md)

Complete pad geometry, or null if not found

#### Example

```ts
const padGeom = PadResolver.getPadGeometry(resistor, 1);
if (padGeom) {
  console.log(`Pad shape: ${padGeom.shape}, size: ${padGeom.size.width}x${padGeom.size.height}mm`);
}
```
