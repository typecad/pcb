import { promises as fs } from 'fs';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { ComponentRecord, ParsingError } from '../types/index.js';
import { Logger } from '../cli/Logger.js';

/**
 * Handles parsing CSV files into ComponentRecord objects
 */
export class CsvParser {
  private readonly logger: Logger;

  constructor() {
    this.logger = Logger.getInstance();
  }
  /**
   * Parses a CSV file into an array of ComponentRecord objects
   * @param filePath Path to the CSV file
   * @returns Promise that resolves to an array of ComponentRecord objects
   * @throws ParsingError if parsing fails
   */
  async parseFile(filePath: string): Promise<ComponentRecord[]> {
    try {
      const components: ComponentRecord[] = [];
      let headers: string[] = [];
      let lineNumber = 0;

      // Create a read stream for the file
      const fileStream = createReadStream(filePath, { encoding: 'utf-8' });
      const rl = createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      // Process each line
      for await (const line of rl) {
        lineNumber++;

        // Skip empty lines
        if (!line.trim()) {
          continue;
        }

        // Parse the CSV line
        const values = this.parseCsvLine(line);

        if (lineNumber === 1) {
          // First line contains headers
          headers = values;

          // Validate headers
          this.validateHeaders(headers);
        } else {
          // Create component record
          try {
            const component = this.createComponentRecord(headers, values);
            components.push(component);
          } catch (error) {
            this.logger.warn(
              `Skipping malformed row at line ${lineNumber}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
      }

      return components;
    } catch (error) {
      throw new ParsingError(`Failed to parse CSV file: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Parses a single CSV line into an array of values
   * @param line CSV line to parse
   * @returns Array of values
   * @private
   */
  private parseCsvLine(line: string): string[] {
    const values: string[] = [];
    let currentValue = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        // Handle quotes
        if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
          // Escaped quote inside quotes
          currentValue += '"';
          i++; // Skip the next quote
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // End of value
        values.push(currentValue);
        currentValue = '';
      } else {
        // Add character to current value
        currentValue += char;
      }
    }

    // Add the last value
    values.push(currentValue);

    return values;
  }

  /**
   * Validates that the CSV headers contain the required fields
   * @param headers Array of header names
   * @throws Error if required headers are missing
   * @private
   */
  private validateHeaders(headers: string[]): void {
    const requiredHeaders = [
      'lcsc',
      'category',
      'subcategory',
      'mfr',
      'package',
      'manufacturer',
      'description',
      'datasheet',
    ];

    const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));

    if (missingHeaders.length > 0) {
      throw new Error(`CSV file is missing required headers: ${missingHeaders.join(', ')}`);
    }
  }

  /**
   * Creates a ComponentRecord from headers and values
   * @param headers Array of header names
   * @param values Array of values
   * @returns ComponentRecord object
   * @throws Error if values array doesn't match headers array
   * @private
   */
  private createComponentRecord(headers: string[], values: string[]): ComponentRecord {
    if (headers.length !== values.length) {
      throw new Error(`Value count (${values.length}) doesn't match header count (${headers.length})`);
    }

    // Create an object with all headers as keys
    const record: Record<string, string> = {};

    for (let i = 0; i < headers.length; i++) {
      record[headers[i]] = values[i];
    }

    // Extract description from extra JSON field if description column is empty
    if (!record.description || record.description.trim() === '') {
      try {
        const extraIndex = headers.indexOf('extra');
        if (extraIndex !== -1 && values[extraIndex]) {
          const extraData = JSON.parse(values[extraIndex]);
          if (extraData.description && typeof extraData.description === 'string') {
            record.description = extraData.description;
          }
        }
      } catch (error) {
        // If JSON parsing fails, keep the empty description
        // This is not a critical error, so we just continue
      }
    }

    // Cast to ComponentRecord
    return record as unknown as ComponentRecord;
  }
}
