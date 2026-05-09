[**@typecad/typecad**](README.md)

***

[@typecad/typecad](globals.md) / PCB

# Class: PCB

Defined in: [pcb/pcb.ts:103](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L103)

Represents a printed circuit board (PCB).

## Constructors

### Constructor

> **new PCB**(`Boardname`, `options?`): `PCB`

Defined in: [pcb/pcb.ts:132](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L132)

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

Defined in: [pcb/pcb.ts:104](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L104)

***

### copper\_thickness

> **copper\_thickness**: `number`

Defined in: [pcb/pcb.ts:107](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L107)

***

### outlines

> **outlines**: `IOutline`[] = `[]`

Defined in: [pcb/pcb.ts:108](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L108)

***

### Schematic

> **Schematic**: [`Schematic`](Class.Schematic.md)

Defined in: [pcb/pcb.ts:105](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L105)

***

### thickness

> **thickness**: `number`

Defined in: [pcb/pcb.ts:106](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L106)

***

### tracks

> **tracks**: `IOutline`[] = `[]`

Defined in: [pcb/pcb.ts:109](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L109)

## Accessors

### components

#### Get Signature

> **get** **components**(): [`Component`](Class.Component.md)[]

Defined in: [pcb/pcb.ts:301](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L301)

Getter for components.

##### Returns

[`Component`](Class.Component.md)[]

***

### existingBoardElements

#### Get Signature

> **get** **existingBoardElements**(): `any`[]

Defined in: [pcb/pcb.ts:338](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L338)

Getter for existing board elements.

##### Returns

`any`[]

***

### grCircles

#### Get Signature

> **get** **grCircles**(): `IGrCircle`[]

Defined in: [pcb/pcb.ts:259](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L259)

Getter for graphics circles (required by PcbGraphicsInstance interface).

##### Returns

`IGrCircle`[]

***

### grLines

#### Get Signature

> **get** **grLines**(): `IGrLine`[]

Defined in: [pcb/pcb.ts:252](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L252)

Getter for graphics lines (required by PcbGraphicsInstance interface).

##### Returns

`IGrLine`[]

***

### groups

#### Get Signature

> **get** **groups**(): `string`[]

Defined in: [pcb/pcb.ts:315](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L315)

Getter for groups.

##### Returns

`string`[]

***

### groupsAsMap

#### Get Signature

> **get** **groupsAsMap**(): `Map`\<`string`, `any`\>

Defined in: [pcb/pcb.ts:322](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L322)

Getter for groups as Map (for footprint functions that expect Map).

##### Returns

`Map`\<`string`, `any`\>

***

### grPolys

#### Get Signature

> **get** **grPolys**(): `IGrPoly`[]

Defined in: [pcb/pcb.ts:273](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L273)

Getter for graphics polygons (required by PcbGraphicsInstance interface).

##### Returns

`IGrPoly`[]

***

### grRects

#### Get Signature

> **get** **grRects**(): `IGrRect`[]

Defined in: [pcb/pcb.ts:266](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L266)

Getter for graphics rectangles (required by PcbGraphicsInstance interface).

##### Returns

`IGrRect`[]

***

### grTexts

#### Get Signature

> **get** **grTexts**(): `IGrTextOptions`[]

Defined in: [pcb/pcb.ts:345](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L345)

Getter for grTexts.

##### Returns

`IGrTextOptions`[]

***

### keepoutZones

#### Get Signature

> **get** **keepoutZones**(): `IKeepoutZone`[]

Defined in: [pcb/pcb.ts:294](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L294)

Getter for keepout zones.

##### Returns

`IKeepoutZone`[]

***

### option

#### Get Signature

> **get** **option**(): `IPcbOptions`

Defined in: [pcb/pcb.ts:245](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L245)

Getter for PCB options.

##### Returns

`IPcbOptions`

***

### options

#### Get Signature

> **get** **options**(): `IPcbOptions`

Defined in: [pcb/pcb.ts:367](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L367)

Getter for options.

##### Returns

`IPcbOptions`

***

### outlines\_public

#### Get Signature

> **get** **outlines\_public**(): `IOutline`[]

Defined in: [pcb/pcb.ts:360](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L360)

Getter for outlines_public.

##### Returns

`IOutline`[]

***

### pcb

#### Get Signature

> **get** **pcb**(): `string`

Defined in: [pcb/pcb.ts:353](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L353)

Getter for pcb string.

##### Returns

`string`

***

### stagedComponents

#### Get Signature

> **get** **stagedComponents**(): [`Component`](Class.Component.md)[]

Defined in: [pcb/pcb.ts:308](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L308)

Getter for staged components.

##### Returns

[`Component`](Class.Component.md)[]

***

### stagedOutlines

#### Get Signature

> **get** **stagedOutlines**(): `IOutline`[]

Defined in: [pcb/pcb.ts:280](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L280)

Getter for staged outlines (required by PcbGraphicsInstance interface).

##### Returns

`IOutline`[]

***

### zones

#### Get Signature

> **get** **zones**(): `IFilledZone`[]

Defined in: [pcb/pcb.ts:287](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L287)

Getter for filled zones.

##### Returns

`IFilledZone`[]

## Methods

### \_addComponentToBoardPublic()

> **\_addComponentToBoardPublic**(`component`): `void`

Defined in: [pcb/pcb.ts:508](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L508)

**`Internal`**

Public accessor for addComponentToBoard functionality.
Used by extracted modules to add components to the board.

#### Parameters

##### component

[`Component`](Class.Component.md)

Component to add to the board.

#### Returns

`void`

***

### \_clearComponents()

> **\_clearComponents**(): `void`

Defined in: [pcb/pcb.ts:550](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L550)

**`Internal`**

Public method to clear components.
Used by extracted modules to reset components during board creation.

#### Returns

`void`

***

### \_clearGroups()

> **\_clearGroups**(): `void`

Defined in: [pcb/pcb.ts:568](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L568)

**`Internal`**

Public method to clear groups.
Used by extracted modules to reset groups during board creation.

#### Returns

`void`

***

### \_clearOutlines()

> **\_clearOutlines**(): `void`

Defined in: [pcb/pcb.ts:559](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L559)

**`Internal`**

Public method to clear outlines.
Used by extracted modules to reset outlines during board creation.

#### Returns

`void`

***

### \_createFootprintNodePublic()

> **\_createFootprintNodePublic**(`component`, `boardNetNameToCodeMap?`): `any`[]

Defined in: [pcb/pcb.ts:532](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L532)

**`Internal`**

Public accessor for createFootprintNode functionality.
Used by extracted modules to create footprint nodes.

#### Parameters

##### component

[`Component`](Class.Component.md)

##### boardNetNameToCodeMap?

`Map`\<`string`, `number`\>

#### Returns

`any`[]

***

### \_getComponents()

> **\_getComponents**(): [`Component`](Class.Component.md)[]

Defined in: [pcb/pcb.ts:2928](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L2928)

**`Internal`**

Get active components on the PCB.
 Used by ObstacleBuilder to include components as obstacles.

#### Returns

[`Component`](Class.Component.md)[]

***

### \_getKeepoutZones()

> **\_getKeepoutZones**(): `IKeepoutZone`[]

Defined in: [pcb/pcb.ts:2920](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L2920)

**`Internal`**

Get keepout zones for obstacle detection during autorouting.
 Used by ObstacleBuilder to include keepout areas in the routing grid.

#### Returns

`IKeepoutZone`[]

***

### \_getStagedComponents()

> **\_getStagedComponents**(): [`Component`](Class.Component.md)[]

Defined in: [pcb/pcb.ts:2936](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L2936)

**`Internal`**

Get staged components (placed but not yet created).
 Used by ObstacleBuilder to include staged components as obstacles.

#### Returns

[`Component`](Class.Component.md)[]

***

### \_getStagedOutlines()

> **\_getStagedOutlines**(): `IOutline`[]

Defined in: [pcb/pcb.ts:2912](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L2912)

**`Internal`**

Get staged outlines for obstacle detection during autorouting.
 Used by ObstacleBuilder to detect tracks from previous autoroute calls.

#### Returns

`IOutline`[]

***

### \_removeStagedOutlinesByUuid()

> **\_removeStagedOutlinesByUuid**(`uuids`): `void`

Defined in: [pcb/pcb.ts:2943](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L2943)

**`Internal`**

Remove staged outlines with specific UUIDs (used when reusing autoroute results in manual routes)

#### Parameters

##### uuids

`string`[]

#### Returns

`void`

***

### \_resolveNetPublic()

> **\_resolveNetPublic**(`componentReference`, `pinNumber`, `componentUuid?`, `boardNetNameToCodeMap?`, `fallbackNetName?`): `INetResolution`

Defined in: [pcb/pcb.ts:517](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L517)

**`Internal`**

Public accessor for resolveNet functionality.
Used by extracted modules to resolve net assignments.

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

***

### \_setPcb()

> **\_setPcb**(`content`): `void`

Defined in: [pcb/pcb.ts:577](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L577)

**`Internal`**

Public method to set PCB content.
Used by extracted modules to set the PCB content.

#### Parameters

##### content

`string`

#### Returns

`void`

***

### \_track()

> **\_track**(`start`, `end`, `width`, `layer`, `locked`, `uuid?`, `net?`): `string`

Defined in: [pcb/pcb.ts:2951](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L2951)

**`Internal`**

Generate a UUID for deferred staging

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

##### width

`number` = `0.05`

##### layer

`string` = `"F.Cu"`

##### locked

`boolean` = `false`

##### uuid?

`string`

##### net?

`string`

#### Returns

`string`

***

### \_updateFootprintNodePublic()

> **\_updateFootprintNodePublic**(`node`, `component`, `boardNetNameToCodeMap?`): `any`[]

Defined in: [pcb/pcb.ts:541](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L541)

**`Internal`**

Public accessor for updateFootprintNode functionality.
Used by extracted modules to update footprint nodes.

#### Parameters

##### node

`any`[]

##### component

[`Component`](Class.Component.md)

##### boardNetNameToCodeMap?

`Map`\<`string`, `number`\>

#### Returns

`any`[]

***

### add()

> **add**(...`components`): `void`

Defined in: [pcb/pcb.ts:3319](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L3319)

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

Defined in: [pcb/pcb.ts:3140](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L3140)

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

Defined in: [pcb/pcb.ts:3298](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L3298)

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

Defined in: [pcb/pcb.ts:2766](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L2766)

Creates a graphical circle on the board.

#### Parameters

##### options

Circle configuration options

###### center

\{ `x`: `number`; `y`: `number`; \}

Center point coordinates {x, y}

###### center.x

`number`

###### center.y

`number`

###### end?

\{ `x`: `number`; `y`: `number`; \}

Radius endpoint coordinates {x, y} (alternative to radius)

###### end.x

`number`

###### end.y

`number`

###### fill?

`boolean`

Fill the circle (default: false)

###### layer?

`string`

Layer name (default: 'F.SilkS')

###### locked?

`boolean`

Lock the circle to prevent editing (default: false)

###### radius?

`number`

Circle radius (alternative to using end point)

###### width?

`number`

Outline width/thickness (default: 0.15mm)

#### Returns

`void`

#### Example

```ts
// Circle with radius
pcb.circle({ center: { x: 50, y: 50 }, radius: 10 });

// Filled circle on copper layer
pcb.circle({
  center: { x: 30, y: 30 },
  radius: 5,
  layer: 'F.Cu',
  width: 0.2,
  fill: true
});

// Circle using endpoint (radius point)
pcb.circle({
  center: { x: 0, y: 0 },
  end: { x: 10, y: 0 },  // Radius = 10
  layer: 'Dwgs.User'
});
```

***

### create()

> **create**(...`items`): `Promise`\<`void`\>

Defined in: [pcb/pcb.ts:2082](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L2082)

Creates and saves the board to a file.

#### Parameters

##### items

...([`Component`](Class.Component.md) \| [`TrackBuilder`](Class.TrackBuilder.md))[]

Components and TrackBuilder instances to add to the board before creating.

#### Returns

`Promise`\<`void`\>

***

### createRouter()

> **createRouter**(`name`, `grid`, `options`): `any`

Defined in: [pcb/pcb.ts:186](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L186)

**`Internal`**

Create a routing engine by name from this PCB instance's registry.

#### Parameters

##### name

`string`

##### grid

[`RoutingGrid`](Class.RoutingGrid.md)

##### options

`unknown`

#### Returns

`any`

***

### erc()

> **erc**(): `void`

Defined in: [pcb/pcb.ts:3308](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L3308)

Performs electrical rule checks on the associated schematic.
This is a pass-through to the Schematic.erc() method.

#### Returns

`void`

***

### getCallSite()

> **getCallSite**(): `undefined` \| \{ `column`: `number`; `file`: `string`; `line`: `number`; \}

Defined in: [pcb/pcb.ts:2086](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L2086)

#### Returns

`undefined` \| \{ `column`: `number`; `file`: `string`; `line`: `number`; \}

***

### getRegisteredRouters()

> **getRegisteredRouters**(): `string`[]

Defined in: [pcb/pcb.ts:206](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L206)

**`Internal`**

Get the list of registered router names from this PCB instance's registry.

#### Returns

`string`[]

***

### getRouterGridConfigurator()

> **getRouterGridConfigurator**(`name`): `undefined` \| (`context`) => `void` \| \{ `gridResolution?`: `number`; `reason?`: `string`; \}

Defined in: [pcb/pcb.ts:198](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L198)

**`Internal`**

Get the grid configuration hook for an algorithm from this PCB instance's registry.

#### Parameters

##### name

`string`

#### Returns

`undefined` \| (`context`) => `void` \| \{ `gridResolution?`: `number`; `reason?`: `string`; \}

***

### group()

> **group**(`group_name`, ...`items`): `void`

Defined in: [pcb/pcb.ts:640](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L640)

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

Defined in: [pcb/pcb.ts:2660](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L2660)

Creates a keepout zone that restricts routing and placement.

#### Parameters

##### options

Keepout zone configuration options

###### hatchPitch?

`number`

Hatch pitch/spacing (default: 0.508mm)

###### hatchStyle?

`"none"` \| `"edge"` \| `"full"`

Hatch style for zone outline: 'none', 'edge' (default), or 'full'

###### height

`number`

The height of the keepout zone

###### layers

`string`[]

Array of layer names (e.g., ['F.Cu', 'B.Cu'])

###### locked?

`boolean`

Lock zone to prevent editing (default: false)

###### name?

`string`

Optional zone name

###### priority?

`number`

Zone priority (default: 0)

###### restrictions?

\{ `copperpour?`: `boolean`; `footprints?`: `boolean`; `pads?`: `boolean`; `tracks?`: `boolean`; `vias?`: `boolean`; \}

Object specifying what to restrict (all default to true)

###### restrictions.copperpour?

`boolean`

Restrict copper pour (default: true)

###### restrictions.footprints?

`boolean`

Restrict footprints (default: true)

###### restrictions.pads?

`boolean`

Restrict pads (default: true)

###### restrictions.tracks?

`boolean`

Restrict tracks (default: true)

###### restrictions.vias?

`boolean`

Restrict vias (default: true)

###### smoothing?

`"none"` \| `"chamfer"` \| `"fillet"`

Corner smoothing: 'chamfer', 'fillet', or 'none' (default)

###### smoothingRadius?

`number`

Radius for corner smoothing (required if smoothing is set)

###### width

`number`

The width of the keepout zone

###### x

`number`

The x-coordinate of the keepout zone's starting corner

###### y

`number`

The y-coordinate of the keepout zone's starting corner

#### Returns

`void`

#### Example

```ts
// ============================================
// BASIC EXAMPLES
// ============================================

// Basic keepout (restricts everything)
pcb.keepout({
  layers: ['F.Cu', 'B.Cu'],
  x: 0, y: 0,
  width: 10, height: 10
});

// ============================================
// CUSTOM RESTRICTIONS
// ============================================

// Restrict only tracks and vias, allow pads
pcb.keepout({
  layers: ['F.Cu'],
  x: 5, y: 5, width: 8, height: 8,
  restrictions: {
    tracks: true,
    vias: true,
    pads: false,
    copperpour: true,
    footprints: false
  }
});

// Restrict only copper pour (allow routing)
pcb.keepout({
  layers: ['F.Cu'],
  x: 10, y: 10, width: 15, height: 15,
  restrictions: {
    tracks: false,
    vias: false,
    pads: false,
    copperpour: true,
    footprints: false
  }
});

// ============================================
// ZONE MANAGEMENT OPTIONS
// ============================================

// Named, locked keepout with priority
pcb.keepout({
  layers: ['F.Cu', 'B.Cu'],
  x: 0, y: 0, width: 20, height: 20,
  name: 'Antenna Keepout',
  locked: true,
  priority: 10
});

// High-priority keepout area
pcb.keepout({
  layers: ['F.Cu'],
  x: 0, y: 0, width: 30, height: 30,
  name: 'Critical Area',
  priority: 100
});

// ============================================
// CORNER SMOOTHING
// ============================================

// Filleted corners
pcb.keepout({
  layers: ['F.Cu'],
  x: 0, y: 0, width: 15, height: 15,
  smoothing: 'fillet',
  smoothingRadius: 0.5,
  name: 'Smooth Keepout'
});

// Chamfered corners
pcb.keepout({
  layers: ['B.Cu'],
  x: 0, y: 0, width: 15, height: 15,
  smoothing: 'chamfer',
  smoothingRadius: 0.3
});

// ============================================
// HATCH DISPLAY SETTINGS
// ============================================

// No hatch display (invisible outline)
pcb.keepout({
  layers: ['F.Cu'],
  x: 0, y: 0, width: 10, height: 10,
  hatchStyle: 'none'
});

// Edge hatch with custom spacing
pcb.keepout({
  layers: ['F.Cu'],
  x: 0, y: 0, width: 10, height: 10,
  hatchStyle: 'edge',
  hatchPitch: 1.0
});

// Full hatch fill
pcb.keepout({
  layers: ['F.Cu'],
  x: 0, y: 0, width: 10, height: 10,
  hatchStyle: 'full',
  hatchPitch: 0.5
});

// ============================================
// COMPREHENSIVE EXAMPLE (all options)
// ============================================

pcb.keepout({
  // Position and layers
  layers: ['F.Cu', 'B.Cu'],
  x: 20, y: 20,
  width: 30, height: 25,

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
});
```

***

### line()

> **line**(`options`): `void`

Defined in: [pcb/pcb.ts:2724](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L2724)

Creates a graphical line on the board.

#### Parameters

##### options

Line configuration options

###### end

\{ `x`: `number`; `y`: `number`; \}

Ending point coordinates {x, y}

###### end.x

`number`

###### end.y

`number`

###### layer?

`string`

Layer name (default: 'F.SilkS')

###### locked?

`boolean`

Lock the line to prevent editing (default: false)

###### start

\{ `x`: `number`; `y`: `number`; \}

Starting point coordinates {x, y}

###### start.x

`number`

###### start.y

`number`

###### width?

`number`

Line width/thickness (default: 0.15mm)

#### Returns

`void`

#### Example

```ts
// Basic line on front silkscreen
pcb.line({ start: { x: 0, y: 0 }, end: { x: 10, y: 10 } });

// Line on edge cuts with custom width
pcb.line({
  start: { x: 0, y: 0 },
  end: { x: 100, y: 0 },
  layer: 'Edge.Cuts',
  width: 0.1
});

// Locked line on user drawings layer
pcb.line({
  start: { x: 20, y: 20 },
  end: { x: 80, y: 80 },
  layer: 'Dwgs.User',
  width: 0.2,
  locked: true
});
```

***

### named()

> **named**(`name`): `this`

Defined in: [pcb/pcb.ts:3287](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L3287)

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

Defined in: [pcb/pcb.ts:3277](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L3277)

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

> **outline**(`x`, `y`, `width`, `height`, `filletRadius`, `conceptualUuidFromUser?`): `void`

Defined in: [pcb/pcb.ts:2904](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L2904)

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

##### filletRadius

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

Defined in: [pcb/pcb.ts:585](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L585)

Places components on the board.

#### Parameters

##### components

...[`Component`](Class.Component.md)[]

List of components to place.

#### Returns

`void`

***

### poly()

> **poly**(`options`): `void`

Defined in: [pcb/pcb.ts:2885](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L2885)

Creates a graphical polygon on the board.

#### Parameters

##### options

Polygon configuration options

###### fill?

`boolean`

Fill the polygon (default: false)

###### layer?

`string`

Layer name (default: 'F.SilkS')

###### locked?

`boolean`

Lock the polygon to prevent editing (default: false)

###### points

`object`[]

Array of vertex coordinates [{x, y}, ...]

###### width?

`number`

Outline width/thickness (default: 0.15mm)

#### Returns

`void`

#### Example

```ts
// Triangle
pcb.poly({
  points: [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 5, y: 10 }
  ]
});

// Filled hexagon on copper layer
pcb.poly({
  points: [
    { x: 50, y: 40 },
    { x: 60, y: 45 },
    { x: 60, y: 55 },
    { x: 50, y: 60 },
    { x: 40, y: 55 },
    { x: 40, y: 45 }
  ],
  layer: 'F.Cu',
  width: 0.2,
  fill: true
});

// Pentagon on user drawings layer
pcb.poly({
  points: [
    { x: 100, y: 90 },
    { x: 110, y: 95 },
    { x: 108, y: 105 },
    { x: 92, y: 105 },
    { x: 90, y: 95 }
  ],
  layer: 'Dwgs.User',
  width: 0.15,
  locked: true
});
```

***

### rect()

> **rect**(`options`): `void`

Defined in: [pcb/pcb.ts:2821](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L2821)

Creates a graphical rectangle on the board.

#### Parameters

##### options

Rectangle configuration options

###### end?

\{ `x`: `number`; `y`: `number`; \}

Bottom-right corner coordinates {x, y} (alternative to width/height)

###### end.x

`number`

###### end.y

`number`

###### fill?

`boolean`

Fill the rectangle (default: false)

###### height?

`number`

Rectangle height (alternative to end)

###### layer?

`string`

Layer name (default: 'F.SilkS')

###### locked?

`boolean`

Lock the rectangle to prevent editing (default: false)

###### start?

\{ `x`: `number`; `y`: `number`; \}

Top-left corner coordinates {x, y} (alternative to x/y)

###### start.x

`number`

###### start.y

`number`

###### strokeWidth?

`number`

Outline width/thickness (default: 0.15mm)

###### width?

`number`

Rectangle width (alternative to end)

###### x?

`number`

X-coordinate of top-left corner (alternative to start)

###### y?

`number`

Y-coordinate of top-left corner (alternative to start)

#### Returns

`void`

#### Example

```ts
// Rectangle using x, y, width, height
pcb.rect({ x: 10, y: 10, width: 30, height: 20 });

// Filled rectangle on copper layer
pcb.rect({
  x: 50, y: 50,
  width: 40, height: 30,
  layer: 'F.Cu',
  strokeWidth: 0.2,
  fill: true
});

// Rectangle using start and end points
pcb.rect({
  start: { x: 0, y: 0 },
  end: { x: 100, y: 80 },
  layer: 'Dwgs.User'
});

// Locked outline rectangle
pcb.rect({
  x: 5, y: 5, width: 90, height: 70,
  layer: 'Edge.Cuts',
  strokeWidth: 0.1,
  locked: true
});
```

***

### registerRouter()

> **registerRouter**(`registerFn`): `void`

Defined in: [pcb/pcb.ts:149](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L149)

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

Defined in: [pcb/pcb.ts:379](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L379)

Public resolveNet method that delegates to the private implementation.
This is needed for the extracted functions that expect a public resolveNet method.

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

***

### route()

#### Call Signature

> **route**(`options`): `Promise`\<`IAutorouteResult`\>

Defined in: [pcb/pcb.ts:3107](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L3107)

Unified routing API.

Overloads:
- Route specific pins: route({ from: U1.pin(1), to: [U2.pin(1)], width: 0.5 })
- Route a named net:   route(netDefinition, { gridResolution: 0.15 })

##### Parameters

###### options

`IAutorouteOptions`

##### Returns

`Promise`\<`IAutorouteResult`\>

#### Call Signature

> **route**(`netDefinition`, `options?`): `Promise`\<`IAutorouteResult`\>

Defined in: [pcb/pcb.ts:3108](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L3108)

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

***

### stage()

> **stage**(...`components`): `void`

Defined in: [pcb/pcb.ts:596](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L596)

Stage components so they're considered for routing/debug before full board creation.

#### Parameters

##### components

...[`Component`](Class.Component.md)[]

Components to stage

#### Returns

`void`

***

### text()

> **text**(`options`): `void`

Defined in: [pcb/pcb.ts:704](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L704)

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

Defined in: [pcb/pcb.ts:2994](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L2994)

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

***

### via()

> **via**(`via`): [`Component`](Class.Component.md)

Defined in: [pcb/pcb.ts:2154](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L2154)

Handles via-related operations.

#### Parameters

##### via

`Omit`\<`IVia`, `"uuid"` \| `"netCode"` \| `"layers"`\> = `{}`

The via details.

#### Returns

[`Component`](Class.Component.md)

The component representing the via.

***

### zone()

> **zone**(`options`): `void`

Defined in: [pcb/pcb.ts:2437](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/pcb/pcb.ts#L2437)

Creates a filled zone on copper layers connected to a specific net.

#### Parameters

##### options

Zone configuration options

###### clearance?

`number`

Clearance from pads (default: 0.2mm)

###### connectPads?

`"full"` \| `"thru_hole_only"` \| `"no"`

Pad connection type (default: thermal relief)

###### fillArcSegments?

`number`

Number of segments for curved fills (default: 16)

###### filled?

`boolean`

Whether zone should be filled (default: true)

###### filledAreasThickness?

`boolean`

Control line width in fill area calculations

###### fillMode?

`"solid"` \| `"hatched"`

Fill mode: 'solid' (default) or 'hatched'

###### hatchBorderAlgorithm?

`"hatch_thickness"` \| `"min_thickness"`

Border algorithm: 'hatch_thickness' or 'min_thickness'

###### hatchGap?

`number`

Gap between hatch lines

###### hatchMinHoleArea?

`number`

Minimum hole area for hatching

###### hatchOrientation?

`number`

Hatch line angle in degrees

###### hatchPitch?

`number`

Hatch pitch/spacing (default: 0.508mm)

###### hatchSmoothingLevel?

`number`

Hatch smoothing level 0-3

###### hatchSmoothingValue?

`number`

Hatch smoothing value

###### hatchStyle?

`"none"` \| `"edge"` \| `"full"`

Hatch style for zone outline: 'none', 'edge' (default), or 'full'

###### hatchThickness?

`number`

Line thickness for hatched fills

###### height

`number`

The height of the zone

###### islandAreaMin?

`number`

Minimum island area (required if islandRemovalMode is 2)

###### islandRemovalMode?

`number`

Island removal: 0 (always), 1 (never), 2 (below min area)

###### layers

`string`[]

Array of layer names (e.g., ['F.Cu', 'B.Cu'])

###### locked?

`boolean`

Lock zone to prevent editing (default: false)

###### minThickness?

`number`

Minimum thickness (default: 0.1778mm)

###### name?

`string`

Optional zone name

###### net?

`string`

The net name to connect this zone to (e.g., 'GND', 'VCC'). Use either pin or net, not both.

###### pin?

`any`

The pin object to connect this zone to (determines the net). Use either pin or net, not both.

###### priority?

`number`

Zone priority (default: 0)

###### smoothing?

`"none"` \| `"chamfer"` \| `"fillet"`

Corner smoothing: 'chamfer', 'fillet', or 'none' (default)

###### smoothingRadius?

`number`

Radius for corner smoothing (required if smoothing is set)

###### thermalBridgeWidth?

`number`

Thermal bridge width (default: 0.4064mm)

###### thermalGap?

`number`

Thermal relief gap (default: 0.254mm)

###### width

`number`

The width of the zone

###### x

`number`

The x-coordinate of the zone's starting corner

###### y

`number`

The y-coordinate of the zone's starting corner

#### Returns

`void`

#### Example

```ts
// ============================================
// BASIC EXAMPLES
// ============================================

// Basic GND zone (minimal parameters)
pcb.zone({
  net: 'GND',
  layers: ['F.Cu', 'B.Cu'],
  x: 0, y: 0,
  width: 50, height: 40
});

// Using pin instead of net name
pcb.zone({
  pin: U4.pin(10),
  layers: ['F.Cu'],
  x: 10, y: 10,
  width: 20, height: 20
});

// ============================================
// ZONE MANAGEMENT OPTIONS
// ============================================

// Named, locked zone with priority
pcb.zone({
  net: 'VCC',
  layers: ['F.Cu'],
  x: 0, y: 0, width: 30, height: 30,
  name: 'Power Zone',
  locked: true,
  priority: 10
});

// ============================================
// FILL SETTINGS
// ============================================

// Solid fill with custom thermal relief
pcb.zone({
  net: 'GND',
  layers: ['F.Cu', 'B.Cu'],
  x: 0, y: 0, width: 50, height: 50,
  fillMode: 'solid',
  filled: true,
  thermalGap: 0.3,
  thermalBridgeWidth: 0.5,
  fillArcSegments: 32
});

// Hatched fill with full customization
pcb.zone({
  net: 'SIGNAL',
  layers: ['F.Cu'],
  x: 0, y: 0, width: 20, height: 20,
  fillMode: 'hatched',
  hatchThickness: 0.2,
  hatchGap: 0.5,
  hatchOrientation: 45,
  hatchSmoothingLevel: 2,
  hatchSmoothingValue: 0.1,
  hatchBorderAlgorithm: 'hatch_thickness',
  hatchMinHoleArea: 0.01
});

// ============================================
// PAD CONNECTION OPTIONS
// ============================================

// Full pad connection (no thermal relief)
pcb.zone({
  net: 'GND',
  layers: ['F.Cu'],
  x: 0, y: 0, width: 40, height: 40,
  connectPads: 'full',
  clearance: 0.3
});

// Through-hole only connection
pcb.zone({
  net: 'VCC',
  layers: ['F.Cu', 'B.Cu'],
  x: 0, y: 0, width: 40, height: 40,
  connectPads: 'thru_hole_only',
  clearance: 0.2
});

// No pad connection
pcb.zone({
  net: 'SHIELD',
  layers: ['F.Cu'],
  x: 0, y: 0, width: 40, height: 40,
  connectPads: 'no',
  clearance: 0.5
});

// ============================================
// CORNER SMOOTHING
// ============================================

// Filleted corners
pcb.zone({
  net: 'GND',
  layers: ['F.Cu'],
  x: 0, y: 0, width: 30, height: 30,
  smoothing: 'fillet',
  smoothingRadius: 0.5
});

// Chamfered corners
pcb.zone({
  net: 'VCC',
  layers: ['B.Cu'],
  x: 0, y: 0, width: 30, height: 30,
  smoothing: 'chamfer',
  smoothingRadius: 0.3
});

// ============================================
// ISLAND REMOVAL
// ============================================

// Always remove islands
pcb.zone({
  net: 'GND',
  layers: ['F.Cu', 'B.Cu'],
  x: 0, y: 0, width: 50, height: 50,
  islandRemovalMode: 0
});

// Never remove islands
pcb.zone({
  net: 'ANTENNA',
  layers: ['F.Cu'],
  x: 0, y: 0, width: 20, height: 20,
  islandRemovalMode: 1
});

// Remove islands below minimum area
pcb.zone({
  net: 'GND',
  layers: ['F.Cu'],
  x: 0, y: 0, width: 50, height: 50,
  islandRemovalMode: 2,
  islandAreaMin: 0.5  // Remove islands smaller than 0.5mm²
});

// ============================================
// HATCH DISPLAY SETTINGS (for zone outline)
// ============================================

// No hatch display
pcb.zone({
  net: 'GND',
  layers: ['F.Cu'],
  x: 0, y: 0, width: 40, height: 40,
  hatchStyle: 'none'
});

// Edge hatch with custom spacing
pcb.zone({
  net: 'VCC',
  layers: ['F.Cu'],
  x: 0, y: 0, width: 40, height: 40,
  hatchStyle: 'edge',
  hatchPitch: 1.0
});

// Full hatch
pcb.zone({
  net: 'SHIELD',
  layers: ['F.Cu'],
  x: 0, y: 0, width: 40, height: 40,
  hatchStyle: 'full',
  hatchPitch: 0.5
});

// ============================================
// COMPREHENSIVE EXAMPLE (all options)
// ============================================

pcb.zone({
  // Net specification
  net: 'GND',

  // Position and layers
  layers: ['F.Cu', 'B.Cu'],
  x: 0, y: 0,
  width: 100, height: 80,

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
});
```
