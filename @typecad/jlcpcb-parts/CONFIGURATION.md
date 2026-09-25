# Configuration Guide

This document explains all configuration options available for the `@typecad/jlcpcb-parts` package.

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

### Database Configuration

```bash
# Custom CSV download URL (default: JLCPCB official URL)
JLCPCB_CSV_URL=https://cdfer.github.io/jlcpcb-parts-database/jlcpcb-components-basic-preferred.csv

# Local CSV file name (default: jlcpcb-components-basic-preferred.csv)
JLCPCB_LOCAL_CSV=my-components.csv

# Cache directory (default: current directory)
JLCPCB_CACHE_DIR=./cache

# Cache expiration in hours (default: 24)
JLCPCB_CACHE_HOURS=12
```

### Search Configuration

```bash
# Default search result limit (default: 5)
JLCPCB_RESULT_LIMIT=10

# Search timeout in milliseconds (default: 30000)
JLCPCB_SEARCH_TIMEOUT=60000

# Enable search result caching (default: true)
JLCPCB_ENABLE_CACHE=false

# Cache expiration for search results in milliseconds (default: 300000)
JLCPCB_SEARCH_CACHE_EXPIRY=600000
```

### Logging Configuration

```bash
# Log level: DEBUG, INFO, WARN, ERROR (default: INFO)
JLCPCB_LOG_LEVEL=DEBUG

# Log directory (default: .logs)
JLCPCB_LOG_DIR=./logs

# Enable console logging (default: true)
JLCPCB_CONSOLE_LOG=false

# Enable file logging (default: true)
JLCPCB_FILE_LOG=true
```

### Performance Configuration

```bash
# Enable performance metrics collection (default: false)
JLCPCB_ENABLE_METRICS=true

# Batch size for processing large datasets (default: 10000)
JLCPCB_BATCH_SIZE=5000

# Enable batch processing (default: true for large datasets)
JLCPCB_ENABLE_BATCHING=false

# Maximum cache size for search results (default: 100)
JLCPCB_MAX_CACHE_SIZE=200
```

## Constructor Options

### DataManager Options

```typescript
interface DataManagerOptions {
  csvUrl?: string;               // CSV download URL
  localCsvPath?: string;         // Local cache file path
  cacheDir?: string;             // Cache directory
  cacheExpirationHours?: number; // Cache expiry in hours
  retryAttempts?: number;        // Download retry attempts (default: 3)
  retryDelay?: number;           // Delay between retries in ms (default: 1000)
  validateChecksum?: boolean;    // Enable checksum validation (default: false)
}

// Usage
const dataManager = new DataManager(
  'https://custom-url.com/components.csv',
  'components.csv',
  './cache',
  24, // 24 hours
  {
    retryAttempts: 5,
    retryDelay: 2000,
    validateChecksum: true
  }
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

### Application Options

```typescript
interface ApplicationOptions {
  csvUrl?: string;
  localCsvPath?: string;
  cacheDir?: string;
  cacheExpirationHours?: number;
  programName?: string;
  logLevel?: LogLevel;
}

// Usage
await runApplication(['node', 'script.js', 'search query'], {
  csvUrl: 'https://custom-url.com/components.csv',
  cacheDir: './my-cache',
  cacheExpirationHours: 12,
  logLevel: LogLevel.DEBUG
});
```

## Cache Configuration

### File System Cache

The package uses file system caching for the component database:

```typescript
// Configure cache location and expiration
const dataManager = new DataManager(
  undefined, // Use default CSV URL
  'components.csv',
  './cache', // Cache directory
  24 // Cache expires after 24 hours
);

// Check cache status
if (dataManager.isDataStale()) {
  console.log('Cache is stale, will download fresh data');
}

// Force cache refresh
await dataManager.ensureDataAvailable();
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
searchEngine.clearCache();

// Get cache statistics
const stats = searchEngine.getCacheStats();
console.log(`Cache hits: ${stats.hits}, misses: ${stats.misses}`);
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
// jlcpcb-search "10k resistor" --limit 20
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
  batchSize: 5000 // Process 5000 components at a time
});
```

## Logging Configuration

### Log Levels

```typescript
enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

// Configure logging
const app = new Application(
  undefined, // Use defaults
  undefined,
  undefined,
  undefined,
  'jlcpcb-search',
  LogLevel.DEBUG // Enable debug logging
);
```

### Custom Logger

```typescript
import { Logger } from '@typecad/jlcpcb-parts';

// Configure logger
const logger = Logger.getInstance({
  consoleLevel: LogLevel.INFO,
  includeTimestamps: true
});

// Use logger
logger.info('Application started');
logger.debug('Debug information', { query: 'test' });
logger.error('Error occurred', error);
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

// Monitor performance
const metrics = searchEngine.getPerformanceMetrics();
console.log(`Average search time: ${metrics.averageSearchTime}ms`);
console.log(`Cache hit rate: ${metrics.cacheHitRate}%`);
```

### Network Optimization

```typescript
// Configure for slow networks
const dataManager = new DataManager(
  undefined,
  undefined,
  './cache',
  72, // Cache for 3 days
  {
    retryAttempts: 5,
    retryDelay: 5000,    // 5 second delay
    validateChecksum: false // Skip checksum for speed
  }
);
```

## Examples

### Development Configuration

```typescript
// Development setup with debug logging and fast cache expiry
const app = new Application(
  'https://dev-server.com/components.csv',
  'dev-components.csv',
  './dev-cache',
  1, // 1 hour cache
  'jlcpcb-dev',
  LogLevel.DEBUG
);
```

### Production Configuration

```typescript
// Production setup with optimized performance
const app = new Application(
  process.env.JLCPCB_CSV_URL,
  'components.csv',
  '/var/cache/jlcpcb',
  24, // 24 hour cache
  'jlcpcb-search',
  LogLevel.WARN
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
ENV JLCPCB_CACHE_DIR=/app/cache
ENV JLCPCB_LOG_DIR=/app/logs
ENV JLCPCB_LOG_LEVEL=INFO
ENV JLCPCB_CACHE_HOURS=24
ENV JLCPCB_RESULT_LIMIT=5

# Create directories
RUN mkdir -p /app/cache /app/logs

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
  name: jlcpcb-config
data:
  JLCPCB_CACHE_DIR: "/cache"
  JLCPCB_LOG_DIR: "/logs"
  JLCPCB_LOG_LEVEL: "INFO"
  JLCPCB_CACHE_HOURS: "24"
  JLCPCB_RESULT_LIMIT: "10"
  JLCPCB_SEARCH_TIMEOUT: "30000"

---
# Deployment with configuration
apiVersion: apps/v1
kind: Deployment
metadata:
  name: jlcpcb-search
spec:
  replicas: 3
  selector:
    matchLabels:
      app: jlcpcb-search
  template:
    metadata:
      labels:
        app: jlcpcb-search
    spec:
      containers:
      - name: jlcpcb-search
        image: jlcpcb-search:latest
        envFrom:
        - configMapRef:
            name: jlcpcb-config
        volumeMounts:
        - name: cache-volume
          mountPath: /cache
        - name: logs-volume
          mountPath: /logs
      volumes:
      - name: cache-volume
        emptyDir: {}
      - name: logs-volume
        emptyDir: {}
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

// Use validation helper
import { validateConfiguration } from '@typecad/jlcpcb-parts';

const config = {
  resultLimit: 10,
  searchTimeout: 30000,
  cacheExpiration: 300000
};

const validation = validateConfiguration(config);
if (!validation.valid) {
  console.error('Configuration errors:', validation.errors);
}
```

## Best Practices

### Cache Management

1. **Set appropriate cache expiration**: Balance freshness vs performance
2. **Use persistent cache directory**: Avoid re-downloading on restart
3. **Monitor cache size**: Large caches can consume significant disk space
4. **Clear cache periodically**: Prevent stale data accumulation

### Performance

1. **Use result limits**: Don't return more results than needed
2. **Enable search caching**: Cache frequently used queries
3. **Tune batch sizes**: Balance memory usage vs processing speed
4. **Monitor metrics**: Track performance over time

### Logging

1. **Use appropriate log levels**: DEBUG for development, WARN+ for production
2. **Rotate log files**: Prevent disk space issues
3. **Include context**: Add relevant information to log messages
4. **Monitor log volume**: High-frequency logging can impact performance

### Error Handling

1. **Configure timeouts**: Prevent hanging operations
2. **Set retry limits**: Balance reliability vs responsiveness
3. **Handle network errors**: Gracefully degrade when offline
4. **Validate inputs**: Check configuration values at startup