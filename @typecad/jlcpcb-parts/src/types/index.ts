/**
 * Represents a complete JLCPCB component record from the CSV database.
 * Contains all available information about an electronic component including
 * identification, specifications, availability, and pricing.
 *
 * @interface ComponentRecord
 * @example
 * ```typescript
 * const component: ComponentRecord = {
 *   lcsc: "C25804",
 *   category: "Resistors",
 *   description: "10kΩ ±1% 0603 Thick Film Resistor",
 *   manufacturer: "UNI-ROYAL(Uniroyal Elec)",
 *   package: "0603",
 *   // ... other fields
 * };
 * ```
 */
export interface ComponentRecord {
  /** JLCPCB component identifier (e.g., "C25804") */
  lcsc: string;

  /** Internal category ID for component classification */
  category_id: string;

  /** Main component category (e.g., "Resistors", "Capacitors") */
  category: string;

  /** Detailed subcategory (e.g., "Chip Resistor - Surface Mount") */
  subcategory: string;

  /** Manufacturer part number */
  mfr: string;

  /** Component package type (e.g., "0603", "SOT-23") */
  package: string;

  /** Number of pins/joints as string */
  joints: string;

  /** Manufacturer company name */
  manufacturer: string;

  /** Basic part flag ("0" or "1") - indicates if part is in basic library */
  basic: string;

  /** Preferred part flag ("0" or "1") - indicates if part is preferred for assembly */
  preferred: string;

  /** Full component description with specifications */
  description: string;

  /** URL to component datasheet */
  datasheet: string;

  /** Current stock quantity as string */
  stock: string;

  /** Timestamp of last stock update */
  last_on_stock: string;

  /** Pricing information as JSON string */
  price: string;

  /** Additional component data as JSON string */
  extra: string;

  /** Assembly process type (e.g., "SMT", "THT") */
  assembly_process: string;

  /** Minimum order quantity as string */
  min_order_qty: string;

  /** Attrition quantity for assembly as string */
  attrition_qty: string;
}

/**
 * Represents an electrical parameter value with its unit and original text.
 * Used for storing parsed electrical values like resistance, capacitance, voltage, etc.
 *
 * @interface ElectricalValue
 * @example
 * ```typescript
 * const resistance: ElectricalValue = {
 *   value: 10000,        // Normalized to base unit (Ohms)
 *   unit: "Ω",           // Base unit symbol
 *   originalText: "10k"  // Original text from search query
 * };
 *
 * const capacitance: ElectricalValue = {
 *   value: 100e-9,       // Normalized to Farads
 *   unit: "F",           // Base unit
 *   originalText: "100nF" // Original text
 * };
 * ```
 */
export interface ElectricalValue {
  /** Numerical value normalized to base unit (e.g., Ohms, Farads, Henries) */
  value: number;

  /** Base unit symbol (e.g., "Ω", "F", "H", "V") */
  unit: string;

  /** Original text from the search query before parsing */
  originalText: string;
}

/**
 * Contains all parameters extracted from a search query.
 * Used by the fuzzy scoring algorithm to match against component specifications.
 *
 * @interface ParsedParameters
 * @example
 * ```typescript
 * // From query: "10k resistor 0603 ±1% 50V"
 * const params: ParsedParameters = {
 *   value: { value: 10000, unit: "Ω", originalText: "10k" },
 *   voltage: { value: 50, unit: "V", originalText: "50V" },
 *   tolerance: "±1%",
 *   package: "0603",
 *   componentType: "resistor",
 *   keywords: ["resistor", "thick", "film"]
 * };
 * ```
 */
export interface ParsedParameters {
  /** Voltage rating parameter (e.g., 50V, 3.3V) */
  voltage?: ElectricalValue;

  /** Primary electrical value (resistance, capacitance, inductance) */
  value?: ElectricalValue;

  /** Tolerance specification (e.g., "±1%", "±5%") */
  tolerance?: string;

  /** Component package type (e.g., "0603", "SOT-23") */
  package?: string;

  /** Component type identifier (e.g., "resistor", "capacitor") */
  componentType?: string;

  /** Additional keywords from the search query */
  keywords?: string[];
}

/**
 * Detailed information about how a specific parameter matched during scoring.
 * Used to explain why a component received a particular score.
 *
 * @interface MatchDetail
 * @example
 * ```typescript
 * const matchDetail: MatchDetail = {
 *   parameter: "resistance",
 *   score: 100,
 *   exact: true,
 *   reason: "Exact resistance match: 10kΩ"
 * };
 * ```
 */
export interface MatchDetail {
  /** Name of the parameter that was matched (e.g., "resistance", "package") */
  parameter: string;

  /** Score awarded for this parameter match (0-100+) */
  score: number;

  /** Whether this was an exact match or approximate */
  exact: boolean;

  /** Human-readable explanation of the match */
  reason: string;
}

/**
 * A component record paired with its calculated match score and detailed explanations.
 * Used internally by the scoring system before converting to SearchResult.
 *
 * @interface ComponentScore
 * @example
 * ```typescript
 * const scoredComponent: ComponentScore = {
 *   component: { lcsc: "C25804", description: "10kΩ resistor", ... },
 *   score: 185,
 *   matchDetails: [
 *     { parameter: "resistance", score: 100, exact: true, reason: "Exact match" },
 *     { parameter: "package", score: 80, exact: true, reason: "Package match: 0603" }
 *   ]
 * };
 * ```
 */
export interface ComponentScore {
  /** The component record being scored */
  component: ComponentRecord;

  /** Total calculated score for this component */
  score: number;

  /** Detailed breakdown of how the score was calculated */
  matchDetails: MatchDetail[];
}

/**
 * Final search result formatted for display to the user.
 * Contains essential component information and match summary.
 *
 * @interface SearchResult
 * @example
 * ```typescript
 * const result: SearchResult = {
 *   lcsc: "C25804",
 *   manufacturer: "UNI-ROYAL(Uniroyal Elec)",
 *   partNumber: "0603WAF1002T5E",
 *   description: "10kΩ ±1% 0603 Thick Film Resistor",
 *   package: "0603",
 *   score: 185,
 *   matchSummary: "Exact resistance match (100 pts), Package match (80 pts)"
 * };
 * ```
 */
export interface SearchResult {
  /** JLCPCB component identifier */
  lcsc: string;

  /** Component manufacturer name */
  manufacturer: string;

  /** Manufacturer's part number */
  partNumber: string;

  /** Full component description */
  description: string;

  /** Component package type */
  package: string;

  /** Total match score */
  score: number;

  /** Human-readable summary of why this component matched */
  matchSummary: string;

  /** KiCad footprint reference (e.g., "Resistor_SMD:R_0603_1608Metric") */
  footprint?: string;

  /** KiCad footprint filter strings for footprint matching */
  fpFilters?: string[];
}

/**
 * Metadata about cached component database files.
 * Used for cache validation and management.
 *
 * @interface CacheMetadata
 * @example
 * ```typescript
 * const metadata: CacheMetadata = {
 *   lastDownload: new Date('2024-01-15T10:30:00Z'),
 *   fileSize: 52428800, // ~50MB
 *   recordCount: 500000,
 *   checksum: "sha256:abc123..."
 * };
 * ```
 */
export interface CacheMetadata {
  /** Timestamp when the cache was last updated */
  lastDownload: Date;

  /** Size of the cached file in bytes */
  fileSize: number;

  /** Number of component records in the cache */
  recordCount: number;

  /** Optional checksum for cache integrity verification */
  checksum?: string;
}

export class TypeCadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TypeCadError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NetworkError extends TypeCadError {
  code?: string;
  statusCode?: number;
  constructor(message: string, code?: string, statusCode?: number) {
    super(message);
    this.name = 'NetworkError';
    this.code = code;
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class FileSystemError extends TypeCadError {
  code?: string;
  path?: string;
  constructor(message: string, code?: string, filePath?: string) {
    super(message);
    this.name = 'FileSystemError';
    this.code = code;
    this.path = filePath;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ParsingError extends TypeCadError {
  line?: number;
  column?: number;
  constructor(message: string, line?: number, column?: number) {
    super(message);
    this.name = 'ParsingError';
    this.line = line;
    this.column = column;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Clean interface for JSON output that ensures consistent serialization.
 * Contains the same essential information as SearchResult but optimized for JSON format.
 *
 * @interface JsonSearchResult
 * @example
 * ```typescript
 * const jsonResult: JsonSearchResult = {
 *   lcsc: "C25804",
 *   manufacturer: "UNI-ROYAL(Uniroyal Elec)",
 *   partNumber: "0603WAF1002T5E",
 *   description: "10kΩ ±1% 0603 Thick Film Resistor",
 *   package: "0603",
 *   score: 185.0,
 *   matchSummary: "Exact resistance match (100 pts), Package match (80 pts)"
 * };
 * ```
 */
export interface JsonSearchResult {
  /** JLCPCB component identifier */
  lcsc: string;

  /** Component manufacturer name */
  manufacturer: string;

  /** Manufacturer's part number */
  partNumber: string;

  /** Full component description */
  description: string;

  /** Component package type */
  package: string;

  /** Total match score as number */
  score: number;

  /** Human-readable summary of why this component matched */
  matchSummary: string;
}

/**
 * Structured error response for JSON output mode.
 * Provides consistent error formatting when JSON format is selected.
 *
 * @interface JsonErrorResponse
 * @example
 * ```typescript
 * const errorResponse: JsonErrorResponse = {
 *   error: true,
 *   message: "No search query provided",
 *   code: "MISSING_QUERY"
 * };
 * ```
 */
export interface JsonErrorResponse {
  /** Always true to indicate this is an error response */
  error: true;

  /** Human-readable error message */
  message: string;

  /** Optional error code for programmatic handling */
  code?: string;
}
