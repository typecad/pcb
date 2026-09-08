[**@typecad/pcb**](README.md)

***

[@typecad/pcb](globals.md) / LengthMatcher

# Class: LengthMatcher

Defined in: [@typecad/pcb/src/routing/length\_matching/length\_matcher.ts:39](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/length_matching/length_matcher.ts#L39)

## Constructors

### Constructor

> **new LengthMatcher**(): `LengthMatcher`

#### Returns

`LengthMatcher`

## Methods

### apply()

> `static` **apply**(`ctx`, `routeDetails`, `routeTrackBuilders`, `rawConfig`): `object`

Defined in: [@typecad/pcb/src/routing/length\_matching/length\_matcher.ts:46](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/routing/length_matching/length_matcher.ts#L46)

Apply length matching to a set of routed paths.

Extends shorter routes with sawtooth meanders so that all routes are
within `tolerance` of the longest route.

#### Parameters

##### ctx

`ILengthMatchContext`

##### routeDetails

`object`[]

##### routeTrackBuilders

(`ITrackBuilder`[] \| `undefined`)[]

##### rawConfig

`number` \| `ILengthMatchConfig`

#### Returns

`object`

##### builders

> **builders**: `ITrackBuilder`[]

##### updates

> **updates**: `object`[]
