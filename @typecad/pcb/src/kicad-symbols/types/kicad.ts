/**
 * KiCad-specific type definitions for the symbols integration.
 * These interfaces support the HTML parsing and data management for KiCad symbols.
 */

import { CacheMetadata } from './index.js';

/**
 * Represents metadata about a KiCad symbol library.
 * Contains information extracted from the main symbols page.
 *
 * @interface LibraryInfo
 * @example
 * ```typescript
 * const library: LibraryInfo = {
 *   name: "4xxx",
 *   url: "https://kicad.github.io/symbols/4xxx",
 *   description: "4000 series CMOS logic ICs"
 * };
 * ```
 */
export interface LibraryInfo {
  /** Library name (e.g., "4xxx", "Analog", "MCU_Microchip_ATtiny") */
  name: string;

  /** Full URL to the library's symbol page */
  url: string;

  /** Optional description of the library contents */
  description?: string;
}

/**
 * Represents an individual KiCad symbol with its metadata.
 * Contains information extracted from library symbol tables.
 *
 * @interface SymbolInfo
 * @example
 * ```typescript
 * const symbol: SymbolInfo = {
 *   library: "4xxx",
 *   symbol: "14528",
 *   description: "Dual 4-bit latch, 3-state outputs",
 *   formattedName: "4xxx:14528"
 * };
 * ```
 */
export interface SymbolInfo {
  /** Name of the library containing this symbol */
  library: string;

  /** Symbol name within the library */
  symbol: string;

  /** Description of the symbol's function or purpose */
  description: string;

  /** Formatted name in "library:symbol" format for display and search */
  formattedName: string;
}

/**
 * Extended cache metadata specifically for KiCad symbol data.
 * Includes KiCad-specific information like the "Last updated" date from the website.
 *
 * @interface KiCadCacheMetadata
 * @extends CacheMetadata
 * @example
 * ```typescript
 * const metadata: KiCadCacheMetadata = {
 *   lastDownload: new Date('2024-01-15T10:30:00Z'),
 *   fileSize: 2048000,
 *   recordCount: 15000,
 *   lastUpdatedDate: new Date('2024-01-10T00:00:00Z'),
 *   libraryCount: 150,
 *   symbolCount: 15000
 * };
 * ```
 */
export interface KiCadCacheMetadata extends CacheMetadata {
  /** Date extracted from "Last updated on [date]" text on the KiCad website */
  lastUpdatedDate: Date;

  /** Number of symbol libraries processed */
  libraryCount: number;

  /** Total number of symbols across all libraries */
  symbolCount: number;
}
