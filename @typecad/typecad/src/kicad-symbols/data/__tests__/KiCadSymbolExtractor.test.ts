import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { KiCadSymbolExtractor } from '../KiCadSymbolExtractor.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SymbolFileInfo } from '../KiCadSymbolFileScanner.js';

function makeFileInfo(overrides: Partial<SymbolFileInfo> = {}): SymbolFileInfo {
  return {
    filePath: '/test/Device.kicad_sym',
    fileName: 'Device',
    fullFileName: 'Device.kicad_sym',
    directory: '/test',
    relativePath: 'Device.kicad_sym',
    size: 1024,
    lastModified: new Date('2024-01-01'),
    ...overrides,
  };
}

const VALID_SYMBOL_CONTENT = `(kicad_symbol_lib
  (version 20240101)
  (generator kicad_symbol_editor)
  (symbol "R"
    (property "Reference" "R"
      (at 0 1.27 0)
    )
    (property "Value" "R"
      (at 0 -1.27 0)
    )
    (property "Description" "Resistor"
      (at 0 0 0)
    )
    (property "ki_keywords" "R resistor"
      (at 0 0 0)
    )
  )
  (symbol "C"
    (property "Reference" "C"
      (at 0 1.27 0)
    )
    (property "Value" "C"
      (at 0 -1.27 0)
    )
    (property "Description" "Capacitor"
      (at 0 0 0)
    )
  )
)`;

const SYMBOL_NO_DESCRIPTION = `(kicad_symbol_lib
  (symbol "L"
    (property "Reference" "L"
      (at 0 0 0)
    )
    (property "Value" "L"
      (at 0 0 0)
    )
  )
)`;

describe('KiCadSymbolExtractor', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'kicad-extract-test-'));
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  describe('extractSymbolsFromFile', () => {
    it('extracts symbols from valid file', async () => {
      const filePath = path.join(tmpDir, 'Device.kicad_sym');
      await fs.promises.writeFile(filePath, VALID_SYMBOL_CONTENT, 'utf8');
      const fileInfo = makeFileInfo({ filePath, fileName: 'Device', directory: tmpDir });

      const extractor = new KiCadSymbolExtractor();
      const symbols = await extractor.extractSymbolsFromFile(fileInfo);
      expect(symbols).toHaveLength(2);
      expect(symbols[0].name).toBe('R');
      expect(symbols[0].description).toBe('Resistor');
      expect(symbols[0].keywords).toBe('R resistor');
      expect(symbols[0].library).toBe('Device');
      expect(symbols[0].hasDescription).toBe(true);
      expect(symbols[0].hasKeywords).toBe(true);
      expect(symbols[1].name).toBe('C');
      expect(symbols[1].hasDescription).toBe(true);
      expect(symbols[1].hasKeywords).toBe(false);
    });

    it('extracts symbol without description', async () => {
      const filePath = path.join(tmpDir, 'Test.kicad_sym');
      await fs.promises.writeFile(filePath, SYMBOL_NO_DESCRIPTION, 'utf8');
      const fileInfo = makeFileInfo({ filePath, fileName: 'Test', directory: tmpDir });

      const extractor = new KiCadSymbolExtractor();
      const symbols = await extractor.extractSymbolsFromFile(fileInfo);
      expect(symbols).toHaveLength(1);
      expect(symbols[0].name).toBe('L');
      expect(symbols[0].hasDescription).toBe(false);
    });

    it('throws on file size limit exceeded', async () => {
      const fileInfo = makeFileInfo({ size: 100 });
      const extractor = new KiCadSymbolExtractor({ maxFileSize: 50 });
      await expect(extractor.extractSymbolsFromFile(fileInfo)).rejects.toThrow('exceeds limit');
    });

    it('skips size check when maxFileSize is 0', async () => {
      const filePath = path.join(tmpDir, 'Big.kicad_sym');
      await fs.promises.writeFile(filePath, VALID_SYMBOL_CONTENT, 'utf8');
      const fileInfo = makeFileInfo({ filePath, fileName: 'Big', directory: tmpDir, size: 999999 });

      const extractor = new KiCadSymbolExtractor({ maxFileSize: 0 });
      const symbols = await extractor.extractSymbolsFromFile(fileInfo);
      expect(symbols.length).toBeGreaterThan(0);
    });

    it('throws on missing file', async () => {
      const fileInfo = makeFileInfo({ filePath: path.join(tmpDir, 'nonexistent.kicad_sym') });
      const extractor = new KiCadSymbolExtractor();
      await expect(extractor.extractSymbolsFromFile(fileInfo)).rejects.toThrow('Failed to read file');
    });

    it('returns empty array for invalid content', async () => {
      const filePath = path.join(tmpDir, 'Bad.kicad_sym');
      await fs.promises.writeFile(filePath, 'not valid s-expression', 'utf8');
      const fileInfo = makeFileInfo({ filePath, fileName: 'Bad', directory: tmpDir });

      const extractor = new KiCadSymbolExtractor();
      const symbols = await extractor.extractSymbolsFromFile(fileInfo);
      expect(symbols).toEqual([]);
    });

    it('filters symbols without description when configured', async () => {
      const filePath = path.join(tmpDir, 'Filter.kicad_sym');
      await fs.promises.writeFile(filePath, SYMBOL_NO_DESCRIPTION, 'utf8');
      const fileInfo = makeFileInfo({ filePath, fileName: 'Filter', directory: tmpDir });

      const extractor = new KiCadSymbolExtractor({ includeWithoutDescription: false });
      const symbols = await extractor.extractSymbolsFromFile(fileInfo);
      expect(symbols).toHaveLength(0);
    });

    it('filters symbols without keywords when configured', async () => {
      const filePath = path.join(tmpDir, 'FilterKW.kicad_sym');
      await fs.promises.writeFile(filePath, VALID_SYMBOL_CONTENT, 'utf8');
      const fileInfo = makeFileInfo({ filePath, fileName: 'FilterKW', directory: tmpDir });

      const extractor = new KiCadSymbolExtractor({ includeWithoutKeywords: false });
      const symbols = await extractor.extractSymbolsFromFile(fileInfo);
      expect(symbols).toHaveLength(1);
      expect(symbols[0].name).toBe('R');
    });

    it('combines searchText from description keywords name and library', async () => {
      const filePath = path.join(tmpDir, 'Search.kicad_sym');
      await fs.promises.writeFile(filePath, VALID_SYMBOL_CONTENT, 'utf8');
      const fileInfo = makeFileInfo({ filePath, fileName: 'Search', directory: tmpDir });

      const extractor = new KiCadSymbolExtractor();
      const symbols = await extractor.extractSymbolsFromFile(fileInfo);
      expect(symbols[0].searchText).toContain('resistor');
      expect(symbols[0].searchText).toContain('r');
      expect(symbols[0].searchText).toContain('search');
    });

    it('stores source file metadata', async () => {
      const filePath = path.join(tmpDir, 'Meta.kicad_sym');
      await fs.promises.writeFile(filePath, VALID_SYMBOL_CONTENT, 'utf8');
      const fileInfo = makeFileInfo({ filePath, fileName: 'Meta', directory: tmpDir, relativePath: 'Meta.kicad_sym' });

      const extractor = new KiCadSymbolExtractor();
      const symbols = await extractor.extractSymbolsFromFile(fileInfo);
      expect(symbols[0].sourceFile).toBe(filePath);
      expect(symbols[0].relativePath).toBe('Meta.kicad_sym');
    });
  });

  describe('extractSymbolsFromFiles', () => {
    it('extracts from multiple files', async () => {
      const f1 = path.join(tmpDir, 'Lib1.kicad_sym');
      const f2 = path.join(tmpDir, 'Lib2.kicad_sym');
      await fs.promises.writeFile(f1, VALID_SYMBOL_CONTENT, 'utf8');
      await fs.promises.writeFile(f2, SYMBOL_NO_DESCRIPTION, 'utf8');

      const extractor = new KiCadSymbolExtractor();
      const symbols = await extractor.extractSymbolsFromFiles([
        makeFileInfo({ filePath: f1, fileName: 'Lib1', directory: tmpDir }),
        makeFileInfo({ filePath: f2, fileName: 'Lib2', directory: tmpDir }),
      ]);
      expect(symbols.length).toBe(3);
    });

    it('continues on error when continueOnError is true', async () => {
      const extractor = new KiCadSymbolExtractor({ continueOnError: true });
      const symbols = await extractor.extractSymbolsFromFiles([
        makeFileInfo({ filePath: '/nonexistent/file.kicad_sym' }),
      ]);
      expect(symbols).toHaveLength(0);
      const stats = extractor.getStatistics();
      expect(stats.filesWithErrors).toBe(1);
    });

    it('throws on error when continueOnError is false', async () => {
      const extractor = new KiCadSymbolExtractor({ continueOnError: false });
      await expect(
        extractor.extractSymbolsFromFiles([makeFileInfo({ filePath: '/nonexistent/file.kicad_sym' })]),
      ).rejects.toThrow();
    });

    it('records processing time', async () => {
      const extractor = new KiCadSymbolExtractor();
      await extractor.extractSymbolsFromFiles([]);
      const stats = extractor.getStatistics();
      expect(stats.processingTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getStatistics', () => {
    it('returns initial zeroed statistics', () => {
      const extractor = new KiCadSymbolExtractor();
      const stats = extractor.getStatistics();
      expect(stats.filesProcessed).toBe(0);
      expect(stats.filesWithErrors).toBe(0);
      expect(stats.symbolsExtracted).toBe(0);
      expect(stats.symbolsWithDescriptions).toBe(0);
      expect(stats.symbolsWithKeywords).toBe(0);
      expect(stats.processingTime).toBe(0);
      expect(stats.errors).toHaveLength(0);
    });

    it('tracks statistics after extraction', async () => {
      const filePath = path.join(tmpDir, 'Stats.kicad_sym');
      await fs.promises.writeFile(filePath, VALID_SYMBOL_CONTENT, 'utf8');

      const extractor = new KiCadSymbolExtractor();
      await extractor.extractSymbolsFromFiles([makeFileInfo({ filePath, fileName: 'Stats', directory: tmpDir })]);
      const stats = extractor.getStatistics();
      expect(stats.filesProcessed).toBe(1);
      expect(stats.symbolsExtracted).toBe(2);
      expect(stats.symbolsWithDescriptions).toBe(2);
      expect(stats.symbolsWithKeywords).toBe(1);
    });

    it('resets on each extraction call', async () => {
      const filePath = path.join(tmpDir, 'Reset.kicad_sym');
      await fs.promises.writeFile(filePath, VALID_SYMBOL_CONTENT, 'utf8');
      const fileInfo = makeFileInfo({ filePath, fileName: 'Reset', directory: tmpDir });

      const extractor = new KiCadSymbolExtractor();
      await extractor.extractSymbolsFromFiles([fileInfo]);
      await extractor.extractSymbolsFromFiles([fileInfo]);
      const stats = extractor.getStatistics();
      expect(stats.filesProcessed).toBe(1);
    });
  });

  describe('getExtractionSummary', () => {
    it('returns summary with no errors', async () => {
      const filePath = path.join(tmpDir, 'Summary.kicad_sym');
      await fs.promises.writeFile(filePath, VALID_SYMBOL_CONTENT, 'utf8');

      const extractor = new KiCadSymbolExtractor();
      await extractor.extractSymbolsFromFiles([makeFileInfo({ filePath, fileName: 'Summary', directory: tmpDir })]);
      const summary = extractor.getExtractionSummary();
      expect(summary).toContain('Extraction Summary:');
      expect(summary).toContain('Files processed: 1');
      expect(summary).toContain('Symbols extracted: 2');
      expect(summary).toContain('Success rate: 100.0%');
    });

    it('shows error details when 3 or fewer errors', async () => {
      const extractor = new KiCadSymbolExtractor({ continueOnError: true });
      await extractor.extractSymbolsFromFiles([
        makeFileInfo({ filePath: '/bad/file1.kicad_sym' }),
        makeFileInfo({ filePath: '/bad/file2.kicad_sym' }),
      ]);
      const summary = extractor.getExtractionSummary();
      expect(summary).toContain('Error details:');
    });

    it('shows 0% success rate when no files processed', () => {
      const extractor = new KiCadSymbolExtractor();
      const summary = extractor.getExtractionSummary();
      expect(summary).toContain('Success rate: 0%');
    });
  });

  describe('strict validation', () => {
    it('filters symbols with empty name in strict mode', async () => {
      const content = `(kicad_symbol_lib
        (symbol ""
          (property "Reference" "X" (at 0 0 0))
          (property "Value" "X" (at 0 0 0))
        )
      )`;
      const filePath = path.join(tmpDir, 'Strict.kicad_sym');
      await fs.promises.writeFile(filePath, content, 'utf8');

      const extractor = new KiCadSymbolExtractor({ strictValidation: true });
      const symbols = await extractor.extractSymbolsFromFile(
        makeFileInfo({ filePath, fileName: 'Strict', directory: tmpDir }),
      );
      expect(symbols).toHaveLength(0);
    });
  });
});
