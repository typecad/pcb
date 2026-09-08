/**
 * Converter for transforming KiCad symbol data into ComponentRecord format
 * Maintains compatibility with the existing search engine and data structures
 */

import { ComponentRecord } from '../types/index.js';
import { ExtractedSymbol } from './KiCadSymbolExtractor.js';
import logger from '../../utils/logging.js';

/**
 * Options for controlling symbol conversion
 */
export interface ConversionOptions {
  /** Default manufacturer name for KiCad symbols */
  defaultManufacturer: string;
  /** Default package type for symbols */
  defaultPackage: string;
  /** Whether to include file path in extra data */
  includeFilePath: boolean;
  /** Whether to include processing metadata */
  includeMetadata: boolean;
  /** Custom category mapping for libraries */
  categoryMapping?: Record<string, string>;
  /** Whether to generate searchable extra data */
  generateSearchableExtra: boolean;
}

/**
 * Default conversion options
 */
const DEFAULT_CONVERSION_OPTIONS: ConversionOptions = {
  defaultManufacturer: 'KiCad',
  defaultPackage: 'Symbol',
  includeFilePath: true,
  includeMetadata: true,
  generateSearchableExtra: true,
};

/**
 * Statistics for symbol conversion operation
 */
export interface ConversionStatistics {
  /** Number of symbols converted */
  symbolsConverted: number;
  /** Number of symbols with descriptions */
  symbolsWithDescriptions: number;
  /** Number of symbols with keywords */
  symbolsWithKeywords: number;
  /** Number of unique libraries */
  uniqueLibraries: number;
  /** Conversion time in milliseconds */
  conversionTime: number;
  /** Library distribution */
  libraryDistribution: Record<string, number>;
}

/**
 * Converter for KiCad symbols to ComponentRecord format
 */
export class KiCadSymbolConverter {
  private options: ConversionOptions;
  private statistics: ConversionStatistics = {
    symbolsConverted: 0,
    symbolsWithDescriptions: 0,
    symbolsWithKeywords: 0,
    uniqueLibraries: 0,
    conversionTime: 0,
    libraryDistribution: {},
  };

  constructor(options: Partial<ConversionOptions> = {}) {
    this.options = { ...DEFAULT_CONVERSION_OPTIONS, ...options };
    this.resetStatistics();
  }

  /**
   * Convert array of extracted symbols to ComponentRecord format
   * @param extractedSymbols - Array of extracted symbols
   * @returns Array of component records
   */
  convertSymbolsToComponentRecords(extractedSymbols: ExtractedSymbol[]): ComponentRecord[] {
    const startTime = Date.now();
    this.resetStatistics();

    const componentRecords: ComponentRecord[] = [];
    const libraryCount: Record<string, number> = {};

    for (const symbol of extractedSymbols) {
      try {
        const componentRecord = this.convertSingleSymbol(symbol);
        componentRecords.push(componentRecord);

        this.statistics.symbolsConverted++;

        if (symbol.hasDescription) {
          this.statistics.symbolsWithDescriptions++;
        }

        if (symbol.hasKeywords) {
          this.statistics.symbolsWithKeywords++;
        }

        // Track library distribution
        libraryCount[symbol.library] = (libraryCount[symbol.library] || 0) + 1;
      } catch (error) {
        logger.warn(
          `Failed to convert symbol ${symbol.name} from ${symbol.library}: ${error instanceof Error ? error.message : String(error)}`,
        );
        continue;
      }
    }

    this.statistics.uniqueLibraries = Object.keys(libraryCount).length;
    this.statistics.libraryDistribution = libraryCount;
    this.statistics.conversionTime = Date.now() - startTime;

    return componentRecords;
  }

  /**
   * Convert a single extracted symbol to ComponentRecord format
   * @param symbol - Extracted symbol to convert
   * @returns Component record
   * @private
   */
  private convertSingleSymbol(symbol: ExtractedSymbol): ComponentRecord {
    // Generate unique identifier in library:symbol format
    const lcsc = `${symbol.library}:${symbol.name}`;

    // Use library as category, with optional mapping
    const category = this.options.categoryMapping?.[symbol.library] || symbol.library;

    // Build description with fallback
    const description = this.buildDescription(symbol);

    // Build extra data object
    const extraData = this.buildExtraData(symbol);

    // Create formatted timestamp
    const timestamp = new Date().toISOString();

    const componentRecord: ComponentRecord = {
      lcsc,
      category_id: symbol.library,
      category,
      subcategory: 'Schematic Symbol',
      mfr: symbol.name,
      package: this.options.defaultPackage,
      joints: '0', // Symbols don't have physical joints
      manufacturer: this.options.defaultManufacturer,
      basic: '1', // All KiCad symbols are considered basic
      preferred: '1', // All KiCad symbols are preferred for schematic use
      description,
      datasheet: '', // KiCad symbols typically don't include datasheets
      stock: '∞', // Unlimited availability for symbols
      last_on_stock: timestamp,
      price: '[]', // Free symbols
      extra: JSON.stringify(extraData),
      assembly_process: 'N/A', // Not applicable for symbols
      min_order_qty: '0',
      attrition_qty: '0',
    };

    return componentRecord;
  }

  /**
   * Build description from symbol data with fallback options
   * @param symbol - Extracted symbol
   * @returns Description string
   * @private
   */
  private buildDescription(symbol: ExtractedSymbol): string {
    const parts: string[] = [];

    // Primary description from symbol
    if (symbol.description && symbol.description.trim()) {
      parts.push(symbol.description.trim());
    }

    // Add library context if no description
    if (parts.length === 0) {
      parts.push(`Symbol from ${symbol.library} library`);
    }

    // Add keywords as additional context if available and not already in description
    if (symbol.keywords && symbol.keywords.trim()) {
      const keywords = symbol.keywords.trim();
      const description = parts[0].toLowerCase();

      // Only add keywords if they provide additional information
      if (!description.includes(keywords.toLowerCase())) {
        parts.push(`Keywords: ${keywords}`);
      }
    }

    return parts.join(' - ');
  }

  /**
   * Build extra data object with symbol metadata
   * @param symbol - Extracted symbol
   * @returns Extra data object
   * @private
   */
  private buildExtraData(symbol: ExtractedSymbol): Record<string, unknown> {
    const extraData: Record<string, unknown> = {
      symbolType: 'schematic',
      library: symbol.library,
      source: 'local_files',
    };

    // Include original description if different from processed description
    if (symbol.description) {
      extraData.originalDescription = symbol.description;
    }

    // Include keywords
    if (symbol.keywords) {
      extraData.keywords = symbol.keywords;
      // Split keywords for easier searching
      extraData.keywordList = symbol.keywords.split(/\s+/).filter((k) => k.length > 0);
    }

    // Include file metadata if enabled
    if (this.options.includeFilePath) {
      extraData.sourceFile = symbol.relativePath;
      extraData.fileModified = symbol.fileModified.toISOString();
    }

    // Include processing metadata if enabled
    if (this.options.includeMetadata) {
      extraData.hasDescription = symbol.hasDescription;
      extraData.hasKeywords = symbol.hasKeywords;
      extraData.processingDate = new Date().toISOString();
    }

    // Include searchable data if enabled
    if (this.options.generateSearchableExtra) {
      extraData.searchText = symbol.searchText;
      extraData.searchTerms = this.generateSearchTerms(symbol);
    }

    // Include all properties for advanced users
    if (symbol.properties && symbol.properties.length > 0) {
      extraData.properties = symbol.properties.map((prop) => ({
        name: prop.name,
        value: prop.value,
      }));
    }

    return extraData;
  }

  /**
   * Generate search terms from symbol data
   * @param symbol - Extracted symbol
   * @returns Array of search terms
   * @private
   */
  private generateSearchTerms(symbol: ExtractedSymbol): string[] {
    const terms = new Set<string>();

    // Add symbol name parts
    const nameParts = symbol.name.split(/[_\-\s]+/).filter((part) => part.length > 1);
    nameParts.forEach((part) => terms.add(part.toLowerCase()));

    // Add library name
    terms.add(symbol.library.toLowerCase());

    // Add description words
    if (symbol.description) {
      const descWords = symbol.description
        .split(/\s+/)
        .filter((word) => word.length > 2)
        .map((word) => word.toLowerCase().replace(/[^a-z0-9]/g, ''));
      descWords.forEach((word) => {
        if (word.length > 2) {
          terms.add(word);
        }
      });
    }

    // Add keywords
    if (symbol.keywords) {
      const keywords = symbol.keywords
        .split(/\s+/)
        .filter((keyword) => keyword.length > 1)
        .map((keyword) => keyword.toLowerCase());
      keywords.forEach((keyword) => terms.add(keyword));
    }

    return Array.from(terms);
  }

  /**
   * Get conversion statistics from the last operation
   * @returns Conversion statistics
   */
  getStatistics(): ConversionStatistics {
    return { ...this.statistics };
  }

  /**
   * Reset conversion statistics
   * @private
   */
  private resetStatistics(): void {
    this.statistics = {
      symbolsConverted: 0,
      symbolsWithDescriptions: 0,
      symbolsWithKeywords: 0,
      uniqueLibraries: 0,
      conversionTime: 0,
      libraryDistribution: {},
    };
  }

  /**
   * Get a human-readable summary of the conversion results
   * @returns Formatted summary string
   */
  getConversionSummary(): string {
    const stats = this.statistics;
    const conversionTimeSeconds = (stats.conversionTime / 1000).toFixed(2);
    const averagePerSymbol =
      stats.symbolsConverted > 0 ? (stats.conversionTime / stats.symbolsConverted).toFixed(2) : '0';

    let summary = `Conversion Summary:\n`;
    summary += `  Symbols converted: ${stats.symbolsConverted}\n`;
    summary += `  Symbols with descriptions: ${stats.symbolsWithDescriptions}\n`;
    summary += `  Symbols with keywords: ${stats.symbolsWithKeywords}\n`;
    summary += `  Unique libraries: ${stats.uniqueLibraries}\n`;
    summary += `  Conversion time: ${conversionTimeSeconds} seconds\n`;
    summary += `  Average time per symbol: ${averagePerSymbol} ms\n`;

    if (stats.uniqueLibraries > 0) {
      summary += `\nTop 10 Libraries by Symbol Count:\n`;
      const sortedLibraries = Object.entries(stats.libraryDistribution)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10);

      sortedLibraries.forEach(([library, count]) => {
        summary += `  ${library}: ${count} symbols\n`;
      });
    }

    return summary;
  }

  /**
   * Validate that a ComponentRecord is properly formatted
   * @param record - Component record to validate
   * @returns True if valid
   * @static
   */
  static validateComponentRecord(record: ComponentRecord): boolean {
    // Check required fields
    const requiredFields = ['lcsc', 'category', 'description', 'manufacturer'];
    for (const field of requiredFields) {
      if (
        !record[field as keyof ComponentRecord] ||
        String(record[field as keyof ComponentRecord]).trim().length === 0
      ) {
        return false;
      }
    }

    // Validate JSON fields
    try {
      JSON.parse(record.extra);
    } catch {
      return false;
    }

    return true;
  }
}
