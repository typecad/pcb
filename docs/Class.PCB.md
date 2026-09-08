[**@typecad/pcb**](README.md)

***

[@typecad/pcb](globals.md) / PCB

# Class: PCB

Defined in: [@typecad/pcb/src/pcb/pcb.ts:119](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L119)

Represents a printed circuit board (PCB).

## Implements

- `IPcbBoardContext`

## Constructors

### Constructor

> **new PCB**(`Boardname`, `options?`): `PCB`

Defined in: [@typecad/pcb/src/pcb/pcb.ts:135](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L135)

Initializes a new PCB.

#### Parameters

##### Boardname

`string`

Name and filename of generated files.

##### options?

`IPcbOptions`

#### Returns

`PCB`

## Properties

### Boardname

> **Boardname**: `string`

Defined in: [@typecad/pcb/src/pcb/pcb.ts:120](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L120)

#### Implementation of

`IPcbBoardContext.Boardname`

***

### copper\_thickness

> **copper\_thickness**: `number`

Defined in: [@typecad/pcb/src/pcb/pcb.ts:123](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L123)

#### Implementation of

`IPcbBoardContext.copper_thickness`

***

### outlines

> **outlines**: `IOutline`[] = `[]`

Defined in: [@typecad/pcb/src/pcb/pcb.ts:124](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L124)

#### Implementation of

`IPcbBoardContext.outlines`

***

### Schematic

> **Schematic**: [`Schematic`](Class.Schematic.md)

Defined in: [@typecad/pcb/src/pcb/pcb.ts:121](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L121)

#### Implementation of

`IPcbBoardContext.Schematic`

***

### state

> `readonly` **state**: `PcbInternalState`

Defined in: [@typecad/pcb/src/pcb/pcb.ts:128](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L128)

**`Internal`**

Mutable state capsule shared with extracted sub-modules.

#### Implementation of

`IPcbBoardContext.state`

***

### thickness

> **thickness**: `number`

Defined in: [@typecad/pcb/src/pcb/pcb.ts:122](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L122)

***

### tracks

> **tracks**: `IOutline`[] = `[]`

Defined in: [@typecad/pcb/src/pcb/pcb.ts:125](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L125)

#### Implementation of

`IPcbBoardContext.tracks`

## Accessors

### components

#### Get Signature

> **get** **components**(): [`Component`](Class.Component.md)[]

Defined in: [@typecad/pcb/src/pcb/pcb.ts:240](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L240)

##### Returns

[`Component`](Class.Component.md)[]

#### Implementation of

`IPcbBoardContext.components`

***

### currentOffset

#### Get Signature

> **get** **currentOffset**(): `object`

Defined in: [@typecad/pcb/src/pcb/pcb.ts:164](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L164)

##### Returns

`object`

###### x

> **x**: `number`

###### y

> **y**: `number`

***

### existingBoardElements

#### Get Signature

> **get** **existingBoardElements**(): `SExpr`[]

Defined in: [@typecad/pcb/src/pcb/pcb.ts:263](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L263)

##### Returns

`SExpr`[]

#### Implementation of

`IPcbBoardContext.existingBoardElements`

***

### grCircles

#### Get Signature

> **get** **grCircles**(): `IGrCircle`[]

Defined in: [@typecad/pcb/src/pcb/pcb.ts:212](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L212)

##### Returns

`IGrCircle`[]

#### Implementation of

`IPcbBoardContext.grCircles`

***

### grLines

#### Get Signature

> **get** **grLines**(): `IGrLine`[]

Defined in: [@typecad/pcb/src/pcb/pcb.ts:208](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L208)

##### Returns

`IGrLine`[]

#### Implementation of

`IPcbBoardContext.grLines`

***

### groups

#### Get Signature

> **get** **groups**(): `string`[]

Defined in: [@typecad/pcb/src/pcb/pcb.ts:248](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L248)

##### Returns

`string`[]

#### Implementation of

`IPcbBoardContext.groups`

***

### groupsAsMap

#### Get Signature

> **get** **groupsAsMap**(): `Map`\<`string`, `string`\>

Defined in: [@typecad/pcb/src/pcb/pcb.ts:252](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L252)

##### Returns

`Map`\<`string`, `string`\>

***

### grPolys

#### Get Signature

> **get** **grPolys**(): `IGrPoly`[]

Defined in: [@typecad/pcb/src/pcb/pcb.ts:220](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L220)

##### Returns

`IGrPoly`[]

#### Implementation of

`IPcbBoardContext.grPolys`

***

### grRects

#### Get Signature

> **get** **grRects**(): `IGrRect`[]

Defined in: [@typecad/pcb/src/pcb/pcb.ts:216](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L216)

##### Returns

`IGrRect`[]

#### Implementation of

`IPcbBoardContext.grRects`

***

### grTexts

#### Get Signature

> **get** **grTexts**(): `IGrTextOptions`[]

Defined in: [@typecad/pcb/src/pcb/pcb.ts:267](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L267)

##### Returns

`IGrTextOptions`[]

#### Implementation of

`IPcbBoardContext.grTexts`

***

### keepoutZones

#### Get Signature

> **get** **keepoutZones**(): `IKeepoutZone`[]

Defined in: [@typecad/pcb/src/pcb/pcb.ts:236](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L236)

##### Returns

`IKeepoutZone`[]

#### Implementation of

`IPcbBoardContext.keepoutZones`

***

### option

#### Get Signature

> **get** **option**(): `IPcbOptions`

Defined in: [@typecad/pcb/src/pcb/pcb.ts:204](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L204)

Getter for PCB options.

##### Returns

`IPcbOptions`

***

### options

#### Get Signature

> **get** **options**(): `IPcbOptions`

Defined in: [@typecad/pcb/src/pcb/pcb.ts:279](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L279)

##### Returns

`IPcbOptions`

#### Implementation of

`IPcbBoardContext.options`

***

### outlines\_public

#### Get Signature

> **get** **outlines\_public**(): `IOutline`[]

Defined in: [@typecad/pcb/src/pcb/pcb.ts:275](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L275)

##### Returns

`IOutline`[]

#### Implementation of

`IPcbBoardContext.outlines_public`

***

### pcb

#### Get Signature

> **get** **pcb**(): `string`

Defined in: [@typecad/pcb/src/pcb/pcb.ts:271](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L271)

##### Returns

`string`

#### Implementation of

`IPcbBoardContext.pcb`

***

### stagedComponents

#### Get Signature

> **get** **stagedComponents**(): [`Component`](Class.Component.md)[]

Defined in: [@typecad/pcb/src/pcb/pcb.ts:244](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L244)

##### Returns

[`Component`](Class.Component.md)[]

#### Implementation of

`IPcbBoardContext.stagedComponents`

***

### stagedOutlines

#### Get Signature

> **get** **stagedOutlines**(): `IOutline`[]

Defined in: [@typecad/pcb/src/pcb/pcb.ts:224](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L224)

##### Returns

`IOutline`[]

#### Set Signature

> **set** **stagedOutlines**(`val`): `void`

Defined in: [@typecad/pcb/src/pcb/pcb.ts:228](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L228)

##### Parameters

###### val

`IOutline`[]

##### Returns

`void`

#### Implementation of

`IPcbBoardContext.stagedOutlines`

***

### zones

#### Get Signature

> **get** **zones**(): `IFilledZone`[]

Defined in: [@typecad/pcb/src/pcb/pcb.ts:232](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L232)

##### Returns

`IFilledZone`[]

#### Implementation of

`IPcbBoardContext.zones`

## Methods

### \_getTrackData()

> **\_getTrackData**(`uuid`): `IGrLine` \| `null`

Defined in: [@typecad/pcb/src/pcb/pcb.ts:908](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L908)

#### Parameters

##### uuid

`string`

#### Returns

`IGrLine` \| `null`

#### Implementation of

`IPcbBoardContext._getTrackData`

***

### \_track()

> **\_track**(`start`, `end`, `width?`, `layer?`, `locked?`, `uuid?`, `net?`): `string`

Defined in: [@typecad/pcb/src/pcb/pcb.ts:614](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L614)

#### Parameters

##### start

###### x

`number`

###### y

`number`

##### end

###### x

`number`

###### y

`number`

##### width?

`number` = `0.05`

##### layer?

`string` = `"F.Cu"`

##### locked?

`boolean` = `false`

##### uuid?

`string`

##### net?

`string`

#### Returns

`string`

#### Implementation of

`IPcbBoardContext._track`

***

### add()

> **add**(...`components`): `void`

Defined in: [@typecad/pcb/src/pcb/pcb.ts:902](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L902)

Adds components to the associated schematic.
This is a pass-through to the Schematic.add() method.

#### Parameters

##### components

...[`Component`](Class.Component.md)[]

Components to add to the schematic.

#### Returns

`void`

***

### autorouteBatch()

> **autorouteBatch**(`items`, `batchOptions?`): `Promise`\<\{ `results`: `IAutorouteResult`[]; `rounds`: `number`; `success`: `boolean`; \}\>

Defined in: [@typecad/pcb/src/pcb/pcb.ts:769](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L769)

Batch autorouter orchestrator with simple rip-up-and-retry.
Routes multiple connections together, retrying with different ordering
and relaxed parameters across rounds to negotiate congestion.

#### Parameters

##### items

`object`[]

##### batchOptions?

###### increaseIterationsPerRound?

`number`

###### relaxViaCostPerRound?

`number`

###### reorder?

`"reverse"` \| `"none"` \| `"byDistance"`

###### rounds?

`number`

#### Returns

`Promise`\<\{ `results`: `IAutorouteResult`[]; `rounds`: `number`; `success`: `boolean`; \}\>

***

### bom()

> **bom**(`output_folder?`): `void`

Defined in: [@typecad/pcb/src/pcb/pcb.ts:845](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L845)

Generates a Bill of Materials (BOM) for the associated schematic.
This is a pass-through to the Schematic.bom() method.

#### Parameters

##### output\_folder?

`string`

The folder to output the BOM to.

#### Returns

`void`

***

### circle()

> **circle**(`options`): `void`

Defined in: [@typecad/pcb/src/pcb/pcb.ts:536](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L536)

Creates a graphical circle on the board.
For full documentation and examples, see pcbCircle in `pcb_graphics.ts`.

#### Parameters

##### options

###### center

\{ `x`: `number`; `y`: `number`; \}

###### center.x

`number`

###### center.y

`number`

###### end?

\{ `x`: `number`; `y`: `number`; \}

###### end.x

`number`

###### end.y

`number`

###### fill?

`boolean`

###### layer?

`string`

###### locked?

`boolean`

###### radius?

`number`

###### width?

`number`

#### Returns

`void`

***

### contract()

> **contract**(`options?`): `void`

Defined in: [@typecad/pcb/src/pcb/pcb.ts:892](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L892)

Exports a hardware contract JSON file describing which MCU pins are wired
in the circuit. The firmware toolchain (TypeHAL) consumes this contract to
generate a board wrapper that only exposes connected pins and peripherals.

Requires `mcuReference` in options to identify the target MCU.

#### Parameters

##### options?

[`ContractOptions`](Interface.ContractOptions.md)

Contract generation options. `mcuReference` is required.

#### Returns

`void`

#### Example

```ts
// Identify MCU by reference designator:
pcb.contract({ mcuReference: 'U1' });

// With custom output path:
pcb.contract({ mcuReference: 'U1', outputPath: '../fw/contract.json' });
```

***

### create()

> **create**(...`items`): `Promise`\<`void`\>

Defined in: [@typecad/pcb/src/pcb/pcb.ts:361](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L361)

#### Parameters

##### items

...([`Component`](Class.Component.md) \| [`TrackBuilder`](Class.TrackBuilder.md) \| ([`Component`](Class.Component.md) \| [`TrackBuilder`](Class.TrackBuilder.md))[])[]

#### Returns

`Promise`\<`void`\>

***

### createRouter()

> **createRouter**(`name`, `grid`, `options`): `IRouterContext`

Defined in: [@typecad/pcb/src/pcb/pcb.ts:189](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L189)

#### Parameters

##### name

`string`

##### grid

[`RoutingGrid`](Class.RoutingGrid.md)

##### options

`unknown`

#### Returns

`IRouterContext`

***

### getCallSite()

> **getCallSite**(): \{ `column`: `number`; `file`: `string`; `line`: `number`; \} \| `undefined`

Defined in: [@typecad/pcb/src/pcb/pcb.ts:374](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L374)

#### Returns

\{ `column`: `number`; `file`: `string`; `line`: `number`; \} \| `undefined`

#### Implementation of

`IPcbBoardContext.getCallSite`

***

### getRegisteredRouters()

> **getRegisteredRouters**(): `string`[]

Defined in: [@typecad/pcb/src/pcb/pcb.ts:197](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L197)

#### Returns

`string`[]

***

### getRouterGridConfigurator()

> **getRouterGridConfigurator**(`name`): `RouterGridConfigurator` \| `undefined`

Defined in: [@typecad/pcb/src/pcb/pcb.ts:193](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L193)

#### Parameters

##### name

`string`

#### Returns

`RouterGridConfigurator` \| `undefined`

***

### group()

> **group**(`group_name`, ...`items`): `void`

Defined in: [@typecad/pcb/src/pcb/pcb.ts:325](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L325)

Groups components and/or elements from a TrackBuilder together on the board.

#### Parameters

##### group\_name

`string`

Name of the group.

##### items

...([`Component`](Class.Component.md) \| [`TrackBuilder`](Class.TrackBuilder.md))[]

A list of Component instances or TrackBuilder instances.

#### Returns

`void`

***

### keepout()

> **keepout**(`options`): `void`

Defined in: [@typecad/pcb/src/pcb/pcb.ts:475](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L475)

Creates a keepout zone that restricts routing and placement.
For full documentation and examples, see [keepout](#keepout) in `pcb_zones.ts`.

#### Parameters

##### options

###### hatchPitch?

`number`

###### hatchStyle?

`"edge"` \| `"none"` \| `"full"`

###### height

`number`

###### layers

`string`[]

###### locked?

`boolean`

###### name?

`string`

###### priority?

`number`

###### restrictions?

\{ `copperpour?`: `boolean`; `footprints?`: `boolean`; `pads?`: `boolean`; `tracks?`: `boolean`; `vias?`: `boolean`; \}

###### restrictions.copperpour?

`boolean`

###### restrictions.footprints?

`boolean`

###### restrictions.pads?

`boolean`

###### restrictions.tracks?

`boolean`

###### restrictions.vias?

`boolean`

###### smoothing?

`"none"` \| `"chamfer"` \| `"fillet"`

###### smoothingRadius?

`number`

###### width

`number`

###### x

`number`

###### y

`number`

#### Returns

`void`

***

### line()

> **line**(`options`): `void`

Defined in: [@typecad/pcb/src/pcb/pcb.ts:517](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L517)

Creates a graphical line on the board.
For full documentation and examples, see pcbLine in `pcb_graphics.ts`.

#### Parameters

##### options

###### end

\{ `x`: `number`; `y`: `number`; \}

###### end.x

`number`

###### end.y

`number`

###### layer?

`string`

###### locked?

`boolean`

###### start

\{ `x`: `number`; `y`: `number`; \}

###### start.x

`number`

###### start.y

`number`

###### width?

`number`

#### Returns

`void`

***

### named()

> **named**(`name`): `this`

Defined in: [@typecad/pcb/src/pcb/pcb.ts:834](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L834)

Sets a name for a net in the associated schematic.
This is a pass-through to the Schematic.named() method.

#### Parameters

##### name

`string`

The name to set for the net.

#### Returns

`this`

The PCB instance for chaining.

***

### net()

> **net**(...`pins`): `ISchematicNetDefinition`

Defined in: [@typecad/pcb/src/pcb/pcb.ts:824](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L824)

Connects a group of pins together in the associated schematic.
Returns a description of the resulting net so it can be reused later.

#### Parameters

##### pins

...[`Pin`](Class.Pin.md)[]

Pins to connect in the net.

#### Returns

`ISchematicNetDefinition`

***

### outline()

> **outline**(`x`, `y`, `width`, `height`, `filletRadius?`, `conceptualUuidFromUser?`): `void`

Defined in: [@typecad/pcb/src/pcb/pcb.ts:610](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L610)

Creates a rectangular outline on the Edge.Cuts layer.

#### Parameters

##### x

`number`

The x-coordinate of the rectangle's start point.

##### y

`number`

The y-coordinate of the rectangle's start point.

##### width

`number`

The width of the rectangle.

##### height

`number`

The height of the rectangle.

##### filletRadius?

`number` = `0`

The radius for filleted corners (0 for sharp).

##### conceptualUuidFromUser?

`string`

Optional UUID for the conceptual outline.

#### Returns

`void`

***

### place()

> **place**(...`components`): `void`

Defined in: [@typecad/pcb/src/pcb/pcb.ts:308](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L308)

Places components on the board.

#### Parameters

##### components

...[`Component`](Class.Component.md)[]

List of components to place.

#### Returns

`void`

#### Implementation of

`IPcbBoardContext.place`

***

### poly()

> **poly**(`options`): `void`

Defined in: [@typecad/pcb/src/pcb/pcb.ts:587](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L587)

Creates a graphical polygon on the board.
For full documentation and examples, see pcbPoly in `pcb_graphics.ts`.

#### Parameters

##### options

###### fill?

`boolean`

###### layer?

`string`

###### locked?

`boolean`

###### points

`object`[]

###### width?

`number`

#### Returns

`void`

***

### popOffset()

> **popOffset**(): `void`

Defined in: [@typecad/pcb/src/pcb/pcb.ts:155](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L155)

#### Returns

`void`

***

### pushOffset()

> **pushOffset**(`x`, `y`): `void`

Defined in: [@typecad/pcb/src/pcb/pcb.ts:149](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L149)

Pushes a new offset to the stack. All subsequent coordinates will be relative to this offset.

#### Parameters

##### x

`number`

##### y

`number`

#### Returns

`void`

***

### rect()

> **rect**(`options`): `void`

Defined in: [@typecad/pcb/src/pcb/pcb.ts:559](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L559)

Creates a graphical rectangle on the board.
For full documentation and examples, see pcbRect in `pcb_graphics.ts`.

#### Parameters

##### options

###### end?

\{ `x`: `number`; `y`: `number`; \}

###### end.x

`number`

###### end.y

`number`

###### fill?

`boolean`

###### height?

`number`

###### layer?

`string`

###### locked?

`boolean`

###### start?

\{ `x`: `number`; `y`: `number`; \}

###### start.x

`number`

###### start.y

`number`

###### strokeWidth?

`number`

###### width?

`number`

###### x?

`number`

###### y?

`number`

#### Returns

`void`

***

### registerRouter()

> **registerRouter**(`registerFn`): `void`

Defined in: [@typecad/pcb/src/pcb/pcb.ts:174](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L174)

Register a routing algorithm with this PCB instance.

#### Parameters

##### registerFn

(`registry`, `algorithm?`) => `void`

A registerRouter function (e.g., from @typecad-astar)

#### Returns

`void`

***

### resolveNet()

> **resolveNet**(`componentReference`, `pinNumber`, `componentUuid?`, `boardNetNameToCodeMap?`, `fallbackNetName?`): `INetResolution`

Defined in: [@typecad/pcb/src/pcb/pcb.ts:287](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L287)

#### Parameters

##### componentReference

`string`

##### pinNumber

`string`

##### componentUuid?

`string`

##### boardNetNameToCodeMap?

`Map`\<`string`, `number`\>

##### fallbackNetName?

`string`

#### Returns

`INetResolution`

#### Implementation of

`IPcbBoardContext.resolveNet`

***

### route()

#### Call Signature

> **route**(`options`): `Promise`\<`IAutorouteResult`\>

Defined in: [@typecad/pcb/src/pcb/pcb.ts:729](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L729)

Unified routing API.

Overloads:
- Route specific pins: route({ from: U1.pin(1), to: [U2.pin(1)], width: 0.5 })
- Route a named net:   route(netDefinition, { gridResolution: 0.15 })

##### Parameters

###### options

`IAutorouteOptions`

##### Returns

`Promise`\<`IAutorouteResult`\>

##### Implementation of

`IPcbBoardContext.route`

#### Call Signature

> **route**(`netDefinition`, `options?`): `Promise`\<`IAutorouteResult`\>

Defined in: [@typecad/pcb/src/pcb/pcb.ts:730](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L730)

Unified routing API.

Overloads:
- Route specific pins: route({ from: U1.pin(1), to: [U2.pin(1)], width: 0.5 })
- Route a named net:   route(netDefinition, { gridResolution: 0.15 })

##### Parameters

###### netDefinition

`ISchematicNetDefinition`

###### options?

`IAutorouteRouteOptions`

##### Returns

`Promise`\<`IAutorouteResult`\>

##### Implementation of

`IPcbBoardContext.route`

***

### stage()

> **stage**(...`components`): `void`

Defined in: [@typecad/pcb/src/pcb/pcb.ts:314](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L314)

#### Parameters

##### components

...[`Component`](Class.Component.md)[]

#### Returns

`void`

***

### text()

> **text**(`options`): `void`

Defined in: [@typecad/pcb/src/pcb/pcb.ts:344](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L344)

Adds board-level text (gr_text) to the PCB.

#### Parameters

##### options

`IGrTextOptions`

Text options including content, position, layer, and formatting

#### Returns

`void`

#### Example

```ts
pcb.text({
  text: 'TYPECAD 1HZ',
  x: 145.415,
  y: 108.585,
  rotation: 0,
  layer: 'F.SilkS',
  font: 'Super Skinny Pixel Bricks',
  width: 5,
  height: 5
});
```

***

### track()

> **track**(`options?`): [`TrackBuilder`](Class.TrackBuilder.md)

Defined in: [@typecad/pcb/src/pcb/pcb.ts:656](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L656)

Begins a fluent interface for creating connected tracks and vias.

#### Parameters

##### options?

###### deferStaging?

`boolean`

###### locked?

`boolean`

###### net?

`string`

#### Returns

[`TrackBuilder`](Class.TrackBuilder.md)

A TrackBuilder instance.

Example:
```
let power_track_elements = pcb.connect()
 .from({x: 100, y: 100}, "F.Cu", 0.2)
 .to({x: 110, y: 100})
 .via({size: 0.8, drill: 0.4}) // Transitions to B.Cu (or other side of via)
 .to({x: 110, y: 120, layer: "B.Cu"}) // Continues on B.Cu
```

#### Implementation of

`IPcbBoardContext.track`

***

### via()

> **via**(`via?`): [`Component`](Class.Component.md)

Defined in: [@typecad/pcb/src/pcb/pcb.ts:400](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L400)

Handles via-related operations.

#### Parameters

##### via?

`Omit`\<`IVia`, `"uuid"` \| `"netCode"` \| `"layers"`\> = `{}`

The via details.

#### Returns

[`Component`](Class.Component.md)

The component representing the via.

#### Implementation of

`IPcbBoardContext.via`

***

### waitForPendingAutoroutes()

> **waitForPendingAutoroutes**(): `Promise`\<`void`\>

Defined in: [@typecad/pcb/src/pcb/pcb.ts:757](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L757)

#### Returns

`Promise`\<`void`\>

***

### zone()

> **zone**(`options`): `void`

Defined in: [@typecad/pcb/src/pcb/pcb.ts:412](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/pcb/pcb.ts#L412)

Creates a filled zone on copper layers connected to a specific net.
For full documentation and examples, see [zone](#zone) in `pcb_zones.ts`.

#### Parameters

##### options

###### clearance?

`number`

###### connectPads?

`"no"` \| `"full"` \| `"thru_hole_only"`

###### fillArcSegments?

`number`

###### filled?

`boolean`

###### filledAreasThickness?

`boolean`

###### fillMode?

`"solid"` \| `"hatched"`

###### hatchBorderAlgorithm?

`"hatch_thickness"` \| `"min_thickness"`

###### hatchGap?

`number`

###### hatchMinHoleArea?

`number`

###### hatchOrientation?

`number`

###### hatchPitch?

`number`

###### hatchSmoothingLevel?

`number`

###### hatchSmoothingValue?

`number`

###### hatchStyle?

`"edge"` \| `"none"` \| `"full"`

###### hatchThickness?

`number`

###### height

`number`

###### islandAreaMin?

`number`

###### islandRemovalMode?

`number`

###### layers

`string`[]

###### locked?

`boolean`

###### minThickness?

`number`

###### name?

`string`

###### net?

`string`

###### pin?

[`Pin`](Class.Pin.md)

###### priority?

`number`

###### smoothing?

`"none"` \| `"chamfer"` \| `"fillet"`

###### smoothingRadius?

`number`

###### thermalBridgeWidth?

`number`

###### thermalGap?

`number`

###### width

`number`

###### x

`number`

###### y

`number`

#### Returns

`void`
