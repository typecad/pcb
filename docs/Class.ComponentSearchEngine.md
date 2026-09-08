[**@typecad/pcb**](README.md)

***

[@typecad/pcb](globals.md) / ComponentSearchEngine

# Class: ComponentSearchEngine

Defined in: [@typecad/pcb/src/kicad-symbols/scoring/SearchEngine.ts:81](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/scoring/SearchEngine.ts#L81)

Main implementation of the SearchEngine interface that orchestrates the complete search workflow.

The ComponentSearchEngine coordinates between data management, parameter parsing, and fuzzy scoring
to provide intelligent component search capabilities. It includes performance optimizations like
result caching, batch processing for large datasets, and comprehensive error handling.

Key features:
- Intelligent result caching with configurable expiration
- Performance monitoring and metrics collection
- Batch processing for large component databases
- Comprehensive error handling and recovery
- Search timeout protection

 ComponentSearchEngine

## Example

```typescript
// Create search engine with dependencies
const dataManager = new DataManager();
const parser = new ElectricalParameterParser();
const scorer = new ComponentFuzzyScorer();

const searchEngine = new ComponentSearchEngine(dataManager, parser, scorer, {
  resultLimit: 10,
  searchTimeout: 30000,
  cacheExpiration: 300000 // 5 minutes
});

// Perform searches
const results = await searchEngine.search("10k resistor 0603");
logger.debug(`Found ${results.length} components`);

// Get performance metrics
const metrics = searchEngine.getPerformanceMetrics();
logger.debug(`Average search time: ${metrics.averageSearchTime}ms`);
```

## Implements

- `SearchEngine`

## Constructors

### Constructor

> **new ComponentSearchEngine**(`dataManager`, `parameterParser`, `fuzzyScorer`, `resultLimit?`, `searchTimeout?`, `cacheExpirationMs?`, `maxCacheSize?`): `ComponentSearchEngine`

Defined in: [@typecad/pcb/src/kicad-symbols/scoring/SearchEngine.ts:107](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/scoring/SearchEngine.ts#L107)

Creates a new ComponentSearchEngine

#### Parameters

##### dataManager

`DataManager`

Data manager for accessing component data

##### parameterParser

`ParameterParser`

Parser for extracting parameters from queries

##### fuzzyScorer

`FuzzyScorer`

Scorer for ranking components

##### resultLimit?

`number` = `5`

Maximum number of results to return (default: 5)

##### searchTimeout?

`number` = `10000`

Maximum time in ms to spend on search (default: 10000)

##### cacheExpirationMs?

`number` = `3600000`

Time in ms before cache entries expire (default: 3600000 = 1 hour)

##### maxCacheSize?

`number` = `100`

Maximum number of queries to cache (default: 100)

#### Returns

`ComponentSearchEngine`

## Methods

### clearCache()

> **clearCache**(): `void`

Defined in: [@typecad/pcb/src/kicad-symbols/scoring/SearchEngine.ts:459](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/scoring/SearchEngine.ts#L459)

Clears the search cache

#### Returns

`void`

***

### getAveragePerformanceMetrics()

> **getAveragePerformanceMetrics**(): `object`

Defined in: [@typecad/pcb/src/kicad-symbols/scoring/SearchEngine.ts:489](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/scoring/SearchEngine.ts#L489)

Gets average performance metrics across all recorded searches

#### Returns

`object`

Object with average metrics

##### avgComponentCount

> **avgComponentCount**: `number`

##### avgFormattingTime

> **avgFormattingTime**: `number`

##### avgParsingTime

> **avgParsingTime**: `number`

##### avgResultCount

> **avgResultCount**: `number`

##### avgScoringTime

> **avgScoringTime**: `number`

##### avgTotalTime

> **avgTotalTime**: `number`

##### cacheHitRate

> **cacheHitRate**: `number`

***

### getCacheStats()

> **getCacheStats**(): `object`

Defined in: [@typecad/pcb/src/kicad-symbols/scoring/SearchEngine.ts:550](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/scoring/SearchEngine.ts#L550)

Gets statistics about the search cache

#### Returns

`object`

Object with cache statistics

##### hitRate?

> `optional` **hitRate?**: `number`

##### hits?

> `optional` **hits?**: `number`

##### maxSize

> **maxSize**: `number`

##### misses?

> `optional` **misses?**: `number`

##### size

> **size**: `number`

***

### getPerformanceMetrics()

> **getPerformanceMetrics**(): `SearchPerformanceMetrics`[]

Defined in: [@typecad/pcb/src/kicad-symbols/scoring/SearchEngine.ts:481](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/scoring/SearchEngine.ts#L481)

Gets performance metrics for recent searches

#### Returns

`SearchPerformanceMetrics`[]

Array of performance metrics

***

### search()

> **search**(`query`): `Promise`\<[`SearchResult`](Interface.SearchResult.md)[]\>

Defined in: [@typecad/pcb/src/kicad-symbols/scoring/SearchEngine.ts:131](https://github.com/typecad/typecad/blob/b72da98d85f9b29fc7bb1602b3a7c35124dbd31c/src/kicad-symbols/scoring/SearchEngine.ts#L131)

Performs a complete search operation from query to ranked results

#### Parameters

##### query

`string`

Natural language search query

#### Returns

`Promise`\<[`SearchResult`](Interface.SearchResult.md)[]\>

Array of top matching components formatted for display

#### Implementation of

`SearchEngine.search`
