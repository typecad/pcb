[**@typecad/typecad**](README.md)

***

[@typecad/typecad](globals.md) / Schematic

# Class: Schematic

Defined in: @typecad/typecad/src/schematic.ts:192

The main class for typeCAD. Holds all [Component](Class.Component.md) classes, creates work files, and creates nets.

## Export

Schematic

## Constructors

### Constructor

> **new Schematic**(`Sheetname`): `Schematic`

Defined in: @typecad/typecad/src/schematic.ts:306

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

Defined in: @typecad/typecad/src/schematic.ts:193

***

### merged\_nets

> **merged\_nets**: `object`[] = `[]`

Defined in: @typecad/typecad/src/schematic.ts:204

#### merged\_to\_number

> **merged\_to\_number**: `number`

#### old\_name

> **old\_name**: `string`

***

### Nodes

> **Nodes**: `object`[] = `[]`

Defined in: @typecad/typecad/src/schematic.ts:203

#### code

> **code**: `number`

#### name

> **name**: `string`

#### nodes

> **nodes**: [`Pin`](Class.Pin.md)[]

#### owner

> **owner**: [`Component`](Class.Component.md)

***

### Sheetname

> **Sheetname**: `string` = `''`

Defined in: @typecad/typecad/src/schematic.ts:198

***

### uuid

> **uuid**: `` `${string}-${string}-${string}-${string}-${string}` ``

Defined in: @typecad/typecad/src/schematic.ts:199

## Accessors

### Components

#### Get Signature

> **get** **Components**(): [`Component`](Class.Component.md)[]

Defined in: @typecad/typecad/src/schematic.ts:195

##### Deprecated

Use `components` instead. Kept for backward compatibility.

##### Returns

[`Component`](Class.Component.md)[]

#### Set Signature

> **set** **Components**(`value`): `void`

Defined in: @typecad/typecad/src/schematic.ts:197

##### Deprecated

Use `components` instead. Kept for backward compatibility.

##### Parameters

###### value

[`Component`](Class.Component.md)[]

##### Returns

`void`

***

### option

#### Get Signature

> **get** **option**(): `ISchematicOptions`

Defined in: @typecad/typecad/src/schematic.ts:223

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

Defined in: @typecad/typecad/src/schematic.ts:322

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

Defined in: @typecad/typecad/src/schematic.ts:255

#### Parameters

##### output\_folder?

`string`

#### Returns

`boolean`

***

### create()

> **create**(...`component`): `void`

Defined in: @typecad/typecad/src/schematic.ts:527

Creates schematic files.

#### Parameters

##### component

...[`Component`](Class.Component.md)[]

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

Defined in: @typecad/typecad/src/schematic.ts:379

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

Defined in: @typecad/typecad/src/schematic.ts:552

Performs electrical rule checks.

#### Returns

`void`

***

### error()

> **error**(`error`): `void`

Defined in: @typecad/typecad/src/schematic.ts:561

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

Defined in: @typecad/typecad/src/schematic.ts:403

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

Defined in: @typecad/typecad/src/schematic.ts:425

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

Defined in: @typecad/typecad/src/schematic.ts:570

Logs a warning message.

#### Parameters

##### warning

`string`

The warning message to log.

#### Returns

`void`
