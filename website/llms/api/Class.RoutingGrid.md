[**@typecad/typecad**](README.md)

***

[@typecad/typecad](globals.md) / RoutingGrid

# Class: RoutingGrid

Defined in: [routing/shared/routing\_grid.ts:132](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/routing/shared/routing_grid.ts#L132)

Grid-based spatial representation for PCB routing.
Discretizes continuous PCB space into a uniform grid for pathfinding algorithms.

## Constructors

### Constructor

> **new RoutingGrid**(`bounds`, `gridResolution`, `layers`, `debug`): `RoutingGrid`

Defined in: [routing/shared/routing\_grid.ts:159](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/routing/shared/routing_grid.ts#L159)

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

##### debug

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

## Methods

### addObstacle()

> **addObstacle**(`obstacle`): `void`

Defined in: [routing/shared/routing\_grid.ts:190](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/routing/shared/routing_grid.ts#L190)

Add an obstacle to the grid.
Marks all cells within the obstacle bounds as occupied.
Note: Clearance is NOT applied here - it's checked during routing in isOccupied().

#### Parameters

##### obstacle

[`IRoutingObstacle`](Interface.IRoutingObstacle.md)

The obstacle to add

#### Returns

`void`

***

### checkTrackObstaclePrecise()

> **checkTrackObstaclePrecise**(`worldX`, `worldY`, `layer`, `clearance`, `net?`): `boolean`

Defined in: [routing/shared/routing\_grid.ts:788](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/routing/shared/routing_grid.ts#L788)

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

Defined in: [routing/shared/routing\_grid.ts:1070](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/routing/shared/routing_grid.ts#L1070)

Clear all obstacles from the grid.
Useful for rebuilding the grid with different obstacles.

#### Returns

`void`

***

### getBounds()

> **getBounds**(): `object`

Defined in: [routing/shared/routing\_grid.ts:1062](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/routing/shared/routing_grid.ts#L1062)

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

> **getCell**(`x`, `y`, `layer`): `undefined` \| [`IGridCell`](Interface.IGridCell.md)

Defined in: [routing/shared/routing\_grid.ts:1008](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/routing/shared/routing_grid.ts#L1008)

Get a cell by coordinates, if present.

#### Parameters

##### x

`number`

##### y

`number`

##### layer

`string`

#### Returns

`undefined` \| [`IGridCell`](Interface.IGridCell.md)

***

### getCellCost()

> **getCellCost**(`x`, `y`, `layer`): `number`

Defined in: [routing/shared/routing\_grid.ts:924](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/routing/shared/routing_grid.ts#L924)

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

### getDimensions()

> **getDimensions**(): `object`

Defined in: [routing/shared/routing\_grid.ts:1037](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/routing/shared/routing_grid.ts#L1037)

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

Defined in: [routing/shared/routing\_grid.ts:1055](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/routing/shared/routing_grid.ts#L1055)

Get the list of layers in the grid.

#### Returns

`string`[]

***

### getResolution()

> **getResolution**(): `number`

Defined in: [routing/shared/routing\_grid.ts:1048](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/routing/shared/routing_grid.ts#L1048)

Get grid resolution in mm.

#### Returns

`number`

***

### getStats()

> **getStats**(): `object`

Defined in: [routing/shared/routing\_grid.ts:1082](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/routing/shared/routing_grid.ts#L1082)

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

### getWorldXFromGrid()

> **getWorldXFromGrid**(`gridX`): `number`

Defined in: [routing/shared/routing\_grid.ts:863](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/routing/shared/routing_grid.ts#L863)

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

Defined in: [routing/shared/routing\_grid.ts:873](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/routing/shared/routing_grid.ts#L873)

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

Defined in: [routing/shared/routing\_grid.ts:979](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/routing/shared/routing_grid.ts#L979)

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

Defined in: [routing/shared/routing\_grid.ts:844](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/routing/shared/routing_grid.ts#L844)

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

Defined in: [routing/shared/routing\_grid.ts:853](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/routing/shared/routing_grid.ts#L853)

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

Defined in: [routing/shared/routing\_grid.ts:663](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/routing/shared/routing_grid.ts#L663)

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

Defined in: [routing/shared/routing\_grid.ts:993](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/routing/shared/routing_grid.ts#L993)

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

> **isOccupied**(`x`, `y`, `layer`, `clearance`, `net?`, `considerObstacleClearance?`, `sumObstacleClearance?`): `boolean`

Defined in: [routing/shared/routing\_grid.ts:703](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/routing/shared/routing_grid.ts#L703)

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

##### clearance

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

### isPadCell()

> **isPadCell**(`x`, `y`, `layer`): `boolean`

Defined in: [routing/shared/routing\_grid.ts:653](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/routing/shared/routing_grid.ts#L653)

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

### setCellCost()

> **setCellCost**(`x`, `y`, `layer`, `cost`): `void`

Defined in: [routing/shared/routing\_grid.ts:939](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/routing/shared/routing_grid.ts#L939)

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

Defined in: [routing/shared/routing\_grid.ts:964](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/routing/shared/routing_grid.ts#L964)

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
