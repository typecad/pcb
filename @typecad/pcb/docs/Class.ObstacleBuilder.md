[**@typecad/pcb**](README.md)

***

[@typecad/pcb](globals.md) / ObstacleBuilder

# Class: ObstacleBuilder

Defined in: [@typecad/pcb/src/routing/shared/obstacle\_builder.ts:16](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/obstacle_builder.ts#L16)

Builds routing obstacles from PCB elements.
Converts components, pads, zones, and other PCB features into obstacle representations
for the routing grid.

## Constructors

### Constructor

> **new ObstacleBuilder**(): `ObstacleBuilder`

#### Returns

`ObstacleBuilder`

## Methods

### buildFromComponent()

> `static` **buildFromComponent**(`component`, `clearance`): [`IRoutingObstacle`](Interface.IRoutingObstacle.md) \| `null`

Defined in: [@typecad/pcb/src/routing/shared/obstacle\_builder.ts:198](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/obstacle_builder.ts#L198)

Build an obstacle from a component's body (courtyard).

#### Parameters

##### component

[`Component`](Class.Component.md)

The component

##### clearance

`number`

Clearance around component in mm

#### Returns

[`IRoutingObstacle`](Interface.IRoutingObstacle.md) \| `null`

Component body obstacle, or null if unable to determine bounds

***

### buildFromComponentPads()

> `static` **buildFromComponentPads**(`component`, `clearance`, `pcb`, `debug?`): [`IRoutingObstacle`](Interface.IRoutingObstacle.md)[]

Defined in: [@typecad/pcb/src/routing/shared/obstacle\_builder.ts:236](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/obstacle_builder.ts#L236)

Build obstacles from a component's pads.

#### Parameters

##### component

[`Component`](Class.Component.md)

The component

##### clearance

`number`

Clearance around pads in mm

##### pcb

`IPcbBoardContext`

PCB instance to resolve nets

##### debug?

`boolean` = `false`

#### Returns

[`IRoutingObstacle`](Interface.IRoutingObstacle.md)[]

Array of pad obstacles

***

### buildFromKeepoutZone()

> `static` **buildFromKeepoutZone**(`zone`): [`IRoutingObstacle`](Interface.IRoutingObstacle.md) \| `null`

Defined in: [@typecad/pcb/src/routing/shared/obstacle\_builder.ts:385](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/obstacle_builder.ts#L385)

Build an obstacle from a keepout zone.

#### Parameters

##### zone

`IKeepoutZone`

The keepout zone

#### Returns

[`IRoutingObstacle`](Interface.IRoutingObstacle.md) \| `null`

Keepout obstacle, or null if tracks are allowed

***

### buildFromOutline()

> `static` **buildFromOutline**(`outline`, `clearance`): [`IRoutingObstacle`](Interface.IRoutingObstacle.md) \| `null`

Defined in: [@typecad/pcb/src/routing/shared/obstacle\_builder.ts:494](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/obstacle_builder.ts#L494)

Build an obstacle from a board outline.

#### Parameters

##### outline

`IOutline`

The board outline

##### clearance

`number`

Clearance from outline in mm

#### Returns

[`IRoutingObstacle`](Interface.IRoutingObstacle.md) \| `null`

Outline obstacle (everything outside the outline is blocked)

***

### buildFromPCB()

> `static` **buildFromPCB**(`pcb`, `defaultClearance?`, `additionalComponents?`, `debug?`): [`IRoutingObstacle`](Interface.IRoutingObstacle.md)[]

Defined in: [@typecad/pcb/src/routing/shared/obstacle\_builder.ts:31](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/obstacle_builder.ts#L31)

Build all obstacles from a PCB instance.

#### Parameters

##### pcb

`IPcbBoardContext`

The PCB to extract obstacles from

##### defaultClearance?

`number` = `0.2`

Default clearance for obstacles in mm

##### additionalComponents?

[`Component`](Class.Component.md)[]

Additional components to include (e.g., from pins being routed)

##### debug?

`boolean` = `false`

#### Returns

[`IRoutingObstacle`](Interface.IRoutingObstacle.md)[]

Array of routing obstacles

#### Example

```ts
const obstacles = ObstacleBuilder.buildFromPCB(pcb, 0.2);
obstacles.forEach(obs => grid.addObstacle(obs));
```

***

### buildFromTrack()

> `static` **buildFromTrack**(`track`, `width`, `clearance`, `net?`, `isManualRoute?`): [`IRoutingObstacle`](Interface.IRoutingObstacle.md)

Defined in: [@typecad/pcb/src/routing/shared/obstacle\_builder.ts:416](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/obstacle_builder.ts#L416)

Build an obstacle from a track.

#### Parameters

##### track

`IGrLine`

The track (IGrLine)

##### width

`number`

Track width in mm

##### clearance

`number`

Clearance around track in mm

##### net?

`string`

Net name for net-aware routing (optional)

##### isManualRoute?

`boolean`

#### Returns

[`IRoutingObstacle`](Interface.IRoutingObstacle.md)

Track obstacle

***

### buildFromZone()

> `static` **buildFromZone**(`zone`): [`IRoutingObstacle`](Interface.IRoutingObstacle.md) \| `null`

Defined in: [@typecad/pcb/src/routing/shared/obstacle\_builder.ts:360](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/shared/obstacle_builder.ts#L360)

Build an obstacle from a filled zone.

#### Parameters

##### zone

`IFilledZone`

The filled zone

#### Returns

[`IRoutingObstacle`](Interface.IRoutingObstacle.md) \| `null`

Zone obstacle, or null if invalid
