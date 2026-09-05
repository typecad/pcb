import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import { CsvParser } from '../CsvParser.js';
import { ComponentRecord } from '../../types/index.js';

describe('CsvParser', () => {
  const testCsvPath = './test-csvparser-components.csv';
  let csvParser: CsvParser;

  beforeEach(() => {
    csvParser = new CsvParser();
  });

  afterEach(async () => {
    // Clean up test file
    try {
      await fs.unlink(testCsvPath);
    } catch (error) {
      // File might not exist
    }
  });

  describe('parseFile', () => {
    it('should parse a valid CSV file into ComponentRecord objects', async () => {
      // Create a test CSV file
      const csvContent =
        'lcsc,category_id,category,subcategory,mfr,package,joints,manufacturer,basic,preferred,description,datasheet,stock,last_on_stock,price,extra\n' +
        'C1234,123,Capacitors,MLCC,ABC123,0402,2,Vendor Inc,1,0,10nF 50V X7R,http://example.com/datasheet.pdf,1000,1234567890,"[{""price"":0.01}]","{}"\n' +
        'C5678,456,Resistors,SMD,XYZ789,0603,2,Resistor Co,0,1,10K 1%,http://example.com/datasheet2.pdf,2000,1234567891,"[{""price"":0.02}]","{}"';

      await fs.writeFile(testCsvPath, csvContent, 'utf-8');

      const components = await csvParser.parseFile(testCsvPath);

      // Verify the parsed components
      expect(components).toHaveLength(2);

      // Check first component
      expect(components[0].lcsc).toBe('C1234');
      expect(components[0].category).toBe('Capacitors');
      expect(components[0].subcategory).toBe('MLCC');
      expect(components[0].package).toBe('0402');
      expect(components[0].description).toBe('10nF 50V X7R');

      // Check second component
      expect(components[1].lcsc).toBe('C5678');
      expect(components[1].category).toBe('Resistors');
      expect(components[1].subcategory).toBe('SMD');
      expect(components[1].package).toBe('0603');
      expect(components[1].description).toBe('10K 1%');
    });

    it('should handle quoted values with commas', async () => {
      // Create a test CSV file with quoted values containing commas
      const csvContent =
        'lcsc,category_id,category,subcategory,mfr,package,joints,manufacturer,basic,preferred,description,datasheet,stock,last_on_stock,price,extra\n' +
        'C1234,123,Capacitors,MLCC,ABC123,0402,2,"Vendor, Inc",1,0,"10nF, 50V, X7R",http://example.com/datasheet.pdf,1000,1234567890,"[{""price"":0.01}]","{}"\n' +
        'C5678,456,Resistors,SMD,XYZ789,0603,2,"Resistor, Co",0,1,"10K, 1%, SMD",http://example.com/datasheet2.pdf,2000,1234567891,"[{""price"":0.02}]","{}"';

      await fs.writeFile(testCsvPath, csvContent, 'utf-8');

      const components = await csvParser.parseFile(testCsvPath);

      // Verify the parsed components
      expect(components).toHaveLength(2);

      // Check values with commas
      expect(components[0].manufacturer).toBe('Vendor, Inc');
      expect(components[0].description).toBe('10nF, 50V, X7R');

      expect(components[1].manufacturer).toBe('Resistor, Co');
      expect(components[1].description).toBe('10K, 1%, SMD');
    });

    it('should handle escaped quotes in quoted values', async () => {
      // Create a test CSV file with escaped quotes
      const csvContent =
        'lcsc,category_id,category,subcategory,mfr,package,joints,manufacturer,basic,preferred,description,datasheet,stock,last_on_stock,price,extra\n' +
        'C1234,123,Capacitors,MLCC,ABC123,0402,2,"Vendor ""Inc""",1,0,"10nF ""High Quality""",http://example.com/datasheet.pdf,1000,1234567890,"[{""price"":0.01}]","{}"\n' +
        'C5678,456,Resistors,SMD,XYZ789,0603,2,Resistor Co,0,1,10K 1%,http://example.com/datasheet2.pdf,2000,1234567891,"[{""price"":0.02}]","{}"';

      await fs.writeFile(testCsvPath, csvContent, 'utf-8');

      const components = await csvParser.parseFile(testCsvPath);

      // Verify the parsed components
      expect(components).toHaveLength(2);

      // Check values with escaped quotes
      expect(components[0].manufacturer).toBe('Vendor "Inc"');
      expect(components[0].description).toBe('10nF "High Quality"');
    });

    it('should skip empty lines', async () => {
      // Create a test CSV file with empty lines
      const csvContent =
        'lcsc,category_id,category,subcategory,mfr,package,joints,manufacturer,basic,preferred,description,datasheet,stock,last_on_stock,price,extra\n' +
        '\n' +
        'C1234,123,Capacitors,MLCC,ABC123,0402,2,Vendor Inc,1,0,10nF 50V X7R,http://example.com/datasheet.pdf,1000,1234567890,"[{""price"":0.01}]","{}"\n' +
        '\n' +
        'C5678,456,Resistors,SMD,XYZ789,0603,2,Resistor Co,0,1,10K 1%,http://example.com/datasheet2.pdf,2000,1234567891,"[{""price"":0.02}]","{}"';

      await fs.writeFile(testCsvPath, csvContent, 'utf-8');

      const components = await csvParser.parseFile(testCsvPath);

      // Verify the parsed components (should skip empty lines)
      expect(components).toHaveLength(2);
    });

    it('should handle malformed rows gracefully', async () => {
      // Create a test CSV file with a malformed row (too few values)
      const csvContent =
        'lcsc,category_id,category,subcategory,mfr,package,joints,manufacturer,basic,preferred,description,datasheet,stock,last_on_stock,price,extra\n' +
        'C1234,123,Capacitors,MLCC,ABC123,0402,2,Vendor Inc,1,0,10nF 50V X7R,http://example.com/datasheet.pdf,1000,1234567890,"[{""price"":0.01}]"\n' + // Missing last value
        'C5678,456,Resistors,SMD,XYZ789,0603,2,Resistor Co,0,1,10K 1%,http://example.com/datasheet2.pdf,2000,1234567891,"[{""price"":0.02}]","{}"';

      await fs.writeFile(testCsvPath, csvContent, 'utf-8');

      // Mock console.warn to avoid cluttering test output
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const components = await csvParser.parseFile(testCsvPath);

      // Verify the parsed components (should skip the malformed row)
      expect(components).toHaveLength(1);
      expect(components[0].lcsc).toBe('C5678');

      // Verify warning was logged
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping malformed row'));

      // Restore console.warn
      consoleWarnSpy.mockRestore();
    });

    it('should throw an error if required headers are missing', async () => {
      // Create a test CSV file with missing required headers
      const csvContent =
        'lcsc,category_id,mfr,package,joints,basic,preferred,stock,last_on_stock,price,extra\n' + // Missing category, subcategory, manufacturer, description, datasheet
        'C1234,123,ABC123,0402,2,1,0,1000,1234567890,"[{""price"":0.01}]","{}"';

      await fs.writeFile(testCsvPath, csvContent, 'utf-8');

      await expect(csvParser.parseFile(testCsvPath)).rejects.toThrow(/missing required headers/);
    });

    it('should throw an error if file does not exist', async () => {
      await expect(csvParser.parseFile('non-existent-file.csv')).rejects.toThrow();
    });
  });
});
