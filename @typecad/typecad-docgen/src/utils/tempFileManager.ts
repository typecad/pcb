import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import * as os from 'os';
import { promisify } from 'util';

// Convert callback-based fs functions to promise-based
const unlinkAsync = promisify(fs.unlink);
const rmdirAsync = promisify(fs.rmdir);
const mkdirAsync = promisify(fs.mkdir);
const writeFileAsync = promisify(fs.writeFile);
const copyFileAsync = promisify(fs.copyFile);
const statAsync = promisify(fs.stat);
const readdirAsync = promisify(fs.readdir);

async function pathExists(filePath: string): Promise<boolean> {
    try {
        await fs.promises.stat(filePath);
        return true;
    } catch {
        return false;
    }
}

/**
 * Manages temporary files and directories
 */
export class TempFileManager {
  private tempFiles: Set<string> = new Set();
  private tempDirs: Set<string> = new Set();
  private baseDir: string;
  private prefix: string;

  /**
   * Creates a new TempFileManager
   * @param baseDir Base directory for temp files
   * @param prefix Prefix for temp files
   */
  constructor(baseDir?: string, prefix: string = 'typecad-') {
    this.baseDir = baseDir || path.join(os.tmpdir(), 'typecad-temp-' + uuidv4().slice(0, 8));
    this.prefix = prefix;
    
    // Create the base directory if it doesn't exist
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
      this.tempDirs.add(this.baseDir);
    }
    
    // Set up cleanup on process exit
    process.on('exit', () => {
      this.cleanupAllSync();
    });
    
    process.on('SIGINT', () => {
      this.cleanupAllSync();
      process.exit(0);
    });
  }

  /**
   * Creates a temporary file path (doesn't create the file itself)
   * @param extension File extension (e.g., '.svg', '.png')
   * @param subDir Optional subdirectory within the base temp directory
   * @returns Path to the temporary file
   */
  createTempFilePath(extension: string, subDir?: string): string {
    const targetDir = subDir 
      ? this.createTempDir(subDir) 
      : this.baseDir;
    
    const filename = `${this.prefix}${uuidv4()}${extension}`;
    const filepath = path.join(targetDir, filename);
    this.tempFiles.add(filepath);
    return filepath;
  }

  /**
   * Creates a temporary directory
   * @param name Optional name for the directory
   * @returns Path to the created directory
   */
  createTempDir(name?: string): string {
    const dirName = name || `${this.prefix}dir-${uuidv4().slice(0, 8)}`;
    const dirPath = path.join(this.baseDir, dirName);
    
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    
    this.tempDirs.add(dirPath);
    return dirPath;
  }

  /**
   * Creates a temporary directory asynchronously
   * @param name Optional name for the directory
   * @returns Promise resolving to the path of the created directory
   */
  async createTempDirAsync(name?: string): Promise<string> {
    const dirName = name || `${this.prefix}dir-${uuidv4().slice(0, 8)}`;
    const dirPath = path.join(this.baseDir, dirName);
    
    const exists = await pathExists(dirPath);
    if (!exists) {
      await mkdirAsync(dirPath, { recursive: true });
    }
    
    this.tempDirs.add(dirPath);
    return dirPath;
  }

  /**
   * Writes data to a temporary file and returns its path
   * @param data The data to write
   * @param extension File extension
   * @param subDir Optional subdirectory
   * @returns Path to the created file
   */
  writeTempFile(data: string | Buffer, extension: string, subDir?: string): string {
    const filepath = this.createTempFilePath(extension, subDir);
    fs.writeFileSync(filepath, data);
    return filepath;
  }

  /**
   * Writes data to a temporary file asynchronously and returns its path
   * @param data The data to write
   * @param extension File extension
   * @param subDir Optional subdirectory
   * @returns Promise resolving to the path of the created file
   */
  async writeTempFileAsync(data: string | Buffer, extension: string, subDir?: string): Promise<string> {
    const filepath = this.createTempFilePath(extension, subDir);
    await writeFileAsync(filepath, data);
    return filepath;
  }

  /**
   * Copies a file to a temporary location
   * @param sourcePath Source file path
   * @param extension File extension for the temp file
   * @returns Path to the temporary copy
   */
  copyToTemp(sourcePath: string, extension?: string): string {
    const ext = extension || path.extname(sourcePath);
    const tempPath = this.createTempFilePath(ext);
    fs.copyFileSync(sourcePath, tempPath);
    return tempPath;
  }

  /**
   * Copies a file to a temporary location asynchronously
   * @param sourcePath Source file path
   * @param extension File extension for the temp file
   * @returns Promise resolving to the path of the temporary copy
   */
  async copyToTempAsync(sourcePath: string, extension?: string): Promise<string> {
    const ext = extension || path.extname(sourcePath);
    const tempPath = this.createTempFilePath(ext);
    await copyFileAsync(sourcePath, tempPath);
    return tempPath;
  }

  /**
   * Creates a tracked output file - if in the temp directory it will be cleaned up,
   * otherwise it will remain after processing
   * @param outputPath Desired output path
   * @param createDir Whether to create the directory if it doesn't exist
   * @returns The output path, marked for cleanup if within temp directory
   */
  createOutputPath(outputPath: string, createDir: boolean = true): string {
    const outputDir = path.dirname(outputPath);
    
    // Create directory if needed
    if (createDir && !fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // If the path is within our temp directory, track it for cleanup
    if (outputPath.startsWith(this.baseDir)) {
      this.tempFiles.add(outputPath);
    }
    
    return outputPath;
  }

  /**
   * Creates a tracked output file asynchronously
   * @param outputPath Desired output path
   * @param createDir Whether to create the directory if it doesn't exist
   * @returns Promise resolving to the output path
   */
  async createOutputPathAsync(outputPath: string, createDir: boolean = true): Promise<string> {
    const outputDir = path.dirname(outputPath);
    
    // Create directory if needed
    if (createDir) {
      const exists = await pathExists(outputDir);
      if (!exists) {
        await mkdirAsync(outputDir, { recursive: true });
      }
    }
    
    // If the path is within our temp directory, track it for cleanup
    if (outputPath.startsWith(this.baseDir)) {
      this.tempFiles.add(outputPath);
    }
    
    return outputPath;
  }

  /**
   * Tracks an existing file for cleanup
   * @param filepath Path to the file
   */
  trackFile(filepath: string): void {
    if (fs.existsSync(filepath)) {
      this.tempFiles.add(filepath);
    }
  }

  /**
   * Tracks an existing directory for cleanup
   * @param dirpath Path to the directory
   */
  trackDirectory(dirpath: string): void {
    if (fs.existsSync(dirpath)) {
      this.tempDirs.add(dirpath);
    }
  }

  /**
   * Cleans up a specific temporary file
   * @param filepath Path to the file to clean up
   */
  cleanupFile(filepath: string): void {
    try {
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
      this.tempFiles.delete(filepath);
    } catch (error) {
      console.error(`Error cleaning up file ${filepath}:`, error);
    }
  }

  /**
   * Cleans up a specific temporary file asynchronously
   * @param filepath Path to the file to clean up
   * @returns Promise that resolves when the file is cleaned up
   */
  async cleanupFileAsync(filepath: string): Promise<void> {
    try {
      const exists = await pathExists(filepath);
      if (exists) {
        await unlinkAsync(filepath);
      }
      this.tempFiles.delete(filepath);
    } catch (error) {
      console.error(`Error cleaning up file ${filepath}:`, error);
    }
  }

  /**
   * Cleans up a specific temporary directory
   * @param dirpath Path to the directory to clean up
   */
  cleanupDirectory(dirpath: string): void {
    try {
      if (fs.existsSync(dirpath)) {
        // First clean up files in the directory
        const files = fs.readdirSync(dirpath);
        for (const file of files) {
          const filePath = path.join(dirpath, file);
          
          if (fs.statSync(filePath).isDirectory()) {
            this.cleanupDirectory(filePath);
          } else {
            fs.unlinkSync(filePath);
          }
        }
        
        // Then remove the directory itself
        fs.rmdirSync(dirpath);
      }
      this.tempDirs.delete(dirpath);
    } catch (error) {
      console.error(`Error cleaning up directory ${dirpath}:`, error);
    }
  }

  /**
   * Cleans up a specific temporary directory asynchronously
   * @param dirpath Path to the directory to clean up
   * @returns Promise that resolves when the directory is cleaned up
   */
  async cleanupDirectoryAsync(dirpath: string): Promise<void> {
    try {
      const exists = await pathExists(dirpath);
      if (exists) {
        // First clean up files in the directory
        const files = await readdirAsync(dirpath);
        
        // Process all files in parallel for maximum speed
        await Promise.all(files.map(async (file) => {
          const filePath = path.join(dirpath, file);
          
          const stats = await statAsync(filePath);
          if (stats.isDirectory()) {
            await this.cleanupDirectoryAsync(filePath);
          } else {
            await unlinkAsync(filePath);
          }
        }));
        
        // Then remove the directory itself
        await rmdirAsync(dirpath);
      }
      this.tempDirs.delete(dirpath);
    } catch (error) {
      console.error(`Error cleaning up directory ${dirpath}:`, error);
    }
  }

  /**
   * Cleans up all tracked temporary files and directories
   * Uses synchronous file operations for cleanup on process exit
   */
  cleanupAllSync(): void {
    // Clean up all tracked files
    for (const file of this.tempFiles) {
      this.cleanupFile(file);
    }
    
    // Clean up all tracked directories (sorting to ensure subdirectories are cleaned up first)
    const sortedDirs = Array.from(this.tempDirs).sort((a, b) => b.length - a.length);
    for (const dir of sortedDirs) {
      this.cleanupDirectory(dir);
    }
  }

  /**
   * Simplify cleanup by combining common logic
   * @param path Path to clean up
   * @returns Promise that resolves when the path is cleaned up
   */
  private async cleanupPath(path: string): Promise<void> {
    try {
        const exists = await pathExists(path);
        if (!exists) return;

        const stats = await statAsync(path);
        if (stats.isDirectory()) {
            await this.cleanupDirectoryAsync(path);
        } else {
            await unlinkAsync(path);
        }
    } catch (error) {
        console.error(`Error cleaning up path ${path}:`, error);
    }
  }

  /**
   * Cleans up all tracked temporary files and directories asynchronously
   * @returns Promise that resolves when all cleanup is complete
   */
  async cleanupAll(): Promise<void> {
    const sortedDirs = Array.from(this.tempDirs).sort((a, b) => b.length - a.length);
    for (const file of this.tempFiles) {
      await this.cleanupPath(file);
    }
    for (const dir of sortedDirs) {
      await this.cleanupPath(dir);
    }
    this.tempFiles.clear();
    this.tempDirs.clear();
  }
}

// Export a singleton instance for easy use throughout the application
export const tempManager = new TempFileManager();