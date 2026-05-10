[**@typecad/typecad**](README.md)

***

[@typecad/typecad](globals.md) / LengthMatcher

# Class: LengthMatcher

Defined in: @typecad/typecad/src/routing/length\_matching/length\_matcher.ts:39

## Constructors

### Constructor

> **new LengthMatcher**(): `LengthMatcher`

#### Returns

`LengthMatcher`

## Methods

### apply()

> `static` **apply**(`ctx`, `routeDetails`, `routeTrackBuilders`, `rawConfig`): `object`

Defined in: @typecad/typecad/src/routing/length\_matching/length\_matcher.ts:46

Apply length matching to a set of routed paths.

Extends shorter routes with sawtooth meanders so that all routes are
within `tolerance` of the longest route.

#### Parameters

##### ctx

`ILengthMatchContext`

##### routeDetails

`object`[]

##### routeTrackBuilders

`ITrackBuilder`[][]

##### rawConfig

`number` \| `ILengthMatchConfig`

#### Returns

`object`

##### builders

> **builders**: `ITrackBuilder`[]

##### updates

> **updates**: `object`[]
