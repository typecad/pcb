import { ParameterParser } from '../interfaces/ParameterParser.js';
import { ElectricalValue, ParsedParameters } from '../types/index.js';
import { PackageRecognizer } from './PackageRecognizer.js';
import { ComponentTypeRecognizer } from './ComponentTypeRecognizer.js';
import { UnitConverter } from './UnitConverter.js';

/**
 * Data source types that affect parameter parsing behavior
 */
export enum DataSourceType {
  /** KiCad symbols without electrical values */
  KICAD = 'kicad',
}

/**
 * Implementation of the ParameterParser interface that extracts electrical parameters from search queries
 * Behavior varies based on data source type
 */
export class ElectricalParameterParser implements ParameterParser {
  private readonly dataSourceType: DataSourceType;

  // Regex patterns for electrical parameters
  private readonly voltagePattern = /(\d+(?:\.\d+)?)\s*[Vv](?:olt)?(?:DC|AC)?/g;
  private readonly capacitancePattern = /(\d+(?:\.\d+)?)\s*(?:p|n|µ|u|m)?[Ff](?:arad)?/g;
  private readonly resistancePattern = /(\d+(?:\.\d+)?)\s*(?:m|k|M|G)?(?:Ω|ohm|Ohm|OHM|R)/g;
  private readonly inductancePattern = /(\d+(?:\.\d+)?)\s*(?:n|µ|u|m)?[Hh](?:enry)?/g;

  /**
   * Creates a new ElectricalParameterParser
   * @param dataSourceType - Type of data source to adjust parsing behavior
   */
  constructor(dataSourceType: DataSourceType = DataSourceType.KICAD) {
    this.dataSourceType = dataSourceType;
  }

  /**
   * Parses a natural language query to extract electrical parameters
   * @param query - The search query to parse
   * @returns Structured parameters extracted from the query
   */
  public parseQuery(query: string): ParsedParameters {
    const result: ParsedParameters = {};

    // For KiCad symbols, skip electrical parameter extraction since they don't have electrical values
    if (this.dataSourceType === DataSourceType.KICAD) {
      // Only extract non-electrical parameters for KiCad symbols
      this.extractNonElectricalParameters(query, result);
      return result;
    }

    // Extract voltage
    const voltageMatch = this.extractElectricalValue(query, this.voltagePattern);
    if (voltageMatch) {
      result.voltage = this.normalizeVoltage(voltageMatch);
    }

    // Extract component value (capacitance, resistance, or inductance)
    const capacitanceMatch = this.extractElectricalValue(query, this.capacitancePattern);
    const resistanceMatch = this.extractElectricalValue(query, this.resistancePattern);
    const inductanceMatch = this.extractElectricalValue(query, this.inductancePattern);

    // Check for implicit resistance values (e.g., "10k resistor")
    let implicitResistanceMatch: ElectricalValue | undefined;
    if (!resistanceMatch && /\bresistor\b/i.test(query)) {
      implicitResistanceMatch = this.extractImplicitResistance(query);
    }

    // Check for implicit capacitance values (e.g., "100n capacitor")
    let implicitCapacitanceMatch: ElectricalValue | undefined;
    if (!capacitanceMatch && /\bcapacitor\b/i.test(query)) {
      implicitCapacitanceMatch = this.extractImplicitCapacitance(query);
    }

    // Check for implicit inductance values (e.g., "10u inductor")
    let implicitInductanceMatch: ElectricalValue | undefined;
    if (!inductanceMatch && /\binductor\b/i.test(query)) {
      implicitInductanceMatch = this.extractImplicitInductance(query);
    }

    // Use the first value found (assuming one component type per search)
    if (capacitanceMatch) {
      result.value = this.normalizeCapacitance(capacitanceMatch);
    } else if (resistanceMatch) {
      result.value = this.normalizeResistance(resistanceMatch);
    } else if (inductanceMatch) {
      result.value = this.normalizeInductance(inductanceMatch);
    } else if (implicitResistanceMatch) {
      result.value = this.normalizeResistance(implicitResistanceMatch);
    } else if (implicitCapacitanceMatch) {
      result.value = this.normalizeCapacitance(implicitCapacitanceMatch);
    } else if (implicitInductanceMatch) {
      result.value = this.normalizeInductance(implicitInductanceMatch);
    }

    // Extract package size using the PackageRecognizer
    const packageType = PackageRecognizer.recognizePackage(query);
    if (packageType) {
      result.package = packageType;
    }

    // Extract component type
    const componentType = ComponentTypeRecognizer.recognizeComponentType(query);
    if (componentType) {
      result.componentType = componentType;
    }

    // Extract tolerance
    const tolerance = ComponentTypeRecognizer.extractTolerance(query);
    if (tolerance) {
      result.tolerance = tolerance;
    }

    // Extract keywords
    const keywords = ComponentTypeRecognizer.extractKeywords(query);
    if (keywords.length > 0) {
      result.keywords = keywords;
    }

    return result;
  }

  /**
   * Extracts non-electrical parameters for KiCad symbols
   * @param query - The search query to parse
   * @param result - The result object to populate
   * @private
   */
  private extractNonElectricalParameters(query: string, result: ParsedParameters): void {
    // Extract package size using the PackageRecognizer
    const packageType = PackageRecognizer.recognizePackage(query);
    if (packageType) {
      result.package = packageType;
    }

    // Extract component type
    const componentType = ComponentTypeRecognizer.recognizeComponentType(query);
    if (componentType) {
      result.componentType = componentType;
    }

    // Extract tolerance
    const tolerance = ComponentTypeRecognizer.extractTolerance(query);
    if (tolerance) {
      result.tolerance = tolerance;
    }

    // Extract keywords
    const keywords = ComponentTypeRecognizer.extractKeywords(query);
    if (keywords.length > 0) {
      result.keywords = keywords;
    }
  }

  /**
   * Extracts an electrical value from the query using the provided regex pattern
   * @param query - The search query
   * @param pattern - Regex pattern to match
   * @returns Electrical value or undefined if not found
   */
  private extractElectricalValue(query: string, pattern: RegExp): ElectricalValue | undefined {
    // Reset regex lastIndex to ensure we start from the beginning
    pattern.lastIndex = 0;

    const match = pattern.exec(query);
    if (!match) return undefined;

    return {
      value: parseFloat(match[1]),
      unit: match[0].substring(match[1].length).trim(),
      originalText: match[0],
    };
  }

  /**
   * Extracts implicit resistance values (e.g., "10k resistor")
   * @param query - The search query
   * @returns Electrical value or undefined if not found
   */
  private extractImplicitResistance(query: string): ElectricalValue | undefined {
    // Pattern for values with multipliers followed by "resistor" (e.g., "10k resistor", "1.5M resistor")
    const implicitPattern = /(\d+(?:\.\d+)?)\s*([mkMG]?)\s+resistor/i;
    const match = query.match(implicitPattern);

    if (match) {
      const value = parseFloat(match[1]);
      const multiplier = match[2] || '';
      return {
        value,
        unit: multiplier + 'Ω',
        originalText: match[0],
      };
    }

    return undefined;
  }

  /**
   * Extracts implicit capacitance values (e.g., "100n capacitor")
   * @param query - The search query
   * @returns Electrical value or undefined if not found
   */
  private extractImplicitCapacitance(query: string): ElectricalValue | undefined {
    // Pattern for values with multipliers followed by "capacitor" (e.g., "100n capacitor", "10u capacitor")
    const implicitPattern = /(\d+(?:\.\d+)?)\s*([pnumµ]?)\s+capacitor/i;
    const match = query.match(implicitPattern);

    if (match) {
      const value = parseFloat(match[1]);
      const multiplier = match[2] || '';
      return {
        value,
        unit: multiplier + 'F',
        originalText: match[0],
      };
    }

    return undefined;
  }

  /**
   * Extracts implicit inductance values (e.g., "10u inductor")
   * @param query - The search query
   * @returns Electrical value or undefined if not found
   */
  private extractImplicitInductance(query: string): ElectricalValue | undefined {
    // Pattern for values with multipliers followed by "inductor" (e.g., "10u inductor", "1m inductor")
    const implicitPattern = /(\d+(?:\.\d+)?)\s*([numµm]?)\s+inductor/i;
    const match = query.match(implicitPattern);

    if (match) {
      const value = parseFloat(match[1]);
      const multiplier = match[2] || '';
      return {
        value,
        unit: multiplier + 'H',
        originalText: match[0],
      };
    }

    return undefined;
  }

  /**
   * Normalizes voltage values to a standard unit (V)
   * @param value - The extracted voltage value
   * @returns Normalized voltage value
   */
  private normalizeVoltage(value: ElectricalValue): ElectricalValue {
    return {
      value: UnitConverter.normalizeVoltage(value.value, value.unit),
      unit: 'V',
      originalText: value.originalText,
    };
  }

  private normalizeCapacitance(value: ElectricalValue): ElectricalValue {
    return {
      value: UnitConverter.normalizeCapacitance(value.value, value.unit),
      unit: 'F',
      originalText: value.originalText,
    };
  }

  private normalizeResistance(value: ElectricalValue): ElectricalValue {
    return {
      value: UnitConverter.normalizeResistance(value.value, value.unit),
      unit: 'Ω',
      originalText: value.originalText,
    };
  }

  private normalizeInductance(value: ElectricalValue): ElectricalValue {
    return {
      value: UnitConverter.normalizeInductance(value.value, value.unit),
      unit: 'H',
      originalText: value.originalText,
    };
  }
}
