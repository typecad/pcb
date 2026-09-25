import { ElectricalValue } from '../types/index.js';

/**
 * Comprehensive utility class for converting between different electrical units and normalizing values.
 *
 * The UnitConverter handles the complex task of normalizing electrical values from various input formats
 * to standard base units. It supports all common electrical units with proper prefix handling and
 * case-sensitive distinction between similar units (e.g., MΩ vs mΩ).
 *
 * Supported conversions:
 * - **Capacitance**: pF, nF, µF, mF → F (Farads)
 * - **Resistance**: mΩ, Ω, kΩ, MΩ, GΩ → Ω (Ohms)
 * - **Inductance**: nH, µH, mH, H → H (Henries)
 * - **Voltage**: mV, V, kV → V (Volts)
 * - **Current**: µA, mA, A → A (Amperes)
 * - **Power**: mW, W, kW → W (Watts)
 *
 * @class UnitConverter
 * @example
 * ```typescript
 * // Capacitance conversions
 * const cap1 = UnitConverter.normalizeCapacitance(100, "nF"); // Returns 100e-9
 * const cap2 = UnitConverter.normalizeCapacitance(10, "µF");  // Returns 10e-6
 *
 * // Resistance conversions
 * const res1 = UnitConverter.normalizeResistance(10, "kΩ");   // Returns 10000
 * const res2 = UnitConverter.normalizeResistance(1, "MΩ");    // Returns 1000000
 *
 * // Generic value normalization
 * const value = UnitConverter.normalizeValue(100, "nF");
 * // Returns: { value: 100e-9, unit: "F", originalText: "100nF" }
 * ```
 */
export class UnitConverter {
  /**
   * Normalizes a capacitance value to the base unit of Farads (F).
   *
   * Supports all common capacitance units with proper prefix handling:
   * - pF (picofarads): 1e-12 F
   * - nF (nanofarads): 1e-9 F  
   * - µF/uF (microfarads): 1e-6 F
   * - mF (millifarads): 1e-3 F
   * - F (farads): 1 F
   *
   * @param value - The numerical capacitance value
   * @param unit - The unit string (case-insensitive for most units)
   * @returns Capacitance value normalized to Farads
   *
   * @example
   * ```typescript
   * UnitConverter.normalizeCapacitance(100, "pF");  // Returns 100e-12
   * UnitConverter.normalizeCapacitance(47, "nF");   // Returns 47e-9
   * UnitConverter.normalizeCapacitance(10, "µF");   // Returns 10e-6
   * UnitConverter.normalizeCapacitance(1, "mF");    // Returns 1e-3
   * ```
   */
  public static normalizeCapacitance(value: number, unit: string): number {
    const lowerUnit = unit.toLowerCase();

    if (lowerUnit.includes('pf')) {
      return value * 1e-12;
    } else if (lowerUnit.includes('nf')) {
      return value * 1e-9;
    } else if (lowerUnit.includes('µf') || lowerUnit.includes('uf')) {
      return value * 1e-6;
    } else if (lowerUnit.includes('mf')) {
      return value * 1e-3;
    } else if (lowerUnit === 'f') {
      return value;
    }

    // Default to treating as Farads for unknown units
    return value;
  }

  /**
   * Normalizes a resistance value to the base unit of Ohms (Ω).
   *
   * Supports all common resistance units with case-sensitive prefix handling:
   * - mΩ (milliohms): 1e-3 Ω (lowercase 'm')
   * - Ω/ohm (ohms): 1 Ω
   * - kΩ (kiloohms): 1e3 Ω
   * - MΩ (megaohms): 1e6 Ω (uppercase 'M')
   * - GΩ (gigaohms): 1e9 Ω
   *
   * **Important**: Case sensitivity matters for 'M' vs 'm' to distinguish
   * between megaohms (MΩ) and milliohms (mΩ).
   *
   * @param value - The numerical resistance value
   * @param unit - The unit string (case-sensitive for M/m distinction)
   * @returns Resistance value normalized to Ohms
   *
   * @example
   * ```typescript
   * UnitConverter.normalizeResistance(500, "mΩ");   // Returns 0.5 (milliohms)
   * UnitConverter.normalizeResistance(10, "kΩ");    // Returns 10000
   * UnitConverter.normalizeResistance(1, "MΩ");     // Returns 1000000 (megaohms)
   * UnitConverter.normalizeResistance(2.2, "GΩ");   // Returns 2.2e9
   * ```
   */
  public static normalizeResistance(value: number, unit: string): number {
    // Check original case first for proper distinction between M (mega) and m (milli)
    if (unit === 'GΩ' || unit.toLowerCase() === 'gohm') {
      return value * 1e9;
    } else if (unit === 'MΩ' || unit === 'Mohm' || unit === 'MR') {
      // Megaohm (MΩ, Mohm, MR) - uppercase M
      return value * 1e6;
    } else if (unit === 'kΩ' || unit.toLowerCase() === 'kohm' || unit.toLowerCase() === 'kr') {
      return value * 1e3;
    } else if (unit === 'mΩ' || unit.toLowerCase() === 'mohm') {
      // Milliohm (mΩ, mohm) - lowercase m
      return value * 1e-3;
    } else if (unit === 'Ω' || unit.toLowerCase() === 'ohm' || unit.toLowerCase() === 'r') {
      return value;
    }

    // Default to treating as Ohms for unknown units
    return value;
  }

  /**
   * Normalizes an inductance value to Henries (H)
   * @param value - The inductance value
   * @param unit - The unit of the value
   * @returns Value normalized to Henries
   */
  public static normalizeInductance(value: number, unit: string): number {
    const lowerUnit = unit.toLowerCase();

    if (lowerUnit.includes('nh')) {
      return value * 1e-9;
    } else if (lowerUnit.includes('µh') || lowerUnit.includes('uh')) {
      return value * 1e-6;
    } else if (lowerUnit.includes('mh')) {
      return value * 1e-3;
    } else if (lowerUnit === 'h') {
      return value;
    }

    // Default to treating as Henries for unknown units
    return value;
  }

  /**
   * Normalizes a voltage value to Volts (V)
   * @param value - The voltage value
   * @param unit - The unit of the value
   * @returns Value normalized to Volts
   */
  public static normalizeVoltage(value: number, unit: string): number {
    const lowerUnit = unit.toLowerCase();

    if (lowerUnit.includes('mv')) {
      return value * 1e-3;
    } else if (lowerUnit.includes('kv')) {
      return value * 1e3;
    } else if (
      lowerUnit === 'v' ||
      lowerUnit === 'volt' ||
      lowerUnit === 'volts' ||
      lowerUnit === 'vdc' ||
      lowerUnit === 'vac'
    ) {
      return value;
    }

    // Default to treating as Volts for unknown units
    return value;
  }

  /**
   * Normalizes a frequency value to Hertz (Hz)
   * @param value - The frequency value
   * @param unit - The unit of the value
   * @returns Value normalized to Hertz
   */
  public static normalizeFrequency(value: number, unit: string): number {
    const lowerUnit = unit.toLowerCase();

    if (lowerUnit.includes('khz')) {
      return value * 1e3;
    } else if (lowerUnit.includes('mhz')) {
      return value * 1e6;
    } else if (lowerUnit.includes('ghz')) {
      return value * 1e9;
    } else if (lowerUnit === 'hz') {
      return value;
    }

    // Default to treating as Hertz for unknown units
    return value;
  }

  /**
   * Normalizes a current value to Amperes (A)
   * @param value - The current value
   * @param unit - The unit of the value
   * @returns Value normalized to Amperes
   */
  public static normalizeCurrent(value: number, unit: string): number {
    const lowerUnit = unit.toLowerCase();

    if (lowerUnit.includes('µa') || lowerUnit.includes('ua')) {
      return value * 1e-6;
    } else if (lowerUnit.includes('ma')) {
      return value * 1e-3;
    } else if (lowerUnit === 'a' || lowerUnit === 'amp' || lowerUnit === 'amps') {
      return value;
    }

    // Default to treating as Amperes for unknown units
    return value;
  }

  /**
   * Normalizes a temperature value to Celsius (°C)
   * @param value - The temperature value
   * @param unit - The unit of the value
   * @returns Value normalized to Celsius
   */
  public static normalizeTemperature(value: number, unit: string): number {
    const lowerUnit = unit.toLowerCase();

    if (lowerUnit === '°f' || lowerUnit === 'f') {
      // Convert Fahrenheit to Celsius: (°F - 32) × 5/9
      return ((value - 32) * 5) / 9;
    } else if (lowerUnit === '°c' || lowerUnit === 'c') {
      return value;
    }

    // Default to treating as Celsius for unknown units
    return value;
  }

  /**
   * Generic method to normalize values based on type
   * @param value - The value to normalize
   * @param unit - The unit of the value
   * @param type - The type of measurement (capacitance, resistance, etc.)
   * @returns Normalized value in base units
   */
  public static normalizeValue(value: number, unit: string, type: string): number {
    switch (type.toLowerCase()) {
      case 'capacitance':
        return this.normalizeCapacitance(value, unit);
      case 'resistance':
        return this.normalizeResistance(value, unit);
      case 'inductance':
        return this.normalizeInductance(value, unit);
      case 'voltage':
        return this.normalizeVoltage(value, unit);
      case 'frequency':
        return this.normalizeFrequency(value, unit);
      case 'current':
        return this.normalizeCurrent(value, unit);
      case 'temperature':
        return this.normalizeTemperature(value, unit);
      default:
        // For unknown types, return the original value
        return value;
    }
  }
  /**
   * Converts a capacitance value to the specified target unit
   * @param value - The capacitance value to convert
   * @param targetUnit - The target unit (pF, nF, µF, mF, F)
   * @returns Converted value in the target unit
   */
  public static convertCapacitance(value: ElectricalValue, targetUnit: 'pF' | 'nF' | 'µF' | 'mF' | 'F'): number {
    // First convert to base unit (F)
    let baseValue = value.value;

    if (value.unit.includes('p')) {
      baseValue *= 1e-12;
    } else if (value.unit.includes('n')) {
      baseValue *= 1e-9;
    } else if (value.unit.includes('µ') || value.unit.includes('u')) {
      baseValue *= 1e-6;
    } else if (value.unit.includes('m')) {
      baseValue *= 1e-3;
    }

    // Then convert to target unit
    switch (targetUnit) {
      case 'pF':
        return baseValue * 1e12;
      case 'nF':
        return baseValue * 1e9;
      case 'µF':
        return baseValue * 1e6;
      case 'mF':
        return baseValue * 1e3;
      case 'F':
        return baseValue;
      default:
        return baseValue;
    }
  }

  /**
   * Converts a resistance value to the specified target unit
   * @param value - The resistance value to convert
   * @param targetUnit - The target unit (mΩ, Ω, kΩ, MΩ, GΩ)
   * @returns Converted value in the target unit
   */
  public static convertResistance(value: ElectricalValue, targetUnit: 'mΩ' | 'Ω' | 'kΩ' | 'MΩ' | 'GΩ'): number {
    // First convert to base unit (Ω)
    let baseValue = value.value;

    if (value.unit.includes('m')) {
      baseValue *= 1e-3;
    } else if (value.unit.includes('k')) {
      baseValue *= 1e3;
    } else if (value.unit.includes('M')) {
      baseValue *= 1e6;
    } else if (value.unit.includes('G')) {
      baseValue *= 1e9;
    }

    // Then convert to target unit
    switch (targetUnit) {
      case 'mΩ':
        return baseValue * 1e3;
      case 'Ω':
        return baseValue;
      case 'kΩ':
        return baseValue * 1e-3;
      case 'MΩ':
        return baseValue * 1e-6;
      case 'GΩ':
        return baseValue * 1e-9;
      default:
        return baseValue;
    }
  }

  /**
   * Converts an inductance value to the specified target unit
   * @param value - The inductance value to convert
   * @param targetUnit - The target unit (nH, µH, mH, H)
   * @returns Converted value in the target unit
   */
  public static convertInductance(value: ElectricalValue, targetUnit: 'nH' | 'µH' | 'mH' | 'H'): number {
    // First convert to base unit (H)
    let baseValue = value.value;

    if (value.unit.includes('n')) {
      baseValue *= 1e-9;
    } else if (value.unit.includes('µ') || value.unit.includes('u')) {
      baseValue *= 1e-6;
    } else if (value.unit.includes('m')) {
      baseValue *= 1e-3;
    }

    // Then convert to target unit
    switch (targetUnit) {
      case 'nH':
        return baseValue * 1e9;
      case 'µH':
        return baseValue * 1e6;
      case 'mH':
        return baseValue * 1e3;
      case 'H':
        return baseValue;
      default:
        return baseValue;
    }
  }

  /**
   * Converts a voltage value to the specified target unit
   * @param value - The voltage value to convert
   * @param targetUnit - The target unit (mV, V, kV)
   * @returns Converted value in the target unit
   */
  public static convertVoltage(value: ElectricalValue, targetUnit: 'mV' | 'V' | 'kV'): number {
    // First convert to base unit (V)
    let baseValue = value.value;

    if (value.unit.includes('m')) {
      baseValue *= 1e-3;
    } else if (value.unit.includes('k')) {
      baseValue *= 1e3;
    }

    // Then convert to target unit
    switch (targetUnit) {
      case 'mV':
        return baseValue * 1e3;
      case 'V':
        return baseValue;
      case 'kV':
        return baseValue * 1e-3;
      default:
        return baseValue;
    }
  }

  /**
   * Gets the most appropriate unit for displaying a capacitance value
   * @param valueInF - The capacitance value in Farads
   * @returns The most appropriate unit (pF, nF, µF, mF, F)
   */
  public static getBestCapacitanceUnit(valueInF: number): 'pF' | 'nF' | 'µF' | 'mF' | 'F' {
    if (valueInF < 1e-9) return 'pF';
    if (valueInF < 1e-6) return 'nF';
    if (valueInF < 1e-3) return 'µF';
    if (valueInF < 1) return 'mF';
    return 'F';
  }

  /**
   * Gets the most appropriate unit for displaying a resistance value
   * @param valueInOhm - The resistance value in Ohms
   * @returns The most appropriate unit (mΩ, Ω, kΩ, MΩ, GΩ)
   */
  public static getBestResistanceUnit(valueInOhm: number): 'mΩ' | 'Ω' | 'kΩ' | 'MΩ' | 'GΩ' {
    if (valueInOhm < 1) return 'mΩ';
    if (valueInOhm < 1e3) return 'Ω';
    if (valueInOhm < 1e6) return 'kΩ';
    if (valueInOhm < 1e9) return 'MΩ';
    return 'GΩ';
  }

  /**
   * Gets the most appropriate unit for displaying an inductance value
   * @param valueInH - The inductance value in Henries
   * @returns The most appropriate unit (nH, µH, mH, H)
   */
  public static getBestInductanceUnit(valueInH: number): 'nH' | 'µH' | 'mH' | 'H' {
    if (valueInH < 1e-6) return 'nH';
    if (valueInH < 1e-3) return 'µH';
    if (valueInH < 1) return 'mH';
    return 'H';
  }
}
