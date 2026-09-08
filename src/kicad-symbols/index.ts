// Public types
export type {
  ComponentRecord,
  SearchResult,
  ParsedParameters,
  ElectricalValue,
  MatchDetail,
  ComponentScore,
  CacheMetadata,
  JsonSearchResult,
  JsonErrorResponse,
} from './types/index.js';

// Error classes
export { NetworkError, FileSystemError, ParsingError } from './types/index.js';

export type { LibraryInfo, SymbolInfo, KiCadCacheMetadata } from './types/kicad.js';

// Public classes
export { Application, runApplication } from './app/index.js';
export { ComponentSearchEngine } from './scoring/SearchEngine.js';
