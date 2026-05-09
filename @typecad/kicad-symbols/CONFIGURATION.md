# Configuration Guide

This document explains all configuration options available for the `@typecad/kicad-symbols` package.

## Table of Contents

- [Environment Variables](#environment-variables)
- [Constructor Options](#constructor-options)
- [Cache Configuration](#cache-configuration)
- [Search Engine Options](#search-engine-options)
- [Logging Configuration](#logging-configuration)
- [Performance Tuning](#performance-tuning)
- [Examples](#examples)

## Environment Variables

The package supports several environment variables for global configuration:

### Cache Configuration

```bash
# Cache directory (default: current directory)
KICAD_CACHE_DIR=./cache

# Cache check interval in hours (default: 24)
KICAD_CACHE_HOURS=12

# Local cache file name (default: kicad-symbols-data.json)
KICAD_LOCAL_CACHE=my-symbols-cache.json
```

### Search Configuration

```bash
# Default search result limit (default: 5)
KICAD_RESULT_LIMIT=10

# Search timeout in milliseconds (default: 30000)
KICAD_SEARCH_TIMEOUT=60000

# Enable search result caching (default: true)
KICAD_ENABLE_CACHE=false

# Cache expiration for search results in milliseconds (default: 300000)
KICAD_SEARCH_CACHE_EXPIRY=600000
```

### Logging Configuration

```bash
# Cache directory (default: current directory)
KICAD_CACHE_DIR=./cache

# Cache expiration in hours (default: 24)
KICAD_CACHE_HOURS=12
```

### Performance Configuration

```bash
# Enable performance metrics collection (default: false)
KICAD_ENABLE_METRICS=true

# Batch size for processing large datasets (default: 10000)
KICAD_BATCH_SIZE=5000

# Enable batch processing (default: true for large datasets)
KICAD_ENABLE_BATCHING=false

# Maximum cache size for search results (default: 100)
KICAD_MAX_CACHE_SIZE=200
```

## Constructor Options

### Application Options

```typescript
interface ApplicationOptions {
  localCachePath?: string;
  cacheDir?: string;
  cacheExpirationHours?: number;
  programName?: string;
}

// Usage
const app = new Application(
  'kicad-symbols-cache.json',  // localCachePath (ignored when using shared cache)
  './cache',                   // cacheDir (ignored when using shared cache)
  24,                         // cacheExpirationHours
  'kicad-symbols',            // programName
  true                        // useSharedCache (default: true)
);
```

### DataManager Options

```typescript
interface DataManagerConfig {
  mode: DataSourceMode;
  customSymbolsPath?: string;
  enableProgress: boolean;
  progressCallback?: (progress: ProcessingProgress) => void;
}

// Usage
const dataManager = new DataManager(
  'kicad-symbols-data.json',   // localDataPath (ignored when using shared cache)
  './cache',                   // cacheDir (ignored when using shared cache)
  24,                         // cacheExpirationHours
  {
    mode: DataSourceMode.LOCAL_FILES,
    customSymbolsPath: '/custom/path/to/symbols',
    enableProgress: true,
    progressCallback: (progress) => {
      console.log(`${progress.phase}: ${progress.percentage.toFixed(1)}%`);
    }
  },
  true                        // useSharedCache (default: true)
);
```

### SearchEngine Options

```typescript
interface SearchEngineOptions {
  resultLimit?: number;              // Maximum results to return (default: 5)
  searchTimeout?: number;            // Search timeout in ms (default: 30000)
  cacheExpiration?: number;          // Cache expiry in ms (default: 300000)
  enablePerformanceMetrics?: boolean; // Enable metrics (default: false)
  enableBatching?: boolean;          // Enable batch processing (default: true)
  batchSize?: number;                // Batch size (default: 10000)
  maxCacheSize?: number;             // Max cached searches (default: 100)
  enableSearchCache?: boolean;       // Enable result caching (default: true)
}

// Usage
const searchEngine = new ComponentSearchEngine(
  dataManager,
  parser,
  scorer,
  {
    resultLimit: 10,
    searchTimeout: 60000,
    enablePerformanceMetrics: true,
    batchSize: 5000
  }
);
```

### runApplication Options

```typescript
// Usage with runApplication convenience function
await runApplication(process.argv, {
  localCachePath: 'symbols-cache.json',
  cacheDir: './my-cache',
  cacheExpirationHours: 12,
  programName: 'my-kicad-search'
});
```

## Cache Configuration

### File System Cache

The package uses file system caching for processed KiCad symbols:

```typescript
// Configure cache location and expiration
const dataManager = new DataManager(
  'kicad-symbols-data.json',   // Cache file name (ignored when using shared cache)
  './cache',                   // Cache directory (ignored when using shared cache)
  24,                         // Cache check interval (24 hours)
  {},                         // config
  true                        // useSharedCache (default: true)
);

// Check cache status
if (await dataManager.isDataStale()) {
  console.log('Cache is stale, will reprocess symbols');
}

// Force cache refresh
await dataManager.forceRefresh();
```

### Search Result Cache

Search results are cached in memory for performance:

```typescript
const searchEngine = new ComponentSearchEngine(dataManager, parser, scorer, {
  enableSearchCache: true,      // Enable caching
  cacheExpiration: 300000,      // 5 minutes
  maxCacheSize: 100            // Maximum 100 cached searches
});

// Clear search cache
if (typeof searchEngine.clearCache === 'function') {
  searchEngine.clearCache();
}

// Get cache statistics (if available)
if (typeof searchEngine.getCacheStats === 'function') {
  const stats = searchEngine.getCacheStats();
  console.log(`Cache hits: ${stats.hits}, misses: ${stats.misses}`);
}
```

### Cache Management

```typescript
// Custom cache management
class CustomCacheManager {
  private cache = new Map();
  
  get(key: string) {
    const entry = this.cache.get(key);
    if (entry && Date.now() - entry.timestamp < 300000) {
      return entry.data;
    }
    return null;
  }
  
  set(key: string, data: any) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }
  
  clear() {
    this.cache.clear();
  }
}
```

## Search Engine Options

### Result Limiting

```typescript
// Configure result limits
const searchEngine = new ComponentSearchEngine(dataManager, parser, scorer, {
  resultLimit: 10 // Return up to 10 results
});

// Or use CLI option
// kicad-symbols "op amp" --limit 20
```

### Search Timeout

```typescript
// Configure search timeout
const searchEngine = new ComponentSearchEngine(dataManager, parser, scorer, {
  searchTimeout: 60000 // 60 second timeout
});

// Handle timeout errors
try {
  const results = await searchEngine.search("complex query");
} catch (error) {
  if (error.message.includes('timeout')) {
    console.log('Search timed out, try a more specific query');
  }
}
```

### Batch Processing

```typescript
// Configure batch processing for large datasets
const searchEngine = new ComponentSearchEngine(dataManager, parser, scorer, {
  enableBatching: true,
  batchSize: 5000 // Process 5000 symbols at a time
});
```

## Logging Configuration

### Log Levels

```typescript
// Create application instance
const app = new Application(
  'kicad-symbols-cache.json', // ignored when using shared cache
  './cache',                  // ignored when using shared cache
  24,
  'kicad-symbols',
  true                        // use shared cache (default)
);
```

## Performance Tuning

### Memory Optimization

```typescript
// Configure for memory-constrained environments
const searchEngine = new ComponentSearchEngine(dataManager, parser, scorer, {
  batchSize: 1000,        // Smaller batches
  maxCacheSize: 50,       // Smaller cache
  enableBatching: true,   // Use batching
  resultLimit: 5          // Limit results
});
```

### Speed Optimization

```typescript
// Configure for maximum speed
const searchEngine = new ComponentSearchEngine(dataManager, parser, scorer, {
  enableSearchCache: true,    // Enable caching
  cacheExpiration: 600000,    // 10 minute cache
  maxCacheSize: 500,          // Large cache
  batchSize: 20000,          // Large batches
  enablePerformanceMetrics: true // Monitor performance
});

// Monitor performance (if available)
if (typeof searchEngine.getPerformanceMetrics === 'function') {
  const metrics = searchEngine.getPerformanceMetrics();
  console.log(`Average search time: ${metrics.averageSearchTime}ms`);
  console.log(`Cache hit rate: ${metrics.cacheHitRate}%`);
}
```

### File System Optimization

```typescript
// Configure for slow file systems
const dataManager = new DataManager(
  'kicad-symbols-cache.json', // ignored when using shared cache
  './cache',                  // ignored when using shared cache
  72,                         // Cache for 3 days
  {
    mode: DataSourceMode.LOCAL_FILES,
    enableProgress: true,
    progressCallback: (progress) => {
      // Only log major progress updates
      if (progress.percentage % 10 === 0) {
        console.log(`Processing: ${progress.percentage.toFixed(0)}%`);
      }
    }
  }
);
```

## Examples

### Development Configuration

```typescript
// Development setup with fast cache expiry
const app = new Application(
  'dev-symbols-cache.json', // ignored when using shared cache
  './dev-cache',            // ignored when using shared cache
  1,                        // 1 hour cache
  'kicad-dev',
  true                      // use shared cache (default)
);
```

### Production Configuration

```typescript
// Production setup with optimized performance
const app = new Application(
  'kicad-symbols-cache.json', // ignored when using shared cache
  '/var/cache/kicad',         // ignored when using shared cache
  24,                         // 24 hour cache
  'kicad-symbols',
  true                        // use shared cache (default)
);

const searchEngine = new ComponentSearchEngine(dataManager, parser, scorer, {
  resultLimit: 5,
  searchTimeout: 30000,
  enableSearchCache: true,
  cacheExpiration: 600000,
  maxCacheSize: 200,
  enablePerformanceMetrics: true
});
```

### Testing Configuration

```typescript
// Testing setup with mocked data and fast operations
const testDataManager = new MockDataManager();
const searchEngine = new ComponentSearchEngine(testDataManager, parser, scorer, {
  resultLimit: 3,
  searchTimeout: 5000,
  enableSearchCache: false, // Disable cache for consistent tests
  enableBatching: false     // Disable batching for predictable behavior
});
```

### Docker Configuration

```dockerfile
# Dockerfile with environment variables
FROM node:18-alpine

# Set configuration via environment variables
ENV KICAD_CACHE_DIR=/app/cache
ENV KICAD_CACHE_HOURS=24
ENV KICAD_RESULT_LIMIT=5

# Create directories
RUN mkdir -p /app/cache

# Install and configure application
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

# Run application
CMD ["node", "dist/src/cli/bin.js"]
```

### Kubernetes Configuration

```yaml
# ConfigMap for application configuration
apiVersion: v1
kind: ConfigMap
metadata:
  name: kicad-config
data:
  KICAD_CACHE_DIR: "/cache"
  KICAD_CACHE_HOURS: "24"
  KICAD_RESULT_LIMIT: "10"
  KICAD_SEARCH_TIMEOUT: "30000"

---
# Deployment with configuration
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kicad-search
spec:
  replicas: 3
  selector:
    matchLabels:
      app: kicad-search
  template:
    metadata:
      labels:
        app: kicad-search
    spec:
      containers:
      - name: kicad-search
        image: kicad-search:latest
        envFrom:
        - configMapRef:
            name: kicad-config
        volumeMounts:
        - name: cache-volume
          mountPath: /cache
        - name: kicad-symbols
          mountPath: /usr/share/kicad/symbols
          readOnly: true
      volumes:
      - name: cache-volume
        emptyDir: {}
      - name: kicad-symbols
        hostPath:
          path: /usr/share/kicad/symbols
          type: Directory
```

## Configuration Validation

The package includes configuration validation to help catch common issues:

```typescript
// Validation errors will be thrown for invalid configurations
try {
  const searchEngine = new ComponentSearchEngine(dataManager, parser, scorer, {
    resultLimit: -1,        // Invalid: negative limit
    searchTimeout: 0,       // Invalid: zero timeout
    cacheExpiration: -1000  // Invalid: negative expiration
  });
} catch (error) {
  console.error('Configuration error:', error.message);
}

// Use validation helper (if available)
import { validateConfiguration } from '@typecad/kicad-symbols';

const config = {
  resultLimit: 10,
  searchTimeout: 30000,
  cacheExpiration: 300000
};

if (typeof validateConfiguration === 'function') {
  const validation = validateConfiguration(config);
  if (!validation.valid) {
    console.error('Configuration errors:', validation.errors);
  }
}
```

## Best Practices

### Cache Management

1. **Set appropriate cache expiration**: Balance freshness vs performance
2. **Use persistent cache directory**: Avoid re-processing on restart
3. **Monitor cache size**: Large caches can consume significant disk space
4. **Clear cache periodically**: Prevent stale data accumulation

### Performance

1. **Use result limits**: Don't return more results than needed
2. **Enable search caching**: Cache frequently used queries
3. **Tune batch sizes**: Balance memory usage vs processing speed
4. **Monitor metrics**: Track performance over time (if available)

### Logging

1. **Use appropriate log levels**: DEBUG for development, WARN+ for production
2. **Rotate log files**: Prevent disk space issues
3. **Include context**: Add relevant information to log messages
4. **Monitor log volume**: High-frequency logging can impact performance

### Error Handling

1. **Configure timeouts**: Prevent hanging operations
2. **Set retry limits**: Balance reliability vs responsiveness
3. **Handle file system errors**: Gracefully handle missing KiCad installations
4. **Validate inputs**: Check configuration values at startup

### Local File Processing

1. **Ensure KiCad is installed**: The tool requires local KiCad symbol files
2. **Check symbol paths**: Verify KiCad symbols are accessible
3. **Monitor file changes**: Cache will update when symbol files change
4. **Handle permissions**: Ensure read access to KiCad symbol directories