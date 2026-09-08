import * as fsSync from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { pathExists } from './fs.js';
import logger from '../../../utils/logging.js';
import { getFlatpakSafeTempDir } from '../../../kicad.js';

export class TempFileManager {
  private tempFiles: Set<string> = new Set();
  private tempDirs: Set<string> = new Set();
  private baseDir: string;
  private prefix: string;

  constructor(baseDir?: string, prefix: string = 'typecad-') {
    this.baseDir = baseDir || path.join(getFlatpakSafeTempDir(), 'typecad-temp-' + randomUUID().slice(0, 8));
    this.prefix = prefix;

    if (!fsSync.existsSync(this.baseDir)) {
      fsSync.mkdirSync(this.baseDir, { recursive: true });
      this.tempDirs.add(this.baseDir);
    }

    process.on('exit', () => {
      this.cleanupAllSync();
    });

    process.on('SIGINT', () => {
      this.cleanupAllSync();
      process.exit(0);
    });
  }

  createTempFilePath(extension: string, subDir?: string): string {
    const targetDir = subDir ? this.createTempDir(subDir) : this.baseDir;

    const filename = `${this.prefix}${randomUUID()}${extension}`;
    const filepath = path.join(targetDir, filename);
    this.tempFiles.add(filepath);
    return filepath;
  }

  createTempDirPath(): string {
    const dirPath = path.join(this.baseDir, `${this.prefix}dir-${randomUUID().slice(0, 8)}`);
    this.tempDirs.add(dirPath);
    return dirPath;
  }

  createTempDir(name?: string): string {
    const dirName = name || `${this.prefix}dir-${randomUUID().slice(0, 8)}`;
    const dirPath = path.join(this.baseDir, dirName);

    if (!fsSync.existsSync(dirPath)) {
      fsSync.mkdirSync(dirPath, { recursive: true });
    }

    this.tempDirs.add(dirPath);
    return dirPath;
  }

  async createTempDirAsync(name?: string): Promise<string> {
    const dirName = name || `${this.prefix}dir-${randomUUID().slice(0, 8)}`;
    const dirPath = path.join(this.baseDir, dirName);

    const exists = await pathExists(dirPath);
    if (!exists) {
      await fs.mkdir(dirPath, { recursive: true });
    }

    this.tempDirs.add(dirPath);
    return dirPath;
  }

  writeTempFile(data: string | Buffer, extension: string, subDir?: string): string {
    const filepath = this.createTempFilePath(extension, subDir);
    fsSync.writeFileSync(filepath, data);
    return filepath;
  }

  async writeTempFileAsync(data: string | Buffer, extension: string, subDir?: string): Promise<string> {
    const filepath = this.createTempFilePath(extension, subDir);
    await fs.writeFile(filepath, data);
    return filepath;
  }

  copyToTemp(sourcePath: string, extension?: string): string {
    const ext = extension || path.extname(sourcePath);
    const tempPath = this.createTempFilePath(ext);
    fsSync.copyFileSync(sourcePath, tempPath);
    return tempPath;
  }

  async copyToTempAsync(sourcePath: string, extension?: string): Promise<string> {
    const ext = extension || path.extname(sourcePath);
    const tempPath = this.createTempFilePath(ext);
    await fs.copyFile(sourcePath, tempPath);
    return tempPath;
  }

  createOutputPath(outputPath: string, createDir: boolean = true): string {
    const outputDir = path.dirname(outputPath);

    if (createDir && !fsSync.existsSync(outputDir)) {
      fsSync.mkdirSync(outputDir, { recursive: true });
    }

    if (outputPath.startsWith(this.baseDir)) {
      this.tempFiles.add(outputPath);
    }

    return outputPath;
  }

  async createOutputPathAsync(outputPath: string, createDir: boolean = true): Promise<string> {
    const outputDir = path.dirname(outputPath);

    if (createDir) {
      const exists = await pathExists(outputDir);
      if (!exists) {
        await fs.mkdir(outputDir, { recursive: true });
      }
    }

    if (outputPath.startsWith(this.baseDir)) {
      this.tempFiles.add(outputPath);
    }

    return outputPath;
  }

  trackFile(filepath: string): void {
    if (fsSync.existsSync(filepath)) {
      this.tempFiles.add(filepath);
    }
  }

  trackDirectory(dirpath: string): void {
    if (fsSync.existsSync(dirpath)) {
      this.tempDirs.add(dirpath);
    }
  }

  cleanupFile(filepath: string): void {
    try {
      if (fsSync.existsSync(filepath)) {
        fsSync.unlinkSync(filepath);
      }
      this.tempFiles.delete(filepath);
    } catch (error) {
      logger.error(`Error cleaning up file ${filepath}:`, error);
    }
  }

  async cleanupFileAsync(filepath: string): Promise<void> {
    try {
      const exists = await pathExists(filepath);
      if (exists) {
        await fs.unlink(filepath);
      }
      this.tempFiles.delete(filepath);
    } catch (error) {
      logger.error(`Error cleaning up file ${filepath}:`, error);
    }
  }

  cleanupDirectory(dirpath: string): void {
    try {
      if (fsSync.existsSync(dirpath)) {
        const files = fsSync.readdirSync(dirpath);
        for (const file of files) {
          const filePath = path.join(dirpath, file);

          if (fsSync.statSync(filePath).isDirectory()) {
            this.cleanupDirectory(filePath);
          } else {
            fsSync.unlinkSync(filePath);
          }
        }

        fsSync.rmdirSync(dirpath);
      }
      this.tempDirs.delete(dirpath);
    } catch (error) {
      logger.error(`Error cleaning up directory ${dirpath}:`, error);
    }
  }

  async cleanupDirectoryAsync(dirpath: string): Promise<void> {
    try {
      const exists = await pathExists(dirpath);
      if (exists) {
        const files = await fs.readdir(dirpath);

        await Promise.all(
          files.map(async (file) => {
            const filePath = path.join(dirpath, file);

            const stats = await fs.stat(filePath);
            if (stats.isDirectory()) {
              await this.cleanupDirectoryAsync(filePath);
            } else {
              await fs.unlink(filePath);
            }
          }),
        );

        await fs.rmdir(dirpath);
      }
      this.tempDirs.delete(dirpath);
    } catch (error) {
      logger.error(`Error cleaning up directory ${dirpath}:`, error);
    }
  }

  cleanupAllSync(): void {
    for (const file of this.tempFiles) {
      this.cleanupFile(file);
    }

    const sortedDirs = Array.from(this.tempDirs).sort((a, b) => b.length - a.length);
    for (const dir of sortedDirs) {
      this.cleanupDirectory(dir);
    }
  }

  private async cleanupPath(targetPath: string): Promise<void> {
    try {
      const exists = await pathExists(targetPath);
      if (!exists) return;

      const stats = await fs.stat(targetPath);
      if (stats.isDirectory()) {
        await this.cleanupDirectoryAsync(targetPath);
      } else {
        await fs.unlink(targetPath);
      }
    } catch (error) {
      logger.error(`Error cleaning up path ${targetPath}:`, error);
    }
  }

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

export const tempManager = new TempFileManager();
