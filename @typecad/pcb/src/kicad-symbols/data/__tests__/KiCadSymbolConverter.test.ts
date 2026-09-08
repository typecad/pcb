import { describe, it, expect } from 'vitest';
import { KiCadSymbolConverter } from '../KiCadSymbolConverter.js';
import { ExtractedSymbol } from '../KiCadSymbolExtractor.js';

function makeSymbol(overrides: Partial<ExtractedSymbol> = {}): ExtractedSymbol {
  return {
    name: 'R',
    properties: [
      { name: 'Reference', value: 'R' },
      { name: 'Value', value: 'R' },
    ],
    description: 'Resistor',
    keywords: 'R resistor',
    library: 'Device',
    sourceFile: '/symbols/Device.kicad_sym',
    relativePath: 'Device.kicad_sym',
    fileModified: new Date('2024-01-01'),
    hasDescription: true,
    hasKeywords: true,
    searchText: 'resistor r device',
    ...overrides,
  };
}

describe('KiCadSymbolConverter', () => {
  describe('constructor', () => {
    it('uses default options', () => {
      const converter = new KiCadSymbolConverter();
      const records = converter.convertSymbolsToComponentRecords([makeSymbol()]);
      expect(records).toHaveLength(1);
      expect(records[0].manufacturer).toBe('KiCad');
      expect(records[0].package).toBe('Symbol');
    });

    it('merges custom options', () => {
      const converter = new KiCadSymbolConverter({
        defaultManufacturer: 'CustomMfr',
        defaultPackage: 'CustomPackage',
      });
      const records = converter.convertSymbolsToComponentRecords([makeSymbol()]);
      expect(records[0].manufacturer).toBe('CustomMfr');
      expect(records[0].package).toBe('CustomPackage');
    });
  });

  describe('convertSymbolsToComponentRecords', () => {
    it('converts single symbol to ComponentRecord', () => {
      const converter = new KiCadSymbolConverter();
      const records = converter.convertSymbolsToComponentRecords([makeSymbol()]);
      expect(records).toHaveLength(1);
      const r = records[0];
      expect(r.lcsc).toBe('Device:R');
      expect(r.category).toBe('Device');
      expect(r.subcategory).toBe('Schematic Symbol');
      expect(r.mfr).toBe('R');
      expect(r.basic).toBe('1');
      expect(r.preferred).toBe('1');
      expect(r.stock).toBe('∞');
      expect(r.price).toBe('[]');
      expect(r.assembly_process).toBe('N/A');
      expect(r.min_order_qty).toBe('0');
      expect(r.attrition_qty).toBe('0');
    });

    it('converts multiple symbols', () => {
      const converter = new KiCadSymbolConverter();
      const symbols = [
        makeSymbol({ name: 'R', library: 'Device' }),
        makeSymbol({ name: 'C', library: 'Device', description: 'Capacitor' }),
        makeSymbol({ name: 'LED', library: 'Device', description: 'Light emitting diode' }),
      ];
      const records = converter.convertSymbolsToComponentRecords(symbols);
      expect(records).toHaveLength(3);
      expect(records[0].lcsc).toBe('Device:R');
      expect(records[1].lcsc).toBe('Device:C');
      expect(records[2].lcsc).toBe('Device:LED');
    });

    it('uses categoryMapping when provided', () => {
      const converter = new KiCadSymbolConverter({
        categoryMapping: { Device: 'Basic Components' },
      });
      const records = converter.convertSymbolsToComponentRecords([makeSymbol()]);
      expect(records[0].category).toBe('Basic Components');
      expect(records[0].category_id).toBe('Device');
    });

    it('skips symbols that throw during conversion', () => {
      const converter = new KiCadSymbolConverter();
      const badSymbol = makeSymbol({ name: '' });
      (badSymbol as any).fileModified = undefined;
      const records = converter.convertSymbolsToComponentRecords([badSymbol]);
      expect(records).toHaveLength(0);
    });

    it('handles symbols without description', () => {
      const converter = new KiCadSymbolConverter();
      const symbol = makeSymbol({ description: undefined });
      const records = converter.convertSymbolsToComponentRecords([symbol]);
      expect(records).toHaveLength(1);
      expect(records[0].description).toContain('Symbol from Device library');
    });

    it('handles symbols without keywords', () => {
      const converter = new KiCadSymbolConverter();
      const symbol = makeSymbol({ keywords: undefined });
      const records = converter.convertSymbolsToComponentRecords([symbol]);
      expect(records).toHaveLength(1);
    });

    it('includes searchTerms in extra data', () => {
      const converter = new KiCadSymbolConverter({ generateSearchableExtra: true });
      const records = converter.convertSymbolsToComponentRecords([makeSymbol()]);
      const extra = JSON.parse(records[0].extra);
      expect(extra.searchTerms).toBeDefined();
      expect(Array.isArray(extra.searchTerms)).toBe(true);
      expect(extra.searchText).toBeDefined();
    });

    it('excludes searchTerms when disabled', () => {
      const converter = new KiCadSymbolConverter({ generateSearchableExtra: false });
      const records = converter.convertSymbolsToComponentRecords([makeSymbol()]);
      const extra = JSON.parse(records[0].extra);
      expect(extra.searchTerms).toBeUndefined();
      expect(extra.searchText).toBeUndefined();
    });

    it('includes file path when enabled', () => {
      const converter = new KiCadSymbolConverter({ includeFilePath: true });
      const records = converter.convertSymbolsToComponentRecords([makeSymbol()]);
      const extra = JSON.parse(records[0].extra);
      expect(extra.sourceFile).toBe('Device.kicad_sym');
      expect(extra.fileModified).toBeDefined();
    });

    it('excludes file path when disabled', () => {
      const converter = new KiCadSymbolConverter({ includeFilePath: false });
      const records = converter.convertSymbolsToComponentRecords([makeSymbol()]);
      const extra = JSON.parse(records[0].extra);
      expect(extra.sourceFile).toBeUndefined();
    });

    it('includes metadata when enabled', () => {
      const converter = new KiCadSymbolConverter({ includeMetadata: true });
      const records = converter.convertSymbolsToComponentRecords([makeSymbol()]);
      const extra = JSON.parse(records[0].extra);
      expect(extra.hasDescription).toBe(true);
      expect(extra.hasKeywords).toBe(true);
      expect(extra.processingDate).toBeDefined();
    });

    it('excludes metadata when disabled', () => {
      const converter = new KiCadSymbolConverter({ includeMetadata: false });
      const records = converter.convertSymbolsToComponentRecords([makeSymbol()]);
      const extra = JSON.parse(records[0].extra);
      expect(extra.hasDescription).toBeUndefined();
    });

    it('builds description with keywords when different from description', () => {
      const converter = new KiCadSymbolConverter();
      const symbol = makeSymbol({ description: 'Resistor', keywords: 'passive component' });
      const records = converter.convertSymbolsToComponentRecords([symbol]);
      expect(records[0].description).toContain('Keywords: passive component');
    });

    it('does not duplicate keywords already in description', () => {
      const converter = new KiCadSymbolConverter();
      const symbol = makeSymbol({ description: 'Resistor', keywords: 'resistor' });
      const records = converter.convertSymbolsToComponentRecords([symbol]);
      expect(records[0].description).not.toContain('Keywords:');
    });

    it('includes properties in extra data', () => {
      const converter = new KiCadSymbolConverter();
      const symbol = makeSymbol({
        properties: [
          { name: 'Reference', value: 'R' },
          { name: 'Value', value: '10k' },
        ],
      });
      const records = converter.convertSymbolsToComponentRecords([symbol]);
      const extra = JSON.parse(records[0].extra);
      expect(extra.properties).toHaveLength(2);
      expect(extra.properties[0].name).toBe('Reference');
    });
  });

  describe('getStatistics', () => {
    it('returns initial zeroed statistics', () => {
      const converter = new KiCadSymbolConverter();
      const stats = converter.getStatistics();
      expect(stats.symbolsConverted).toBe(0);
      expect(stats.symbolsWithDescriptions).toBe(0);
      expect(stats.symbolsWithKeywords).toBe(0);
      expect(stats.uniqueLibraries).toBe(0);
      expect(stats.conversionTime).toBe(0);
    });

    it('returns statistics after conversion', () => {
      const converter = new KiCadSymbolConverter();
      converter.convertSymbolsToComponentRecords([
        makeSymbol({ library: 'Device', description: 'Resistor', keywords: 'R' }),
        makeSymbol({ name: 'C', library: 'Device', description: 'Capacitor', keywords: undefined, hasKeywords: false }),
        makeSymbol({
          name: 'U',
          library: 'MCU',
          description: undefined,
          hasDescription: false,
          keywords: undefined,
          hasKeywords: false,
        }),
      ]);
      const stats = converter.getStatistics();
      expect(stats.symbolsConverted).toBe(3);
      expect(stats.symbolsWithDescriptions).toBe(2);
      expect(stats.symbolsWithKeywords).toBe(1);
      expect(stats.uniqueLibraries).toBe(2);
      expect(stats.libraryDistribution.Device).toBe(2);
      expect(stats.libraryDistribution.MCU).toBe(1);
    });

    it('resets statistics on each call', () => {
      const converter = new KiCadSymbolConverter();
      converter.convertSymbolsToComponentRecords([makeSymbol()]);
      converter.convertSymbolsToComponentRecords([makeSymbol()]);
      const stats = converter.getStatistics();
      expect(stats.symbolsConverted).toBe(1);
    });
  });

  describe('getConversionSummary', () => {
    it('returns formatted summary', () => {
      const converter = new KiCadSymbolConverter();
      converter.convertSymbolsToComponentRecords([
        makeSymbol({ library: 'Device' }),
        makeSymbol({ name: 'C', library: 'Device' }),
      ]);
      const summary = converter.getConversionSummary();
      expect(summary).toContain('Conversion Summary:');
      expect(summary).toContain('Symbols converted: 2');
      expect(summary).toContain('Unique libraries: 1');
      expect(summary).toContain('Device: 2 symbols');
    });

    it('handles zero symbols', () => {
      const converter = new KiCadSymbolConverter();
      converter.convertSymbolsToComponentRecords([]);
      const summary = converter.getConversionSummary();
      expect(summary).toContain('Symbols converted: 0');
      expect(summary).toContain('Average time per symbol: 0 ms');
    });

    it('limits library display to top 10', () => {
      const converter = new KiCadSymbolConverter();
      const symbols = Array.from({ length: 12 }, (_, i) => makeSymbol({ name: `Sym${i}`, library: `Lib${i}` }));
      converter.convertSymbolsToComponentRecords(symbols);
      const summary = converter.getConversionSummary();
      expect(summary).toContain('Top 10 Libraries by Symbol Count:');
    });
  });

  describe('validateComponentRecord', () => {
    it('returns true for valid record', () => {
      const converter = new KiCadSymbolConverter();
      const records = converter.convertSymbolsToComponentRecords([makeSymbol()]);
      expect(KiCadSymbolConverter.validateComponentRecord(records[0])).toBe(true);
    });

    it('returns false when lcsc is missing', () => {
      const record = {
        ...makeSymbol(),
        lcsc: '',
        category: 'Device',
        description: 'test',
        manufacturer: 'KiCad',
        extra: '{}',
      } as any;
      expect(KiCadSymbolConverter.validateComponentRecord(record)).toBe(false);
    });

    it('returns false when category is missing', () => {
      const record = { lcsc: 'test', category: '', description: 'test', manufacturer: 'KiCad', extra: '{}' } as any;
      expect(KiCadSymbolConverter.validateComponentRecord(record)).toBe(false);
    });

    it('returns false when description is missing', () => {
      const record = { lcsc: 'test', category: 'Device', description: '', manufacturer: 'KiCad', extra: '{}' } as any;
      expect(KiCadSymbolConverter.validateComponentRecord(record)).toBe(false);
    });

    it('returns false when manufacturer is missing', () => {
      const record = { lcsc: 'test', category: 'Device', description: 'test', manufacturer: '', extra: '{}' } as any;
      expect(KiCadSymbolConverter.validateComponentRecord(record)).toBe(false);
    });

    it('returns false when extra is not valid JSON', () => {
      const record = {
        lcsc: 'test',
        category: 'Device',
        description: 'test',
        manufacturer: 'KiCad',
        extra: 'not json',
      } as any;
      expect(KiCadSymbolConverter.validateComponentRecord(record)).toBe(false);
    });
  });
});
