[**@typecad/pcb**](README.md)

***

[@typecad/pcb](globals.md) / Schematic

# Class: Schematic

Defined in: [schematic.ts:133](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/schematic.ts#L133)

The main class for typeCAD. Holds all [Component](Class.Component.md) classes, creates work files, and creates nets.

## Export

Schematic

## Constructors

### Constructor

> **new Schematic**(`Sheetname`): `Schematic`

Defined in: [schematic.ts:242](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/schematic.ts#L242)

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

### Components

> **Components**: [`Component`](Class.Component.md)[] = `[]`

Defined in: [schematic.ts:134](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/schematic.ts#L134)

***

### merged\_nets

> **merged\_nets**: `object`[] = `[]`

Defined in: [schematic.ts:141](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/schematic.ts#L141)

#### merged\_to\_number

> **merged\_to\_number**: `number`

#### old\_name

> **old\_name**: `string`

***

### Nodes

> **Nodes**: `object`[] = `[]`

Defined in: [schematic.ts:140](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/schematic.ts#L140)

#### code

> **code**: `number`

#### name

> **name**: `string`

#### nodes

> **nodes**: [`Pin`](Class.Pin.md)[]

#### owner

> **owner**: `null` \| [`Component`](Class.Component.md)

***

### Sheetname

> **Sheetname**: `string` = `''`

Defined in: [schematic.ts:135](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/schematic.ts#L135)

***

### uuid

> **uuid**: `` `${string}-${string}-${string}-${string}-${string}` ``

Defined in: [schematic.ts:136](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/schematic.ts#L136)

## Accessors

### option

#### Get Signature

> **get** **option**(): `ISchematicOptions`

Defined in: [schematic.ts:160](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/schematic.ts#L160)

Getter for Schematic options.

##### Example

```ts
let schematic = new Schematic('sheetname');
schematic.option.safe_write = false;
schematic.option.build_dir = './custom_build/';
```

##### Returns

`ISchematicOptions`

## Methods

### add()

> **add**(...`components`): `void`

Defined in: [schematic.ts:258](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/schematic.ts#L258)

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

> **bom**(`output_folder?`): `undefined` \| `false`

Defined in: [schematic.ts:192](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/schematic.ts#L192)

#### Parameters

##### output\_folder?

`string`

#### Returns

`undefined` \| `false`

***

### create()

> **create**(...`component`): `undefined` \| `false`

Defined in: [schematic.ts:533](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/schematic.ts#L533)

Creates schematic files.

#### Parameters

##### component

...[`Component`](Class.Component.md)[]

#### Returns

`undefined` \| `false`

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

Defined in: [schematic.ts:348](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/schematic.ts#L348)

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

### erc()

> **erc**(): `void`

Defined in: [schematic.ts:562](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/schematic.ts#L562)

Performs electrical rule checks.

#### Returns

`void`

***

### error()

> **error**(`error`): `void`

Defined in: [schematic.ts:571](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/schematic.ts#L571)

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

Defined in: [schematic.ts:372](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/schematic.ts#L372)

Sets a name for a net.

#### Parameters

##### name

`string`

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

Defined in: [schematic.ts:394](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/schematic.ts#L394)

Connects a group of pins together.

#### Parameters

##### pins

...[`Pin`](Class.Pin.md)[]

Pins to connect.

#### Returns

`ISchematicNetDefinition`

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

### warn()

> **warn**(`warning`): `void`

Defined in: [schematic.ts:581](https://github.com/typecad/typecad/blob/6bbcc8ae1b7d95ad4656019e0545a2a6bf8c25eb/schematic.ts#L581)

Logs a warning message.

#### Parameters

##### warning

`string`

The warning message to log.

#### Returns

`void`
