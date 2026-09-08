/**
 * Scanner for finding KiCad symbol files (.kicad_sym) in the local filesystem
 * Recursively searches through the KiCad symbols directory to locate all symbol files
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Information about a discovered symbol file
 */
export interface SymbolFileInfo {
  /** Full path to the symbol file */
  filePath: string;
  /** File name without extension */
  fileName: string;
  /** File name with extension */
  fullFileName: string;
  /** Directory containing the file */
  directory: string;
  /** Relative path from the symbols root directory */
  relativePath: string;
  /** File size in bytes */
  size: number;
  /** Last modified timestamp */
  lastModified: Date;
}

/**
 * Statistics about the symbol file scanning operation
 */
export interface ScanStatistics {
  /** Total number of .kicad_sym files found */
  totalFiles: number;
  /** Total size of all symbol files in bytes */
  totalSize: number;
  /** Number of directories scanned */
  directoriesScanned: number;
  /** Time taken for the scan in milliseconds */
  scanDuration: number;
  /** Any errors encountered during scanning */
  errors: string[];
}

/**
 * Options for controlling the symbol file scanning behavior
 */
export interface ScanOptions {
  /** Whether to include subdirectories in the scan */
  recursive: boolean;
  /** Maximum depth to scan (0 = no limit) */
  maxDepth: number;
  /** File size limit in bytes (0 = no limit) */
  maxFileSize: number;
  /** Whether to follow symbolic links */
  followSymlinks: boolean;
  /** Patterns to exclude from scanning (directory names) */
  excludePatterns: string[];
}

/**
 * Default scan options
 */
const DEFAULT_SCAN_OPTIONS: ScanOptions = {
  recursive: true,
  maxDepth: 0, // No limit
  maxFileSize: 0, // No limit
  followSymlinks: false,
  excludePatterns: ['.git', '.svn', '.hg', 'node_modules', '__pycache__'],
};

/**
 * Scanner for KiCad symbol files in the local filesystem
 */
export class KiCadSymbolFileScanner {
  private symbolsRootPath: string;
  private options: ScanOptions;
  private statistics: ScanStatistics;

  constructor(symbolsRootPath: string, options: Partial<ScanOptions> = {}) {
    this.symbolsRootPath = symbolsRootPath;
    this.options = { ...DEFAULT_SCAN_OPTIONS, ...options };
    this.statistics = {
      totalFiles: 0,
      totalSize: 0,
      directoriesScanned: 0,
      scanDuration: 0,
      errors: [],
    };
  }

  /**
   * Scan the symbols directory for all .kicad_sym files
   * @returns Promise resolving to array of symbol file information
   */
  async scanForSymbolFiles(): Promise<SymbolFileInfo[]> {
    const startTime = Date.now();
    this.resetStatistics();

    if (!fs.existsSync(this.symbolsRootPath)) {
      throw new Error(`Symbols directory does not exist: ${this.symbolsRootPath}`);
    }

    const stat = await fs.promises.stat(this.symbolsRootPath);
    if (!stat.isDirectory()) {
      throw new Error(`Symbols path is not a directory: ${this.symbolsRootPath}`);
    }

    const symbolFiles: SymbolFileInfo[] = [];

    try {
      await this.scanDirectory(this.symbolsRootPath, symbolFiles, 0);
    } catch (error) {
      const errorMessage = `Error scanning symbols directory: ${error instanceof Error ? error.message : String(error)}`;
      this.statistics.errors.push(errorMessage);
      throw new Error(errorMessage);
    }

    this.statistics.scanDuration = Date.now() - startTime;
    return symbolFiles;
  }

  /**
   * Get scanning statistics from the last scan operation
   * @returns Scan statistics
   */
  getStatistics(): ScanStatistics {
    return { ...this.statistics };
  }

  /**
   * Recursively scan a directory for symbol files
   * @param dirPath - Directory path to scan
   * @param symbolFiles - Array to collect found symbol files
   * @param currentDepth - Current scanning depth
   * @private
   */
  private async scanDirectory(dirPath: string, symbolFiles: SymbolFileInfo[], currentDepth: number): Promise<void> {
    // Check depth limit
    if (this.options.maxDepth > 0 && currentDepth >= this.options.maxDepth) {
      return;
    }

    this.statistics.directoriesScanned++;

    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        try {
          if (entry.isDirectory()) {
            // Skip excluded directories
            if (this.shouldExcludeDirectory(entry.name)) {
              continue;
            }

            // Recursively scan subdirectory if recursive option is enabled
            if (this.options.recursive) {
              await this.scanDirectory(fullPath, symbolFiles, currentDepth + 1);
            }
          } else if (entry.isFile() || (entry.isSymbolicLink() && this.options.followSymlinks)) {
            // Check if this is a .kicad_sym file
            if (this.isSymbolFile(entry.name)) {
              const fileInfo = await this.createFileInfo(fullPath);
              if (fileInfo && this.isValidFileSize(fileInfo.size)) {
                symbolFiles.push(fileInfo);
                this.statistics.totalFiles++;
                this.statistics.totalSize += fileInfo.size;
              }
            }
          }
        } catch (error) {
          const errorMessage = `Error processing ${fullPath}: ${error instanceof Error ? error.message : String(error)}`;
          this.statistics.errors.push(errorMessage);
          // Continue scanning other files
          continue;
        }
      }
    } catch (error) {
      const errorMessage = `Error reading directory ${dirPath}: ${error instanceof Error ? error.message : String(error)}`;
      this.statistics.errors.push(errorMessage);
      throw error;
    }
  }

  /**
   * Create file information object for a symbol file
   * @param filePath - Full path to the file
   * @returns File information or null if file cannot be accessed
   * @private
   */
  private async createFileInfo(filePath: string): Promise<SymbolFileInfo | null> {
    try {
      const stat = await fs.promises.stat(filePath);

      // Skip if it's not actually a file (could be a directory with .kicad_sym name)
      if (!stat.isFile()) {
        return null;
      }

      const fileName = path.basename(filePath, '.kicad_sym');
      const fullFileName = path.basename(filePath);
      const directory = path.dirname(filePath);
      const relativePath = path.relative(this.symbolsRootPath, filePath);

      return {
        filePath,
        fileName,
        fullFileName,
        directory,
        relativePath,
        size: stat.size,
        lastModified: stat.mtime,
      };
    } catch (error) {
      const errorMessage = `Cannot access file ${filePath}: ${error instanceof Error ? error.message : String(error)}`;
      this.statistics.errors.push(errorMessage);
      return null;
    }
  }

  /**
   * Check if a file is a KiCad symbol file
   * @param fileName - Name of the file
   * @returns True if it's a .kicad_sym file
   * @private
   */
  private isSymbolFile(fileName: string): boolean {
    return fileName.toLowerCase().endsWith('.kicad_sym');
  }

  /**
   * Check if a directory should be excluded from scanning
   * @param dirName - Directory name
   * @returns True if directory should be excluded
   * @private
   */
  private shouldExcludeDirectory(dirName: string): boolean {
    return this.options.excludePatterns.some((pattern) => {
      if (pattern.includes('*') || pattern.includes('?')) {
        // Simple glob pattern matching
        const regexPattern = pattern.replace(/\*/g, '.*').replace(/\?/g, '.');
        return new RegExp(`^${regexPattern}$`, 'i').test(dirName);
      } else {
        // Exact match (case insensitive)
        return dirName.toLowerCase() === pattern.toLowerCase();
      }
    });
  }

  /**
   * Check if file size is within acceptable limits
   * @param fileSize - Size of the file in bytes
   * @returns True if file size is acceptable
   * @private
   */
  private isValidFileSize(fileSize: number): boolean {
    if (this.options.maxFileSize <= 0) {
      return true; // No size limit
    }
    return fileSize <= this.options.maxFileSize;
  }

  /**
   * Reset scanning statistics
   * @private
   */
  private resetStatistics(): void {
    this.statistics = {
      totalFiles: 0,
      totalSize: 0,
      directoriesScanned: 0,
      scanDuration: 0,
      errors: [],
    };
  }

  /**
   * Get a human-readable summary of the scan results
   * @returns Formatted summary string
   */
  getScanSummary(): string {
    const stats = this.statistics;
    const sizeInMB = (stats.totalSize / (1024 * 1024)).toFixed(2);
    const durationInSeconds = (stats.scanDuration / 1000).toFixed(2);

    let summary = `Scan Summary:\n`;
    summary += `  Files found: ${stats.totalFiles}\n`;
    summary += `  Total size: ${sizeInMB} MB\n`;
    summary += `  Directories scanned: ${stats.directoriesScanned}\n`;
    summary += `  Scan duration: ${durationInSeconds} seconds\n`;

    if (stats.errors.length > 0) {
      summary += `  Errors encountered: ${stats.errors.length}\n`;
      if (stats.errors.length <= 5) {
        summary += `  Error details:\n`;
        stats.errors.forEach((error) => {
          summary += `    - ${error}\n`;
        });
      } else {
        summary += `  First 5 errors:\n`;
        stats.errors.slice(0, 5).forEach((error) => {
          summary += `    - ${error}\n`;
        });
        summary += `    ... and ${stats.errors.length - 5} more errors\n`;
      }
    }

    return summary;
  }
}
