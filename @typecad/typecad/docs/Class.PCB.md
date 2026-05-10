[**@typecad/typecad**](README.md)

***

[@typecad/typecad](globals.md) / PCB

# Class: PCB

Defined in: @typecad/typecad/src/pcb/pcb.ts:125

Represents a printed circuit board (PCB).

## Constructors

### Constructor

> **new PCB**(`Boardname`, `options?`): `PCB`

Defined in: @typecad/typecad/src/pcb/pcb.ts:159

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

Defined in: @typecad/typecad/src/pcb/pcb.ts:126

***

### copper\_thickness

> **copper\_thickness**: `number`

Defined in: @typecad/typecad/src/pcb/pcb.ts:129

***

### outlines

> **outlines**: `IOutline`[] = `[]`

Defined in: @typecad/typecad/src/pcb/pcb.ts:130

***

### Schematic

> **Schematic**: [`Schematic`](Class.Schematic.md)

Defined in: @typecad/typecad/src/pcb/pcb.ts:127

***

### thickness

> **thickness**: `number`

Defined in: @typecad/typecad/src/pcb/pcb.ts:128

***

### tracks

> **tracks**: `IOutline`[] = `[]`

Defined in: @typecad/typecad/src/pcb/pcb.ts:131

## Accessors

### components

#### Get Signature

> **get** **components**(): [`Component`](Class.Component.md)[]

Defined in: @typecad/typecad/src/pcb/pcb.ts:336

Getter for components.

##### Returns

[`Component`](Class.Component.md)[]

***

### existingBoardElements

#### Get Signature

> **get** **existingBoardElements**(): `unknown`[]

Defined in: @typecad/typecad/src/pcb/pcb.ts:373

Getter for existing board elements.

##### Returns

`unknown`[]

***

### grCircles

#### Get Signature

> **get** **grCircles**(): `IGrCircle`[]

Defined in: @typecad/typecad/src/pcb/pcb.ts:294

Getter for graphics circles (required by PcbGraphicsInstance interface).

##### Returns

`IGrCircle`[]

***

### grLines

#### Get Signature

> **get** **grLines**(): `IGrLine`[]

Defined in: @typecad/typecad/src/pcb/pcb.ts:287

Getter for graphics lines (required by PcbGraphicsInstance interface).

##### Returns

`IGrLine`[]

***

### groups

#### Get Signature

> **get** **groups**(): `string`[]

Defined in: @typecad/typecad/src/pcb/pcb.ts:350

Getter for groups.

##### Returns

`string`[]

***

### groupsAsMap

#### Get Signature

> **get** **groupsAsMap**(): `Map`\<`string`, `any`\>

Defined in: @typecad/typecad/src/pcb/pcb.ts:357

Getter for groups as Map (for footprint functions that expect Map).

##### Returns

`Map`\<`string`, `any`\>

***

### grPolys

#### Get Signature

> **get** **grPolys**(): `IGrPoly`[]

Defined in: @typecad/typecad/src/pcb/pcb.ts:308

Getter for graphics polygons (required by PcbGraphicsInstance interface).

##### Returns

`IGrPoly`[]

***

### grRects

#### Get Signature

> **get** **grRects**(): `IGrRect`[]

Defined in: @typecad/typecad/src/pcb/pcb.ts:301

Getter for graphics rectangles (required by PcbGraphicsInstance interface).

##### Returns

`IGrRect`[]

***

### grTexts

#### Get Signature

> **get** **grTexts**(): `IGrTextOptions`[]

Defined in: @typecad/typecad/src/pcb/pcb.ts:380

Getter for grTexts.

##### Returns

`IGrTextOptions`[]

***

### keepoutZones

#### Get Signature

> **get** **keepoutZones**(): `IKeepoutZone`[]

Defined in: @typecad/typecad/src/pcb/pcb.ts:329

Getter for keepout zones.

##### Returns

`IKeepoutZone`[]

***

### option

#### Get Signature

> **get** **option**(): `IPcbOptions`

Defined in: @typecad/typecad/src/pcb/pcb.ts:280

Getter for PCB options.

##### Returns

`IPcbOptions`

***

### options

#### Get Signature

> **get** **options**(): `IPcbOptions`

Defined in: @typecad/typecad/src/pcb/pcb.ts:402

Getter for options.

##### Returns

`IPcbOptions`

***

### outlines\_public

#### Get Signature

> **get** **outlines\_public**(): `IOutline`[]

Defined in: @typecad/typecad/src/pcb/pcb.ts:395

Getter for outlines_public.

##### Returns

`IOutline`[]

***

### pcb

#### Get Signature

> **get** **pcb**(): `string`

Defined in: @typecad/typecad/src/pcb/pcb.ts:388

Getter for pcb string.

##### Returns

`string`

***

### stagedComponents

#### Get Signature

> **get** **stagedComponents**(): [`Component`](Class.Component.md)[]

Defined in: @typecad/typecad/src/pcb/pcb.ts:343

Getter for staged components.

##### Returns

[`Component`](Class.Component.md)[]

***

### stagedOutlines

#### Get Signature

> **get** **stagedOutlines**(): `IOutline`[]

Defined in: @typecad/typecad/src/pcb/pcb.ts:315

Getter for staged outlines (required by PcbGraphicsInstance interface).

##### Returns

`IOutline`[]

***

### zones

#### Get Signature

> **get** **zones**(): `IFilledZone`[]

Defined in: @typecad/typecad/src/pcb/pcb.ts:322

Getter for filled zones.

##### Returns

`IFilledZone`[]

## Methods

### \_addComponentToBoardPublic()

> **\_addComponentToBoardPublic**(`component`): `void`

Defined in: @typecad/typecad/src/pcb/pcb.ts:478

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

Defined in: @typecad/typecad/src/pcb/pcb.ts:520

**`Internal`**

Public method to clear components.
Used by extracted modules to reset components during board creation.

#### Returns

`void`

***

### \_clearGroups()

> **\_clearGroups**(): `void`

Defined in: @typecad/typecad/src/pcb/pcb.ts:538

**`Internal`**

Public method to clear groups.
Used by extracted modules to reset groups during board creation.

#### Returns

`void`

***

### \_clearOutlines()

> **\_clearOutlines**(): `void`

Defined in: @typecad/typecad/src/pcb/pcb.ts:529

**`Internal`**

Public method to clear outlines.
Used by extracted modules to reset outlines during board creation.

#### Returns

`void`

***

### \_createFootprintNodePublic()

> **\_createFootprintNodePublic**(`component`, `boardNetNameToCodeMap?`): `any`[]

Defined in: @typecad/typecad/src/pcb/pcb.ts:502

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

Defined in: @typecad/typecad/src/pcb/pcb.ts:968

**`Internal`**

Get active components on the PCB.
 Used by ObstacleBuilder to include components as obstacles.

#### Returns

[`Component`](Class.Component.md)[]

***

### \_getKeepoutZones()

> **\_getKeepoutZones**(): `IKeepoutZone`[]

Defined in: @typecad/typecad/src/pcb/pcb.ts:960

**`Internal`**

Get keepout zones for obstacle detection during autorouting.
 Used by ObstacleBuilder to include keepout areas in the routing grid.

#### Returns

`IKeepoutZone`[]

***

### \_getStagedComponents()

> **\_getStagedComponents**(): [`Component`](Class.Component.md)[]

Defined in: @typecad/typecad/src/pcb/pcb.ts:976

**`Internal`**

Get staged components (placed but not yet created).
 Used by ObstacleBuilder to include staged components as obstacles.

#### Returns

[`Component`](Class.Component.md)[]

***

### \_getStagedOutlines()

> **\_getStagedOutlines**(): `IOutline`[]

Defined in: @typecad/typecad/src/pcb/pcb.ts:952

**`Internal`**

Get staged outlines for obstacle detection during autorouting.
 Used by ObstacleBuilder to detect tracks from previous autoroute calls.

#### Returns

`IOutline`[]

***

### \_getTrackData()

> **\_getTrackData**(`uuid`): `IGrLine`

Defined in: @typecad/typecad/src/pcb/pcb.ts:1308

**`Internal`**

Gets the actual track data for a given UUID, including any preserved manual edits.

#### Parameters

##### uuid

`string`

The UUID of the track to retrieve

#### Returns

`IGrLine`

The track data if found, null otherwise
 Used by TrackBuilder to retrieve deferred track data.

***

### \_removeStagedOutlinesByUuid()

> **\_removeStagedOutlinesByUuid**(`uuids`): `void`

Defined in: @typecad/typecad/src/pcb/pcb.ts:983

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

Defined in: @typecad/typecad/src/pcb/pcb.ts:487

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

Defined in: @typecad/typecad/src/pcb/pcb.ts:547

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

> **\_track**(`start`, `end`, `width?`, `layer?`, `locked?`, `uuid?`, `net?`): `string`

Defined in: @typecad/typecad/src/pcb/pcb.ts:991

**`Internal`**

Create a low-level track segment. Used internally by TrackBuilder.

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

***

### \_updateFootprintNodePublic()

> **\_updateFootprintNodePublic**(`node`, `component`, `boardNetNameToCodeMap?`): `any`[]

Defined in: @typecad/typecad/src/pcb/pcb.ts:511

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

Defined in: @typecad/typecad/src/pcb/pcb.ts:1296

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

Defined in: @typecad/typecad/src/pcb/pcb.ts:1197

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

Defined in: @typecad/typecad/src/pcb/pcb.ts:1275

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

Defined in: @typecad/typecad/src/pcb/pcb.ts:886

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

### create()

> **create**(...`items`): `Promise`\<`void`\>

Defined in: @typecad/typecad/src/pcb/pcb.ts:718

#### Parameters

##### items

...([`Component`](Class.Component.md) \| [`TrackBuilder`](Class.TrackBuilder.md))[]

#### Returns

`Promise`\<`void`\>

***

### createRouter()

> **createRouter**(`name`, `grid`, `options`): `IRouterContext`

Defined in: @typecad/typecad/src/pcb/pcb.ts:216

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

`IRouterContext`

***

### erc()

> **erc**(): `void`

Defined in: @typecad/typecad/src/pcb/pcb.ts:1285

Performs electrical rule checks on the associated schematic.
This is a pass-through to the Schematic.erc() method.

#### Returns

`void`

***

### getCallSite()

> **getCallSite**(): `object`

Defined in: @typecad/typecad/src/pcb/pcb.ts:722

#### Returns

`object`

##### column

> **column**: `number`

##### file

> **file**: `string`

##### line

> **line**: `number`

***

### getRegisteredRouters()

> **getRegisteredRouters**(): `string`[]

Defined in: @typecad/typecad/src/pcb/pcb.ts:236

**`Internal`**

Get the list of registered router names from this PCB instance's registry.

#### Returns

`string`[]

***

### getRouterGridConfigurator()

> **getRouterGridConfigurator**(`name`): `RouterGridConfigurator`

Defined in: @typecad/typecad/src/pcb/pcb.ts:228

**`Internal`**

Get the grid configuration hook for an algorithm from this PCB instance's registry.

#### Parameters

##### name

`string`

#### Returns

`RouterGridConfigurator`

***

### group()

> **group**(`group_name`, ...`items`): `void`

Defined in: @typecad/typecad/src/pcb/pcb.ts:610

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

Defined in: @typecad/typecad/src/pcb/pcb.ts:835

Creates a keepout zone that restricts routing and placement.
For full documentation and examples, see [keepout](#keepout) in `pcb_zones.ts`.

#### Parameters

##### options

###### hatchPitch?

`number`

###### hatchStyle?

`"none"` \| `"edge"` \| `"full"`

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

Defined in: @typecad/typecad/src/pcb/pcb.ts:872

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

Defined in: @typecad/typecad/src/pcb/pcb.ts:1264

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

Defined in: @typecad/typecad/src/pcb/pcb.ts:1254

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

Defined in: @typecad/typecad/src/pcb/pcb.ts:940

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

Defined in: @typecad/typecad/src/pcb/pcb.ts:555

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

Defined in: @typecad/typecad/src/pcb/pcb.ts:921

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

### prettyPrintSExpr()

> **prettyPrintSExpr**(`sexpr`): `string`

Defined in: @typecad/typecad/src/pcb/pcb.ts:170

#### Parameters

##### sexpr

`string`

#### Returns

`string`

***

### rect()

> **rect**(`options`): `void`

Defined in: @typecad/typecad/src/pcb/pcb.ts:902

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

Defined in: @typecad/typecad/src/pcb/pcb.ts:180

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

Defined in: @typecad/typecad/src/pcb/pcb.ts:414

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

Defined in: @typecad/typecad/src/pcb/pcb.ts:1146

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

Defined in: @typecad/typecad/src/pcb/pcb.ts:1147

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

Defined in: @typecad/typecad/src/pcb/pcb.ts:566

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

Defined in: @typecad/typecad/src/pcb/pcb.ts:672

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

Defined in: @typecad/typecad/src/pcb/pcb.ts:1034

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

> **via**(`via?`): [`Component`](Class.Component.md)

Defined in: @typecad/typecad/src/pcb/pcb.ts:748

Handles via-related operations.

#### Parameters

##### via?

`Omit`\<`IVia`, `"uuid"` \| `"netCode"` \| `"layers"`\> = `{}`

The via details.

#### Returns

[`Component`](Class.Component.md)

The component representing the via.

***

### waitForPendingAutoroutes()

> **waitForPendingAutoroutes**(): `Promise`\<`void`\>

Defined in: @typecad/typecad/src/pcb/pcb.ts:1172

Wait for any pending autoroute operations initiated on this PCB instance.
This is useful to ensure the board file is written after routing completes.

#### Returns

`Promise`\<`void`\>

***

### zone()

> **zone**(`options`): `void`

Defined in: @typecad/typecad/src/pcb/pcb.ts:775

Creates a filled zone on copper layers connected to a specific net.
For full documentation and examples, see [zone](#zone) in `pcb_zones.ts`.

#### Parameters

##### options

###### clearance?

`number`

###### connectPads?

`"full"` \| `"thru_hole_only"` \| `"no"`

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

`"none"` \| `"edge"` \| `"full"`

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

`any`

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
