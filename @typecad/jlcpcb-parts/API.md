# API Documentation

This document provides comprehensive API documentation for programmatic usage of the `@typecad/jlcpcb-parts` package.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core Interfaces](#core-interfaces)
- [Main Classes](#main-classes)
- [Type Definitions](#type-definitions)
- [Configuration Options](#configuration-options)
- [Error Handling](#error-handling)
- [Performance Considerations](#performance-considerations)
- [Examples](#examples)

## Installation

```bash
npm install @typecad/jlcpcb-parts
```

## Quick Start

### Basic Usage

```typescript
import { runApplication } from '@typecad/jlcpcb-parts';

// Simple search using the main application function
await runApplication(['node', 'script.js', '10k resistor 0603']);
```

### Advanced Usage

```typescript
import { 
  DataManager, 
  ElectricalParameterParser, 
  ComponentFuzzyScorer, 
  ComponentSearchEngine,
  ComponentRecord,
  SearchResult
} from '@typecad/jlcpcb-parts';

// Create individual components
const dataManager = new DataManager();
const parser = new ElectricalParameterParser();
const scorer = new ComponentFuzzyScorer();
const searchEngine = new ComponentSearchEngine(dataManager, parser, scorer);

// Perform search
const results: SearchResult[] = await searchEngine.search('10k resistor 0603');
console.log(`Found ${results.length} matching components`);
```

## Core Interfaces

### SearchEngine

The main interface for performing component searches.

```typescript
interface SearchEngine {
  search(query: string): Promise<SearchResult[]>;
}
```

**Methods:**

#### `search(query: string): Promise<SearchResult[]>`

Performs a complete search operation from natural language query to ranked results.

- **Parameters:**
  - `query` (string): Natural language search query (e.g., "10k resistor 0603")
- **Returns:** Promise resolving to array of matching components
- **Throws:** Error when database cannot be loaded or search fails

**Example:**
```typescript
const results = await searchEngine.search("100uF 16V capacitor");
results.forEach(result => {
  console.log(`${result.lcsc}: ${result.description} (Score: ${result.score})`);
});
```

### ParameterParser

Interface for parsing natural language queries into structured parameters.

```typescript
interface ParameterParser {
  parseQuery(query: string): ParsedParameters;
}
```

**Methods:**

#### `parseQuery(query: string): ParsedParameters`

Parses a natural language search query into structured electrical parameters.

- **Parameters:**
  - `query` (string): Natural language search query to parse
- **Returns:** Structured parameters extracted from the query

**Example:**
```typescript
const parser = new ElectricalParameterParser();
const params = parser.parseQuery("10k resistor 0603 ±1%");
// Returns: {
//   value: { value: 10000, unit: "Ω", originalText: "10k" },
//   package: "0603",
//   tolerance: "±1%",
//   componentType: "resistor"
// }
```

### FuzzyScorer

Interface for scoring and ranking component matches.

```typescript
interface FuzzyScorer {
  scoreComponent(component: ComponentRecord, parameters: ParsedParameters): ComponentScore;
  rankComponents(components: ComponentRecord[], parameters: ParsedParameters): ComponentScore[];
  filterTopResults(scoredComponents: ComponentScore[], limit?: number): ComponentScore[];
  generateMatchSummary(componentScore: ComponentScore): string;
}
```

**Methods:**

#### `scoreComponent(component, parameters): ComponentScore`

Calculates a comprehensive match score for a single component.

#### `rankComponents(components, parameters): ComponentScore[]`

Scores and ranks multiple components, returning them sorted by match quality.

#### `filterTopResults(scoredComponents, limit?): ComponentScore[]`

Filters scored components to return only the top N results.

#### `generateMatchSummary(componentScore): string`

Creates a human-readable explanation of why a component matched.

## Main Classes

### ComponentSearchEngine

Main implementation of the SearchEngine interface.

```typescript
class ComponentSearchEngine implements SearchEngine {
  constructor(
    dataManager: DataManager,
    parameterParser: ParameterParser,
    fuzzyScorer: FuzzyScorer,
    options?: SearchEngineOptions
  );
}
```

**Constructor Parameters:**
- `dataManager`: Handles component database management
- `parameterParser`: Parses search queries
- `fuzzyScorer`: Scores and ranks components
- `options`: Optional configuration (see [Configuration Options](#configuration-options))

### ElectricalParameterParser

Implementation of the ParameterParser interface for electrical components.

```typescript
class ElectricalParameterParser implements ParameterParser {
  parseQuery(query: string): ParsedParameters;
}
```

**Features:**
- Recognizes electrical values (10k, 100nF, 1µH, 3.3V)
- Parses component packages (0603, SOT-23, LQFP64)
- Extracts tolerances (±1%, ±5%, ±10%)
- Identifies component types (X7R, NP0, MLCC)
- Processes keywords and descriptions

### ComponentFuzzyScorer

Implementation of the FuzzyScorer interface with intelligent scoring algorithms.

```typescript
class ComponentFuzzyScorer implements FuzzyScorer {
  // Implements all FuzzyScorer methods
}
```

**Scoring Algorithm:**
- **Exact Matches**: 100 points per parameter
- **Close Value Matches**: 50-90 points based on proximity
- **Package Matches**: 80 points exact, 40 points similar
- **Type Matches**: 70 points for component type
- **Keyword Matches**: 20-50 points for description relevance

### DataManager

Handles component database downloading, caching, and loading.

```typescript
class DataManager implements DataManager {
  constructor(
    csvUrl?: string,
    localCsvPath?: string,
    cacheDir?: string,
    cacheExpirationHours?: number
  );
  
  ensureDataAvailable(): Promise<void>;
  getCsvData(): Promise<ComponentRecord[]>;
  isDataStale(): boolean;
}
```

## Type Definitions

### ComponentRecord

Complete JLCPCB component information:

```typescript
interface ComponentRecord {
  lcsc: string;              // Component ID (e.g., "C25804")
  category: string;          // Category (e.g., "Resistors")
  subcategory: string;       // Subcategory
  manufacturer: string;      // Manufacturer name
  mfr: string;              // Manufacturer part number
  package: string;          // Package type (e.g., "0603")
  description: string;      // Full description
  datasheet: string;        // Datasheet URL
  stock: string;            // Stock quantity
  price: string;            // Pricing JSON
  // ... additional fields
}
```

### SearchResult

Formatted search result for display:

```typescript
interface SearchResult {
  lcsc: string;             // JLCPCB component ID
  manufacturer: string;     // Manufacturer name
  partNumber: string;       // Manufacturer part number
  description: string;      // Component description
  package: string;          // Package type
  score: number;            // Match score
  matchSummary: string;     // Match explanation
}
```

### ParsedParameters

Structured parameters from search query:

```typescript
interface ParsedParameters {
  voltage?: ElectricalValue;    // Voltage rating
  value?: ElectricalValue;      // Primary electrical value
  tolerance?: string;           // Tolerance (±1%, ±5%)
  package?: string;             // Package type
  componentType?: string;       // Component type
  keywords?: string[];          // Additional keywords
}
```

### ElectricalValue

Electrical parameter with unit information:

```typescript
interface ElectricalValue {
  value: number;           // Normalized value
  unit: string;            // Base unit (Ω, F, H, V)
  originalText: string;    // Original query text
}
```

## Configuration Options

### SearchEngineOptions

```typescript
interface SearchEngineOptions {
  resultLimit?: number;           // Max results (default: 5)
  searchTimeout?: number;         // Timeout in ms (default: 30000)
  cacheExpiration?: number;       // Cache expiry in ms (default: 300000)
  enablePerformanceMetrics?: boolean; // Enable metrics (default: false)
}
```

### DataManagerOptions

```typescript
interface DataManagerOptions {
  csvUrl?: string;               // CSV download URL
  localCsvPath?: string;         // Local cache file path
  cacheDir?: string;             // Cache directory
  cacheExpirationHours?: number; // Cache expiry (default: 24)
}
```

## Error Handling

The package defines specific error types for different failure scenarios:

### NetworkError

```typescript
interface NetworkError extends Error {
  code?: string;        // Network error code
  statusCode?: number;  // HTTP status code
}
```

### FileSystemError

```typescript
interface FileSystemError extends Error {
  code?: string;  // File system error code
  path?: string;  // File path that caused error
}
```

### ParsingError

```typescript
interface ParsingError extends Error {
  line?: number;    // Line number where parsing failed
  column?: number;  // Column number where parsing failed
}
```

### Error Handling Example

```typescript
try {
  const results = await searchEngine.search("invalid query");
} catch (error) {
  if (error instanceof NetworkError) {
    console.error(`Network error: ${error.message} (${error.code})`);
  } else if (error instanceof FileSystemError) {
    console.error(`File system error: ${error.message} at ${error.path}`);
  } else {
    console.error(`Search error: ${error.message}`);
  }
}
```

## Performance Considerations

### Caching

The search engine includes intelligent caching:

```typescript
// Results are cached automatically
const results1 = await searchEngine.search("10k resistor"); // Database query
const results2 = await searchEngine.search("10k resistor"); // Cache hit

// Clear cache if needed
searchEngine.clearCache();
```

### Batch Processing

For large datasets, the engine uses batch processing:

```typescript
const searchEngine = new ComponentSearchEngine(dataManager, parser, scorer, {
  batchSize: 10000,  // Process 10k components at a time
  enableBatching: true
});
```

### Performance Metrics

Enable performance monitoring:

```typescript
const searchEngine = new ComponentSearchEngine(dataManager, parser, scorer, {
  enablePerformanceMetrics: true
});

const results = await searchEngine.search("capacitor");
const metrics = searchEngine.getPerformanceMetrics();

console.log(`Search took ${metrics.totalSearchTime}ms`);
console.log(`Cache hit rate: ${metrics.cacheHitRate}%`);
```

## Examples

### Basic Component Search

```typescript
import { ComponentSearchEngine, DataManager, ElectricalParameterParser, ComponentFuzzyScorer } from '@typecad/jlcpcb-parts';

async function searchComponents() {
  // Initialize components
  const dataManager = new DataManager();
  const parser = new ElectricalParameterParser();
  const scorer = new ComponentFuzzyScorer();
  const searchEngine = new ComponentSearchEngine(dataManager, parser, scorer);
  
  // Search for resistors
  const resistors = await searchEngine.search("10k resistor 0603");
  console.log("Resistors found:");
  resistors.forEach(r => console.log(`  ${r.lcsc}: ${r.description}`));
  
  // Search for capacitors
  const capacitors = await searchEngine.search("100nF 50V ceramic");
  console.log("\nCapacitors found:");
  capacitors.forEach(c => console.log(`  ${c.lcsc}: ${c.description}`));
}

searchComponents().catch(console.error);
```

### Custom Scoring

```typescript
import { ComponentFuzzyScorer, ComponentRecord, ParsedParameters } from '@typecad/jlcpcb-parts';

class CustomScorer extends ComponentFuzzyScorer {
  scoreComponent(component: ComponentRecord, parameters: ParsedParameters) {
    const baseScore = super.scoreComponent(component, parameters);
    
    // Add custom scoring logic
    if (component.preferred === '1') {
      baseScore.score += 20; // Bonus for preferred parts
    }
    
    if (component.basic === '1') {
      baseScore.score += 10; // Bonus for basic parts
    }
    
    return baseScore;
  }
}

// Use custom scorer
const customScorer = new CustomScorer();
const searchEngine = new ComponentSearchEngine(dataManager, parser, customScorer);
```

### Advanced Parameter Parsing

```typescript
import { ElectricalParameterParser } from '@typecad/jlcpcb-parts';

const parser = new ElectricalParameterParser();

// Parse complex queries
const queries = [
  "10k resistor 0603 ±1% 50V thick film",
  "100µF 16V tantalum capacitor SMD",
  "STM32F103 microcontroller LQFP64 ARM Cortex-M3",
  "USB-C connector 24-pin SMT"
];

queries.forEach(query => {
  const params = parser.parseQuery(query);
  console.log(`Query: "${query}"`);
  console.log(`Parsed:`, JSON.stringify(params, null, 2));
  console.log();
});
```

### Database Management

```typescript
import { DataManager } from '@typecad/jlcpcb-parts';

async function manageDatabase() {
  const dataManager = new DataManager(
    'https://custom-url.com/components.csv', // Custom CSV URL
    'my-components.csv',                     // Custom local filename
    './cache',                               // Custom cache directory
    12                                       // Cache expires after 12 hours
  );
  
  // Check if data needs updating
  if (dataManager.isDataStale()) {
    console.log("Database is stale, updating...");
    await dataManager.ensureDataAvailable();
  }
  
  // Load all components
  const components = await dataManager.getCsvData();
  console.log(`Loaded ${components.length} components`);
  
  // Filter components by category
  const resistors = components.filter(c => c.category === 'Resistors');
  console.log(`Found ${resistors.length} resistors`);
}

manageDatabase().catch(console.error);
```

### Integration with Express.js

```typescript
import express from 'express';
import { ComponentSearchEngine, DataManager, ElectricalParameterParser, ComponentFuzzyScorer } from '@typecad/jlcpcb-parts';

const app = express();
app.use(express.json());

// Initialize search engine
const dataManager = new DataManager();
const parser = new ElectricalParameterParser();
const scorer = new ComponentFuzzyScorer();
const searchEngine = new ComponentSearchEngine(dataManager, parser, scorer);

// Search endpoint
app.get('/api/search', async (req, res) => {
  try {
    const { q: query, limit = 5 } = req.query;
    
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Query parameter required' });
    }
    
    const results = await searchEngine.search(query);
    const limitedResults = results.slice(0, parseInt(limit as string));
    
    res.json({
      query,
      count: limitedResults.length,
      total: results.length,
      results: limitedResults
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

app.listen(3000, () => {
  console.log('JLCPCB search API running on port 3000');
});
```

## Environment Variables

The package supports several environment variables for configuration:

```bash
# Custom CSV download URL
JLCPCB_CSV_URL=https://custom-url.com/components.csv

# Cache directory
JLCPCB_CACHE_DIR=./my-cache

# Cache expiration in hours
JLCPCB_CACHE_HOURS=12

# Enable debug logging
JLCPCB_LOG_LEVEL=DEBUG

# Search timeout in milliseconds
JLCPCB_SEARCH_TIMEOUT=30000
```

## TypeScript Support

The package is written in TypeScript and includes comprehensive type definitions. All interfaces and types are exported for use in TypeScript projects:

```typescript
import type { 
  ComponentRecord,
  SearchResult,
  ParsedParameters,
  ElectricalValue,
  ComponentScore,
  MatchDetail
} from '@typecad/jlcpcb-parts';

// Use types in your application
function processResults(results: SearchResult[]): void {
  results.forEach((result: SearchResult) => {
    console.log(`${result.lcsc}: ${result.description}`);
  });
}
```

## Contributing

For information about contributing to this package, see the main [README.md](README.md#contributing) file.

## License

MIT License - see [LICENSE](LICENSE) file for details.