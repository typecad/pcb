/**
 * Extractor for processing KiCad symbol files and extracting symbol definitions
 * Combines file reading with S-Expression parsing to extract structured symbol data
 */

import fs from 'node:fs';
import path from 'node:path';
import { parse, Sym } from '../../sexpr/index.js';
import type { SExpr } from '../../sexpr/types.js';
import { SymbolFileInfo } from './KiCadSymbolFileScanner.js';

/**
 * Represents a parsed KiCad symbol property
 */
export interface SymbolProperty {
  name: string;
  value: string;
}

/**
 * Represents a complete KiCad symbol definition
 */
export interface KiCadParsedSymbol {
  name: string;
  properties: SymbolProperty[];
  description?: string;
  keywords?: string;
  library?: string;
}

/**
 * Extended symbol information including file metadata
 */
export interface ExtractedSymbol extends KiCadParsedSymbol {
  /** Library name derived from file name */
  library: string;
  /** Source file path */
  sourceFile: string;
  /** Relative path from symbols root */
  relativePath: string;
  /** File last modified date */
  fileModified: Date;
  /** Whether this symbol has a description */
  hasDescription: boolean;
  /** Whether this symbol has keywords */
  hasKeywords: boolean;
  /** Combined search text (description + keywords) */
  searchText: string;
}

/**
 * Statistics for symbol extraction operation
 */
export interface ExtractionStatistics {
  /** Number of files processed */
  filesProcessed: number;
  /** Number of files that failed to process */
  filesWithErrors: number;
  /** Total number of symbols extracted */
  symbolsExtracted: number;
  /** Number of symbols with descriptions */
  symbolsWithDescriptions: number;
  /** Number of symbols with keywords */
  symbolsWithKeywords: number;
  /** Processing time in milliseconds */
  processingTime: number;
  /** List of processing errors */
  errors: ExtractionError[];
}

/**
 * Error information for failed extractions
 */
export interface ExtractionError {
  /** File that caused the error */
  file: string;
  /** Error message */
  message: string;
  /** Symbol name if applicable */
  symbolName?: string;
  /** Error type */
  type: 'parse_error' | 'file_read_error' | 'invalid_format' | 'encoding_error';
}

/**
 * Options for controlling symbol extraction
 */
export interface ExtractionOptions {
  /** Whether to include symbols without descriptions */
  includeWithoutDescription: boolean;
  /** Whether to include symbols without keywords */
  includeWithoutKeywords: boolean;
  /** Maximum file size to process in bytes (0 = no limit) */
  maxFileSize: number;
  /** Text encoding to use when reading files */
  encoding: BufferEncoding;
  /** Whether to continue processing on errors */
  continueOnError: boolean;
  /** Validate symbol definitions strictly */
  strictValidation: boolean;
}

/**
 * Default extraction options
 */
const DEFAULT_EXTRACTION_OPTIONS: ExtractionOptions = {
  includeWithoutDescription: true,
  includeWithoutKeywords: true,
  maxFileSize: 10 * 1024 * 1024, // 10MB limit
  encoding: 'utf8',
  continueOnError: true,
  strictValidation: false,
};

/**
 * KiCad symbol extractor for processing symbol files
 */
export class KiCadSymbolExtractor {
  private options: ExtractionOptions;
  private statistics: ExtractionStatistics = {
    filesProcessed: 0,
    filesWithErrors: 0,
    symbolsExtracted: 0,
    symbolsWithDescriptions: 0,
    symbolsWithKeywords: 0,
    processingTime: 0,
    errors: [],
  };

  constructor(options: Partial<ExtractionOptions> = {}) {
    this.options = { ...DEFAULT_EXTRACTION_OPTIONS, ...options };
    this.resetStatistics();
  }

  /**
   * Extract symbols from a list of symbol files
   * @param symbolFiles - Array of symbol file information
   * @returns Promise resolving to array of extracted symbols
   */
  async extractSymbolsFromFiles(symbolFiles: SymbolFileInfo[]): Promise<ExtractedSymbol[]> {
    const startTime = Date.now();
    this.resetStatistics();

    const extractedSymbols: ExtractedSymbol[] = [];

    for (const fileInfo of symbolFiles) {
      try {
        const symbols = await this.extractSymbolsFromFile(fileInfo);
        extractedSymbols.push(...symbols);
        this.statistics.filesProcessed++;
      } catch (error) {
        this.handleFileError(fileInfo, error);
        if (!this.options.continueOnError) {
          throw error;
        }
      }
    }

    this.statistics.processingTime = Date.now() - startTime;
    return extractedSymbols;
  }

  /**
   * Extract symbols from a single file
   * @param fileInfo - Information about the symbol file
   * @returns Promise resolving to array of extracted symbols from the file
   */
  async extractSymbolsFromFile(fileInfo: SymbolFileInfo): Promise<ExtractedSymbol[]> {
    // Check file size limit
    if (this.options.maxFileSize > 0 && fileInfo.size > this.options.maxFileSize) {
      throw new Error(`File size (${fileInfo.size} bytes) exceeds limit (${this.options.maxFileSize} bytes)`);
    }

    // Read file content
    let content: string;
    try {
      content = await fs.promises.readFile(fileInfo.filePath, { encoding: this.options.encoding });
    } catch (error) {
      throw new Error(`Failed to read file: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Parse symbols from file content using fast-sexpr
    let symbolDefinitions: KiCadParsedSymbol[];
    try {
      symbolDefinitions = this.parseSymbols(content);
    } catch (error) {
      throw new Error(`Failed to parse symbols: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Convert to extracted symbols
    const extractedSymbols: ExtractedSymbol[] = [];
    const libraryName = this.extractLibraryName(fileInfo);

    for (const symbolDef of symbolDefinitions) {
      try {
        const extractedSymbol = this.createExtractedSymbol(symbolDef, fileInfo, libraryName);

        // Apply filtering based on options
        if (this.shouldIncludeSymbol(extractedSymbol)) {
          extractedSymbols.push(extractedSymbol);
          this.statistics.symbolsExtracted++;

          if (extractedSymbol.hasDescription) {
            this.statistics.symbolsWithDescriptions++;
          }
          if (extractedSymbol.hasKeywords) {
            this.statistics.symbolsWithKeywords++;
          }
        }
      } catch (error) {
        const extractionError: ExtractionError = {
          file: fileInfo.filePath,
          message: error instanceof Error ? error.message : String(error),
          symbolName: symbolDef.name,
          type: 'invalid_format',
        };
        this.statistics.errors.push(extractionError);

        if (!this.options.continueOnError) {
          throw error;
        }
      }
    }

    return extractedSymbols;
  }

  /**
   * Get extraction statistics from the last operation
   * @returns Extraction statistics
   */
  getStatistics(): ExtractionStatistics {
    return { ...this.statistics };
  }

  /**
   * Parse KiCad symbol file content using fast-sexpr
   * @param content - File content as string
   * @returns Array of parsed symbol definitions
   * @private
   */
  private parseSymbols(content: string): KiCadParsedSymbol[] {
    const parsed = parse(content);
    if (!Array.isArray(parsed)) {
      throw new Error('Invalid KiCad symbol file: Root element must be a list');
    }

    const symbols: KiCadParsedSymbol[] = [];
    for (const item of parsed) {
      if (Array.isArray(item) && item.length > 1 && Sym.isSym(item[0]) && item[0].name === 'symbol') {
        const symbolDef = this.parseSymbolDefinition(item);
        if (symbolDef) {
          symbols.push(symbolDef);
        }
      }
    }
    return symbols;
  }

  /**
   * Parse a symbol definition from a fast-sexpr AST node
   * @param symbolNode - The symbol array node
   * @returns Parsed symbol definition or null
   * @private
   */
  private parseSymbolDefinition(symbolNode: SExpr[]): KiCadParsedSymbol | null {
    if (symbolNode.length < 2) return null;

    const symbolName = String(symbolNode[1]);
    const properties: SymbolProperty[] = [];
    let description: string | undefined;
    let keywords: string | undefined;

    for (let i = 2; i < symbolNode.length; i++) {
      const child = symbolNode[i];
      if (Array.isArray(child) && child.length > 0 && Sym.isSym(child[0]) && child[0].name === 'property') {
        if (child.length >= 3) {
          const propName = String(child[1]);
          const propValue = String(child[2]);
          properties.push({ name: propName, value: propValue });

          if (propName === 'Description') {
            description = propValue;
          } else if (propName === 'ki_keywords') {
            keywords = propValue;
          }
        }
      }
    }

    return { name: symbolName, properties, description, keywords };
  }

  /**
   * Create an ExtractedSymbol from a KiCadParsedSymbol
   * @param symbolDef - Symbol definition from parser
   * @param fileInfo - File information
   * @param libraryName - Library name derived from file
   * @returns Extended symbol with metadata
   * @private
   */
  private createExtractedSymbol(
    symbolDef: KiCadParsedSymbol,
    fileInfo: SymbolFileInfo,
    libraryName: string,
  ): ExtractedSymbol {
    const hasDescription = Boolean(symbolDef.description && symbolDef.description.trim().length > 0);
    const hasKeywords = Boolean(symbolDef.keywords && symbolDef.keywords.trim().length > 0);

    // Create combined search text
    const searchParts: string[] = [];
    if (symbolDef.description) {
      searchParts.push(symbolDef.description);
    }
    if (symbolDef.keywords) {
      searchParts.push(symbolDef.keywords);
    }
    searchParts.push(symbolDef.name);
    searchParts.push(libraryName);

    const searchText = searchParts.join(' ').toLowerCase();

    return {
      ...symbolDef,
      library: libraryName,
      sourceFile: fileInfo.filePath,
      relativePath: fileInfo.relativePath,
      fileModified: fileInfo.lastModified,
      hasDescription,
      hasKeywords,
      searchText,
    };
  }

  /**
   * Extract library name from file information
   * @param fileInfo - File information
   * @returns Library name
   * @private
   */
  private extractLibraryName(fileInfo: SymbolFileInfo): string {
    // Use the file name without extension as the library name
    return fileInfo.fileName;
  }

  /**
   * Check if a symbol should be included based on options
   * @param symbol - Symbol to check
   * @returns True if symbol should be included
   * @private
   */
  private shouldIncludeSymbol(symbol: ExtractedSymbol): boolean {
    if (!this.options.includeWithoutDescription && !symbol.hasDescription) {
      return false;
    }

    if (!this.options.includeWithoutKeywords && !symbol.hasKeywords) {
      return false;
    }

    // Additional validation if strict mode is enabled
    if (this.options.strictValidation) {
      if (!symbol.name || symbol.name.trim().length === 0) {
        return false;
      }
    }

    return true;
  }

  /**
   * Handle file processing errors
   * @param fileInfo - File that caused the error
   * @param error - Error that occurred
   * @private
   */
  private handleFileError(fileInfo: SymbolFileInfo, error: unknown): void {
    this.statistics.filesWithErrors++;

    let errorType: ExtractionError['type'] = 'parse_error';
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes('Failed to read file')) {
      errorType = 'file_read_error';
    } else if (errorMessage.includes('encoding') || errorMessage.includes('decode')) {
      errorType = 'encoding_error';
    } else if (errorMessage.includes('Invalid KiCad symbol file')) {
      errorType = 'invalid_format';
    }

    const extractionError: ExtractionError = {
      file: fileInfo.filePath,
      message: errorMessage,
      type: errorType,
    };

    this.statistics.errors.push(extractionError);
  }

  /**
   * Reset extraction statistics
   * @private
   */
  private resetStatistics(): void {
    this.statistics = {
      filesProcessed: 0,
      filesWithErrors: 0,
      symbolsExtracted: 0,
      symbolsWithDescriptions: 0,
      symbolsWithKeywords: 0,
      processingTime: 0,
      errors: [],
    };
  }

  /**
   * Get a human-readable summary of the extraction results
   * @returns Formatted summary string
   */
  getExtractionSummary(): string {
    const stats = this.statistics;
    const processingTimeSeconds = (stats.processingTime / 1000).toFixed(2);
    const successRate =
      stats.filesProcessed > 0
        ? (((stats.filesProcessed - stats.filesWithErrors) / stats.filesProcessed) * 100).toFixed(1)
        : '0';

    let summary = `Extraction Summary:\n`;
    summary += `  Files processed: ${stats.filesProcessed}\n`;
    summary += `  Files with errors: ${stats.filesWithErrors}\n`;
    summary += `  Success rate: ${successRate}%\n`;
    summary += `  Symbols extracted: ${stats.symbolsExtracted}\n`;
    summary += `  Symbols with descriptions: ${stats.symbolsWithDescriptions}\n`;
    summary += `  Symbols with keywords: ${stats.symbolsWithKeywords}\n`;
    summary += `  Processing time: ${processingTimeSeconds} seconds\n`;

    if (stats.errors.length > 0) {
      summary += `\nErrors encountered:\n`;
      const errorsByType = this.groupErrorsByType();
      for (const [type, count] of Object.entries(errorsByType)) {
        summary += `  ${type}: ${count}\n`;
      }

      if (stats.errors.length <= 3) {
        summary += `\nError details:\n`;
        stats.errors.forEach((error) => {
          summary += `  - ${path.basename(error.file)}: ${error.message}\n`;
        });
      }
    }

    return summary;
  }

  /**
   * Group errors by type for summary reporting
   * @returns Object with error counts by type
   * @private
   */
  private groupErrorsByType(): Record<string, number> {
    const errorCounts: Record<string, number> = {};

    for (const error of this.statistics.errors) {
      errorCounts[error.type] = (errorCounts[error.type] || 0) + 1;
    }

    return errorCounts;
  }
}
