/**
 * Local data processor for KiCad symbol files
 * Orchestrates the complete pipeline from symbol discovery to data extraction
 */

import { KiCAD } from '../../kicad.js';
import { KiCadSymbolFileScanner, SymbolFileInfo, ScanOptions } from './KiCadSymbolFileScanner.js';
import { KiCadSymbolExtractor, ExtractedSymbol, ExtractionOptions } from './KiCadSymbolExtractor.js';

/**
 * Progress information for the processing operation
 */
export interface ProcessingProgress {
  /** Current phase of processing */
  phase: 'initializing' | 'scanning' | 'extracting' | 'converting' | 'completed' | 'error';
  /** Current step within the phase */
  step: string;
  /** Progress percentage (0-100) */
  percentage: number;
  /** Number of files processed so far */
  filesProcessed: number;
  /** Total number of files to process */
  totalFiles: number;
  /** Number of symbols extracted so far */
  symbolsExtracted: number;
  /** Estimated time remaining in milliseconds */
  estimatedTimeRemaining?: number;
}

/**
 * Overall processing statistics
 */
export interface ProcessingStatistics {
  /** Total processing time in milliseconds */
  totalProcessingTime: number;
  /** KiCad installation path found */
  kicadPath?: string;
  /** Symbols directory path used */
  symbolsPath?: string;
  /** File scanning statistics */
  scanStats: {
    filesFound: number;
    directoriesScanned: number;
    scanTime: number;
    errors: string[];
  };
  /** Symbol extraction statistics */
  extractionStats: {
    filesProcessed: number;
    filesWithErrors: number;
    symbolsExtracted: number;
    symbolsWithDescriptions: number;
    symbolsWithKeywords: number;
    extractionTime: number;
    errors: string[];
  };
}

/**
 * Configuration for local data processing
 */
export interface ProcessingConfig {
  /** Custom KiCad symbols path (overrides auto-detection) */
  customSymbolsPath?: string;
  /** Scan options for file discovery */
  scanOptions?: Partial<ScanOptions>;
  /** Extraction options for symbol processing */
  extractionOptions?: Partial<ExtractionOptions>;
  /** Whether to enable progress callbacks */
  enableProgress: boolean;
  /** Progress callback interval in milliseconds */
  progressInterval: number;
}

/**
 * Default processing configuration
 */
const DEFAULT_PROCESSING_CONFIG: ProcessingConfig = {
  scanOptions: {
    recursive: true,
    maxDepth: 10,
    followSymlinks: false,
    excludePatterns: ['.git', '.svn', '__pycache__', 'backup', 'cache'],
  },
  extractionOptions: {
    includeWithoutDescription: true,
    includeWithoutKeywords: true,
    continueOnError: true,
    strictValidation: false,
  },
  enableProgress: true,
  progressInterval: 1000,
};

/**
 * Progress callback function type
 */
export type ProgressCallback = (progress: ProcessingProgress) => void;

/**
 * Local data processor for KiCad symbols
 */
export class KiCadLocalDataProcessor {
  private kicad: KiCAD;
  private config: ProcessingConfig;
  private progressCallback?: ProgressCallback;
  private statistics: ProcessingStatistics;
  private startTime: number = 0;

  constructor(config: Partial<ProcessingConfig> = {}) {
    this.kicad = KiCAD.instance;
    this.config = { ...DEFAULT_PROCESSING_CONFIG, ...config };
    this.statistics = this.initializeStatistics();
  }

  /**
   * Process all local KiCad symbol files and extract symbol data
   * @param progressCallback - Optional callback for progress updates
   * @returns Promise resolving to array of extracted symbols
   */
  async processLocalSymbols(progressCallback?: ProgressCallback): Promise<ExtractedSymbol[]> {
    this.startTime = Date.now();
    this.progressCallback = progressCallback;
    this.statistics = this.initializeStatistics();

    try {
      // Phase 1: Initialize and check KiCad installation
      this.reportProgress({
        phase: 'initializing',
        step: 'Checking KiCad installation',
        percentage: 5,
        filesProcessed: 0,
        totalFiles: 0,
        symbolsExtracted: 0,
      });

      const symbolsPath = await this.findSymbolsPath();
      this.statistics.symbolsPath = symbolsPath;

      // Phase 2: Scan for symbol files
      this.reportProgress({
        phase: 'scanning',
        step: 'Scanning for symbol files',
        percentage: 10,
        filesProcessed: 0,
        totalFiles: 0,
        symbolsExtracted: 0,
      });

      const symbolFiles = await this.scanForSymbolFiles(symbolsPath);
      this.updateScanStatistics(symbolFiles);

      // Phase 3: Extract symbols from files
      this.reportProgress({
        phase: 'extracting',
        step: 'Extracting symbol definitions',
        percentage: 20,
        filesProcessed: 0,
        totalFiles: symbolFiles.length,
        symbolsExtracted: 0,
      });

      const extractedSymbols = await this.extractSymbols(symbolFiles);
      this.updateExtractionStatistics();

      // Phase 4: Complete
      this.reportProgress({
        phase: 'completed',
        step: 'Processing completed successfully',
        percentage: 100,
        filesProcessed: symbolFiles.length,
        totalFiles: symbolFiles.length,
        symbolsExtracted: extractedSymbols.length,
      });

      this.statistics.totalProcessingTime = Date.now() - this.startTime;
      return extractedSymbols;
    } catch (error) {
      this.reportProgress({
        phase: 'error',
        step: `Error: ${error instanceof Error ? error.message : String(error)}`,
        percentage: 0,
        filesProcessed: 0,
        totalFiles: 0,
        symbolsExtracted: 0,
      });

      this.statistics.totalProcessingTime = Date.now() - this.startTime;
      throw error;
    }
  }

  /**
   * Get processing statistics from the last operation
   * @returns Processing statistics
   */
  getStatistics(): ProcessingStatistics {
    return { ...this.statistics };
  }

  /**
   * Check if local KiCad symbols are available
   * @returns Promise resolving to true if symbols are available
   */
  async areLocalSymbolsAvailable(): Promise<boolean> {
    try {
      const symbolsPath = await this.findSymbolsPath();
      return this.kicad.hasLocalSymbols();
    } catch (error) {
      return false;
    }
  }

  /**
   * Get the path to KiCad symbols directory
   * @returns Promise resolving to symbols path
   */
  async getSymbolsPath(): Promise<string> {
    return await this.findSymbolsPath();
  }

  /**
   * Find the KiCad symbols directory path
   * @returns Promise resolving to symbols directory path
   * @private
   */
  private async findSymbolsPath(): Promise<string> {
    // Use custom path if provided
    if (this.config.customSymbolsPath) {
      return this.config.customSymbolsPath;
    }

    // Use auto-detected path
    const symbolsPath = this.kicad.getSymbolsPath();
    if (!symbolsPath) {
      throw new Error('KiCad installation not found or symbols directory not accessible');
    }

    this.statistics.kicadPath = symbolsPath;
    return symbolsPath;
  }

  /**
   * Scan for symbol files in the symbols directory
   * @param symbolsPath - Path to symbols directory
   * @returns Promise resolving to array of symbol file information
   * @private
   */
  private async scanForSymbolFiles(symbolsPath: string): Promise<SymbolFileInfo[]> {
    const scanner = new KiCadSymbolFileScanner(symbolsPath, this.config.scanOptions);

    const scanStartTime = Date.now();
    const symbolFiles = await scanner.scanForSymbolFiles();
    const scanStats = scanner.getStatistics();

    this.reportProgress({
      phase: 'scanning',
      step: `Found ${symbolFiles.length} symbol files`,
      percentage: 15,
      filesProcessed: 0,
      totalFiles: symbolFiles.length,
      symbolsExtracted: 0,
    });

    this.statistics.scanStats = {
      filesFound: scanStats.totalFiles,
      directoriesScanned: scanStats.directoriesScanned,
      scanTime: Date.now() - scanStartTime,
      errors: scanStats.errors,
    };

    return symbolFiles;
  }

  /**
   * Extract symbols from symbol files with progress reporting
   * @param symbolFiles - Array of symbol files to process
   * @returns Promise resolving to array of extracted symbols
   * @private
   */
  private async extractSymbols(symbolFiles: SymbolFileInfo[]): Promise<ExtractedSymbol[]> {
    const extractor = new KiCadSymbolExtractor(this.config.extractionOptions);
    const extractedSymbols: ExtractedSymbol[] = [];

    let progressInterval: NodeJS.Timeout | undefined;
    let lastProgressTime = Date.now();

    // Set up progress reporting for extraction
    if (this.config.enableProgress && this.progressCallback) {
      progressInterval = setInterval(() => {
        const progress = this.calculateExtractionProgress(extractedSymbols.length, symbolFiles.length);
        this.reportProgress(progress);
      }, this.config.progressInterval);
    }

    try {
      // Process files in batches for better progress reporting
      const batchSize = Math.max(1, Math.floor(symbolFiles.length / 20)); // 20 progress updates

      for (let i = 0; i < symbolFiles.length; i += batchSize) {
        const batch = symbolFiles.slice(i, i + batchSize);
        const batchSymbols = await extractor.extractSymbolsFromFiles(batch);
        extractedSymbols.push(...batchSymbols);

        // Report progress
        if (this.config.enableProgress && Date.now() - lastProgressTime > 500) {
          const progress = this.calculateExtractionProgress(
            i + batch.length,
            symbolFiles.length,
            extractedSymbols.length,
          );
          this.reportProgress(progress);
          lastProgressTime = Date.now();
        }
      }

      return extractedSymbols;
    } finally {
      if (progressInterval) {
        clearInterval(progressInterval);
      }
    }
  }

  /**
   * Calculate extraction progress information
   * @param filesProcessed - Number of files processed
   * @param totalFiles - Total number of files
   * @param symbolsExtracted - Number of symbols extracted
   * @returns Progress information
   * @private
   */
  private calculateExtractionProgress(
    filesProcessed: number,
    totalFiles: number,
    symbolsExtracted: number = 0,
  ): ProcessingProgress {
    const percentage = Math.min(95, 20 + (filesProcessed / totalFiles) * 75);
    const elapsedTime = Date.now() - this.startTime;
    const estimatedTotal = totalFiles > 0 ? (elapsedTime / filesProcessed) * totalFiles : 0;
    const estimatedTimeRemaining = Math.max(0, estimatedTotal - elapsedTime);

    return {
      phase: 'extracting',
      step: `Processing file ${filesProcessed} of ${totalFiles}`,
      percentage,
      filesProcessed,
      totalFiles,
      symbolsExtracted,
      estimatedTimeRemaining,
    };
  }

  /**
   * Report progress to callback if available
   * @param progress - Progress information
   * @private
   */
  private reportProgress(progress: ProcessingProgress): void {
    if (this.progressCallback) {
      this.progressCallback(progress);
    }
  }

  /**
   * Update scan statistics from scanner results
   * @param symbolFiles - Symbol files found
   * @private
   */
  private updateScanStatistics(symbolFiles: SymbolFileInfo[]): void {
    // Statistics are updated in scanForSymbolFiles method
  }

  /**
   * Update extraction statistics from extractor results
   * @private
   */
  private updateExtractionStatistics(): void {
    // Statistics are updated during extraction process
  }

  /**
   * Initialize processing statistics
   * @returns Initial statistics object
   * @private
   */
  private initializeStatistics(): ProcessingStatistics {
    return {
      totalProcessingTime: 0,
      scanStats: {
        filesFound: 0,
        directoriesScanned: 0,
        scanTime: 0,
        errors: [],
      },
      extractionStats: {
        filesProcessed: 0,
        filesWithErrors: 0,
        symbolsExtracted: 0,
        symbolsWithDescriptions: 0,
        symbolsWithKeywords: 0,
        extractionTime: 0,
        errors: [],
      },
    };
  }

  /**
   * Get a human-readable summary of the processing results
   * @returns Formatted summary string
   */
  getProcessingSummary(): string {
    const stats = this.statistics;
    const totalTimeSeconds = (stats.totalProcessingTime / 1000).toFixed(2);
    const scanTimeSeconds = (stats.scanStats.scanTime / 1000).toFixed(2);
    const extractionTimeSeconds = (stats.extractionStats.extractionTime / 1000).toFixed(2);

    let summary = `KiCad Local Processing Summary:\n`;
    summary += `  Total processing time: ${totalTimeSeconds} seconds\n`;
    summary += `  KiCad path: ${stats.kicadPath || 'Not detected'}\n`;
    summary += `  Symbols path: ${stats.symbolsPath || 'Not found'}\n\n`;

    summary += `Scanning Results:\n`;
    summary += `  Files found: ${stats.scanStats.filesFound}\n`;
    summary += `  Directories scanned: ${stats.scanStats.directoriesScanned}\n`;
    summary += `  Scan time: ${scanTimeSeconds} seconds\n`;
    summary += `  Scan errors: ${stats.scanStats.errors.length}\n\n`;

    summary += `Extraction Results:\n`;
    summary += `  Files processed: ${stats.extractionStats.filesProcessed}\n`;
    summary += `  Files with errors: ${stats.extractionStats.filesWithErrors}\n`;
    summary += `  Symbols extracted: ${stats.extractionStats.symbolsExtracted}\n`;
    summary += `  Symbols with descriptions: ${stats.extractionStats.symbolsWithDescriptions}\n`;
    summary += `  Symbols with keywords: ${stats.extractionStats.symbolsWithKeywords}\n`;
    summary += `  Extraction time: ${extractionTimeSeconds} seconds\n`;

    const totalErrors = stats.scanStats.errors.length + stats.extractionStats.errors.length;
    if (totalErrors > 0) {
      summary += `\nTotal errors encountered: ${totalErrors}\n`;
    }

    return summary;
  }
}
