[**@typecad/pcb**](README.md)

***

[@typecad/pcb](globals.md) / RoutingGrid

# Class: RoutingGrid

Defined in: [@typecad/pcb/src/routing/shared/routing\_grid.ts:134](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/routing_grid.ts#L134)

Grid-based spatial representation for PCB routing.
Discretizes continuous PCB space into a uniform grid for pathfinding algorithms.

## Constructors

### Constructor

> **new RoutingGrid**(`bounds`, `gridResolution`, `layers`, `debug?`): `RoutingGrid`

Defined in: [@typecad/pcb/src/routing/shared/routing\_grid.ts:202](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/routing_grid.ts#L202)

Creates a new routing grid.

#### Parameters

##### bounds

World-space bounds of the routing area in mm

###### maxX

`number`

###### maxY

`number`

###### minX

`number`

###### minY

`number`

##### gridResolution

`number`

Size of each grid cell in mm (e.g., 0.1 = 10 cells per mm)

##### layers

`string`[]

List of copper layers to route on (e.g., ['F.Cu', 'B.Cu'])

##### debug?

`boolean` = `false`

#### Returns

`RoutingGrid`

#### Example

```ts
const grid = new RoutingGrid(
  { minX: 0, maxX: 100, minY: 0, maxY: 80 },
  0.1,  // 0.1mm per cell
  ['F.Cu', 'B.Cu']
);
```

## Properties

### gridResolution

> **gridResolution**: `number`

Defined in: [@typecad/pcb/src/routing/shared/routing\_grid.ts:173](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/routing_grid.ts#L173)

***

### maxObstacleHalfWidthMm

> **maxObstacleHalfWidthMm**: `number`

Defined in: [@typecad/pcb/src/routing/shared/routing\_grid.ts:180](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/routing_grid.ts#L180)

## Methods

### addObstacle()

> **addObstacle**(`obstacle`): `void`

Defined in: [@typecad/pcb/src/routing/shared/routing\_grid.ts:245](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/routing_grid.ts#L245)

#### Parameters

##### obstacle

[`IRoutingObstacle`](Interface.IRoutingObstacle.md)

#### Returns

`void`

***

### checkTrackObstaclePrecise()

> **checkTrackObstaclePrecise**(`worldX`, `worldY`, `layer`, `clearance`, `net?`): `boolean`

Defined in: [@typecad/pcb/src/routing/shared/routing\_grid.ts:755](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/routing_grid.ts#L755)

Check if a position conflicts with track obstacles using precise point-to-segment distance.
This method provides more accurate clearance checking for angled tracks.

#### Parameters

##### worldX

`number`

World X coordinate in mm

##### worldY

`number`

World Y coordinate in mm

##### layer

`string`

Layer to check

##### clearance

`number`

Required clearance in mm

##### net?

`string`

Net we're routing (for same-net exemptions)

#### Returns

`boolean`

True if position conflicts with track obstacles

***

### clear()

> **clear**(): `void`

Defined in: [@typecad/pcb/src/routing/shared/routing\_grid.ts:1056](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/routing_grid.ts#L1056)

Clear all obstacles from the grid.
Useful for rebuilding the grid with different obstacles.

#### Returns

`void`

***

### getBounds()

> **getBounds**(): `object`

Defined in: [@typecad/pcb/src/routing/shared/routing\_grid.ts:1040](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/routing_grid.ts#L1040)

Get grid bounds in world coordinates.

#### Returns

`object`

##### maxX

> **maxX**: `number`

##### maxY

> **maxY**: `number`

##### minX

> **minX**: `number`

##### minY

> **minY**: `number`

***

### getCell()

> **getCell**(`x`, `y`, `layer`): [`IGridCell`](Interface.IGridCell.md) \| `undefined`

Defined in: [@typecad/pcb/src/routing/shared/routing\_grid.ts:985](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/routing_grid.ts#L985)

Get a cell by coordinates, if present.

#### Parameters

##### x

`number`

##### y

`number`

##### layer

`string`

#### Returns

[`IGridCell`](Interface.IGridCell.md) \| `undefined`

***

### getCellCost()

> **getCellCost**(`x`, `y`, `layer`): `number`

Defined in: [@typecad/pcb/src/routing/shared/routing\_grid.ts:876](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/routing_grid.ts#L876)

Get the routing cost for a grid cell.

#### Parameters

##### x

`number`

Grid X coordinate

##### y

`number`

Grid Y coordinate

##### layer

`string`

Layer to check

#### Returns

`number`

Cost multiplier (1.0 = normal, higher = more expensive)

***

### getCellsArray()

> **getCellsArray**(): readonly ([`IGridCell`](Interface.IGridCell.md) \| `undefined`)[]

Defined in: [@typecad/pcb/src/routing/shared/routing\_grid.ts:1044](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/routing_grid.ts#L1044)

#### Returns

readonly ([`IGridCell`](Interface.IGridCell.md) \| `undefined`)[]

***

### getDimensions()

> **getDimensions**(): `object`

Defined in: [@typecad/pcb/src/routing/shared/routing\_grid.ts:1015](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/routing_grid.ts#L1015)

Get grid dimensions.

#### Returns

`object`

##### height

> **height**: `number`

##### layers

> **layers**: `number`

##### width

> **width**: `number`

***

### getLayers()

> **getLayers**(): `string`[]

Defined in: [@typecad/pcb/src/routing/shared/routing\_grid.ts:1033](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/routing_grid.ts#L1033)

Get the list of layers in the grid.

#### Returns

`string`[]

***

### getResolution()

> **getResolution**(): `number`

Defined in: [@typecad/pcb/src/routing/shared/routing\_grid.ts:1026](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/routing_grid.ts#L1026)

Get grid resolution in mm.

#### Returns

`number`

***

### getStats()

> **getStats**(): `object`

Defined in: [@typecad/pcb/src/routing/shared/routing\_grid.ts:1070](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/routing_grid.ts#L1070)

Get statistics about the grid.

#### Returns

`object`

##### freeCells

> **freeCells**: `number`

##### occupancyPercent

> **occupancyPercent**: `number`

##### occupiedCells

> **occupiedCells**: `number`

##### totalCells

> **totalCells**: `number`

***

### getVersion()

> **getVersion**(): `number`

Defined in: [@typecad/pcb/src/routing/shared/routing\_grid.ts:1048](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/routing_grid.ts#L1048)

#### Returns

`number`

***

### getWorldXFromGrid()

> **getWorldXFromGrid**(`gridX`): `number`

Defined in: [@typecad/pcb/src/routing/shared/routing\_grid.ts:814](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/routing_grid.ts#L814)

Convert grid X coordinate to world X coordinate using cell boundary (no center offset).
This provides more accurate positioning for track creation.

#### Parameters

##### gridX

`number`

Grid X coordinate

#### Returns

`number`

World X coordinate in mm

***

### getWorldYFromGrid()

> **getWorldYFromGrid**(`gridY`): `number`

Defined in: [@typecad/pcb/src/routing/shared/routing\_grid.ts:824](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/routing_grid.ts#L824)

Convert grid Y coordinate to world Y coordinate using cell boundary (no center offset).
This provides more accurate positioning for track creation.

#### Parameters

##### gridY

`number`

Grid Y coordinate

#### Returns

`number`

World Y coordinate in mm

***

### gridToWorld()

> **gridToWorld**(`gridX`, `gridY`): `object`

Defined in: [@typecad/pcb/src/routing/shared/routing\_grid.ts:954](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/routing_grid.ts#L954)

Convert grid coordinates to world coordinates (mm).
Returns the center of the grid cell.

#### Parameters

##### gridX

`number`

Grid X coordinate

##### gridY

`number`

Grid Y coordinate

#### Returns

`object`

World coordinates in mm

##### x

> **x**: `number`

##### y

> **y**: `number`

***

### gridToWorldX()

> **gridToWorldX**(`gridX`): `number`

Defined in: [@typecad/pcb/src/routing/shared/routing\_grid.ts:795](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/routing_grid.ts#L795)

Convert grid X coordinate to world X coordinate in mm.

#### Parameters

##### gridX

`number`

Grid X coordinate

#### Returns

`number`

World X coordinate in mm

***

### gridToWorldY()

> **gridToWorldY**(`gridY`): `number`

Defined in: [@typecad/pcb/src/routing/shared/routing\_grid.ts:804](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/routing_grid.ts#L804)

Convert grid Y coordinate to world Y coordinate in mm.

#### Parameters

##### gridY

`number`

Grid Y coordinate

#### Returns

`number`

World Y coordinate in mm

***

### hasPadWithinClearance()

> **hasPadWithinClearance**(`x`, `y`, `layer`, `clearanceMm`): `boolean`

Defined in: [@typecad/pcb/src/routing/shared/routing\_grid.ts:585](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/routing_grid.ts#L585)

Check if any pad lies within the specified clearance of a grid coordinate.
Ignores net assignments so that callers can enforce absolute pad spacing.

#### Parameters

##### x

`number`

##### y

`number`

##### layer

`string`

##### clearanceMm

`number`

#### Returns

`boolean`

***

### isInBounds()

> **isInBounds**(`x`, `y`): `boolean`

Defined in: [@typecad/pcb/src/routing/shared/routing\_grid.ts:968](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/routing_grid.ts#L968)

Check if grid coordinates are within bounds.

#### Parameters

##### x

`number`

Grid X coordinate

##### y

`number`

Grid Y coordinate

#### Returns

`boolean`

True if in bounds

***

### isOccupied()

> **isOccupied**(`x`, `y`, `layer`, `clearance?`, `net?`, `considerObstacleClearance?`, `sumObstacleClearance?`): `boolean`

Defined in: [@typecad/pcb/src/routing/shared/routing\_grid.ts:625](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/routing_grid.ts#L625)

Check if a grid cell is occupied.

#### Parameters

##### x

`number`

Grid X coordinate

##### y

`number`

Grid Y coordinate

##### layer

`string`

Layer to check

##### clearance?

`number` = `0`

Additional clearance to check (in mm, not grid cells)

##### net?

`string`

Net we're routing - obstacles on same net don't block

##### considerObstacleClearance?

`boolean` = `false`

##### sumObstacleClearance?

`boolean` = `false`

#### Returns

`boolean`

True if occupied, false if available for routing

***

### isOccupiedById()

> **isOccupiedById**(`x`, `y`, `layer`, `obstacleIds`): `boolean`

Defined in: [@typecad/pcb/src/routing/shared/routing\_grid.ts:714](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/routing_grid.ts#L714)

Fast-path occupancy check for via placement: returns true only if the cell
at (x, y, layer) is occupied by an obstacle whose ID is in `obstacleIds`.
Avoids the expensive clearance-radius scan of isOccupied().

#### Parameters

##### x

`number`

Grid X coordinate

##### y

`number`

Grid Y coordinate

##### layer

`string`

Layer name

##### obstacleIds

`string`[] \| `Set`\<`string`\>

Set (or array) of obstacle IDs already belonging to the
                    current net — these are ignored so the via can share pads.

#### Returns

`boolean`

***

### isPadCell()

> **isPadCell**(`x`, `y`, `layer`): `boolean`

Defined in: [@typecad/pcb/src/routing/shared/routing\_grid.ts:574](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/routing_grid.ts#L574)

Check if a specific grid cell belongs to a pad area on a given layer.

#### Parameters

##### x

`number`

##### y

`number`

##### layer

`string`

#### Returns

`boolean`

***

### markTerminal()

> **markTerminal**(`gx`, `gy`, `layer`, `radiusCells`, `net?`): `void`

Defined in: [@typecad/pcb/src/routing/shared/routing\_grid.ts:911](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/routing_grid.ts#L911)

#### Parameters

##### gx

`number`

##### gy

`number`

##### layer

`string`

##### radiusCells

`number`

##### net?

`string`

#### Returns

`void`

***

### setCellCost()

> **setCellCost**(`x`, `y`, `layer`, `cost`): `void`

Defined in: [@typecad/pcb/src/routing/shared/routing\_grid.ts:892](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/routing_grid.ts#L892)

Set the routing cost for a grid cell.
Useful for biasing routes toward or away from certain areas.

#### Parameters

##### x

`number`

Grid X coordinate

##### y

`number`

Grid Y coordinate

##### layer

`string`

Layer

##### cost

`number`

Cost multiplier

#### Returns

`void`

***

### worldToGrid()

> **worldToGrid**(`worldX`, `worldY`): `object`

Defined in: [@typecad/pcb/src/routing/shared/routing\_grid.ts:939](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/routing_grid.ts#L939)

Convert world coordinates (mm) to grid coordinates.

#### Parameters

##### worldX

`number`

X coordinate in mm

##### worldY

`number`

Y coordinate in mm

#### Returns

`object`

Grid coordinates

##### x

> **x**: `number`

##### y

> **y**: `number`
