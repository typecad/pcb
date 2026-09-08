[**@typecad/pcb**](README.md)

***

[@typecad/pcb](globals.md) / Schematic

# Class: Schematic

Defined in: [@typecad/pcb/src/schematic.ts:56](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/schematic.ts#L56)

The main class for typeCAD. Holds all [Component](Class.Component.md) classes, creates work files, and creates nets.

 Schematic

## Implements

- `IPendingSummaryHost`

## Constructors

### Constructor

> **new Schematic**(`Sheetname`): `Schematic`

Defined in: [@typecad/pcb/src/schematic.ts:100](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/schematic.ts#L100)

Initializes a new schematic with a given sheet name.

#### Parameters

##### Sheetname

`string`

Name and filename of generated files.

#### Returns

`Schematic`

#### Example

```ts
let typecad = new Schematic('sheetname');
```

## Properties

### components

> **components**: [`Component`](Class.Component.md)[] = `[]`

Defined in: [@typecad/pcb/src/schematic.ts:57](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/schematic.ts#L57)

***

### referenceCounter

> `readonly` **referenceCounter**: `ReferenceCounter`

Defined in: [@typecad/pcb/src/schematic.ts:65](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/schematic.ts#L65)

***

### Sheetname

> **Sheetname**: `string` = `''`

Defined in: [@typecad/pcb/src/schematic.ts:62](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/schematic.ts#L62)

***

### uuid

> **uuid**: `` `${string}-${string}-${string}-${string}-${string}` ``

Defined in: [@typecad/pcb/src/schematic.ts:63](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/schematic.ts#L63)

## Accessors

### Components

#### Get Signature

> **get** **Components**(): [`Component`](Class.Component.md)[]

Defined in: [@typecad/pcb/src/schematic.ts:59](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/schematic.ts#L59)

##### Deprecated

Use `components` instead. Kept for backward compatibility.

##### Returns

[`Component`](Class.Component.md)[]

#### Set Signature

> **set** **Components**(`value`): `void`

Defined in: [@typecad/pcb/src/schematic.ts:61](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/schematic.ts#L61)

##### Deprecated

Use `components` instead. Kept for backward compatibility.

##### Parameters

###### value

[`Component`](Class.Component.md)[]

##### Returns

`void`

***

### merged\_nets

#### Get Signature

> **get** **merged\_nets**(): `object`[]

Defined in: [@typecad/pcb/src/schematic.ts:81](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/schematic.ts#L81)

##### Returns

`object`[]

***

### Nodes

#### Get Signature

> **get** **Nodes**(): `ISchematicNode`[]

Defined in: [@typecad/pcb/src/schematic.ts:78](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/schematic.ts#L78)

##### Returns

`ISchematicNode`[]

#### Set Signature

> **set** **Nodes**(`val`): `void`

Defined in: [@typecad/pcb/src/schematic.ts:79](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/schematic.ts#L79)

##### Parameters

###### val

`ISchematicNode`[]

##### Returns

`void`

***

### option

#### Get Signature

> **get** **option**(): `ISchematicOptions`

Defined in: [@typecad/pcb/src/schematic.ts:83](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/schematic.ts#L83)

##### Returns

`ISchematicOptions`

## Methods

### add()

> **add**(...`components`): `void`

Defined in: [@typecad/pcb/src/schematic.ts:117](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/schematic.ts#L117)

Adds components to the schematic.

#### Parameters

##### components

...[`Component`](Class.Component.md)[]

Components to add to the schematic.

#### Returns

`void`

#### Example

```ts
let typecad = new Schematic('sheetname');
let r1 = new Component({});
let r2 = new Component({});
typecad.add(r1, r2);
```

***

### bom()

> **bom**(`output_folder?`): `boolean`

Defined in: [@typecad/pcb/src/schematic.ts:87](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/schematic.ts#L87)

#### Parameters

##### output\_folder?

`string`

#### Returns

`boolean`

***

### create()

> **create**(...`component`): `void`

Defined in: [@typecad/pcb/src/schematic.ts:228](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/schematic.ts#L228)

Creates schematic files.

#### Parameters

##### component

...[`Component`](Class.Component.md)[]

All the components to be included in the schematic.

#### Returns

`void`

#### Example

```ts
let typecad = new Schematic('sheetname');
let r1 = new Component({});
let r2 = new Component({});
typecad.create(r1, r2);
```

***

### dnc()

> **dnc**(...`pins`): `void`

Defined in: [@typecad/pcb/src/schematic.ts:183](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/schematic.ts#L183)

Adds a no-connection flag to a pin.

#### Parameters

##### pins

...[`Pin`](Class.Pin.md)[]

Pins to mark as no-connect.

#### Returns

`void`

#### Example

```ts
let typecad = new Schematic('sheetname');
let r1 = new Resistor({ symbol: "Device:R_Small", reference: 'R1' });
typecad.dnc(r1.pin(1));
```

***

### error()

> **error**(`error`): `void`

Defined in: [@typecad/pcb/src/schematic.ts:261](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/schematic.ts#L261)

Logs an error message and exits.

#### Parameters

##### error

`string`

The error message to log.

#### Returns

`void`

***

### named()

> **named**(`name`): `Schematic`

Defined in: [@typecad/pcb/src/schematic.ts:207](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/schematic.ts#L207)

Sets a name for a net.

#### Parameters

##### name

`string`

The name of the net.

#### Returns

`Schematic`

#### Example

```ts
let typecad = new Schematic('sheetname');
let r1 = new Component({});
let r2 = new Component({});

// named net
typecad.named('vin').net(r1.pin(1), r2.pin(1));

// unnamed net
typecad.net(r1.pin(1), r2.pin(1));
```

***

### net()

> **net**(...`pins`): `ISchematicNetDefinition`

Defined in: [@typecad/pcb/src/schematic.ts:212](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/schematic.ts#L212)

#### Parameters

##### pins

...[`Pin`](Class.Pin.md)[]

#### Returns

`ISchematicNetDefinition`

***

### pendingSummaryData()

> **pendingSummaryData**(): `PendingTypecadSummary` \| `undefined`

Defined in: [@typecad/pcb/src/schematic.ts:75](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/schematic.ts#L75)

#### Returns

`PendingTypecadSummary` \| `undefined`

#### Implementation of

`IPendingSummaryHost.pendingSummaryData`

***

### setPendingSummaryData()

> **setPendingSummaryData**(`data`): `void`

Defined in: [@typecad/pcb/src/schematic.ts:76](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/schematic.ts#L76)

#### Parameters

##### data

`PendingTypecadSummary` \| `undefined`

#### Returns

`void`

#### Implementation of

`IPendingSummaryHost.setPendingSummaryData`

***

### warn()

> **warn**(`warning`): `void`

Defined in: [@typecad/pcb/src/schematic.ts:270](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/schematic.ts#L270)

Logs a warning message.

#### Parameters

##### warning

`string`

The warning message to log.

#### Returns

`void`
