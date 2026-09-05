import { ParsedParameters } from '../types/index.js';

/**
 * Interface for parsing natural language search queries into structured electrical parameters.
 *
 * The ParameterParser is responsible for extracting meaningful electrical parameters from
 * user search queries. It recognizes various formats of electrical values, component types,
 * packages, tolerances, and other specifications commonly used in electronics.
 *
 * @interface ParameterParser
 * @example
 * ```typescript
 * const parser: ParameterParser = new ElectricalParameterParser();
 *
 * // Parse a resistor query
 * const resistorParams = parser.parseQuery("10k resistor 0603 ±1%");
 * // Returns: { value: {value: 10000, unit: "Ω"}, package: "0603", tolerance: "±1%" }
 *
 * // Parse a capacitor query
 * const capacitorParams = parser.parseQuery("100nF 50V X7R ceramic");
 * // Returns: { value: {value: 100e-9, unit: "F"}, voltage: {value: 50, unit: "V"} }
 * ```
 */
export interface ParameterParser {
  /**
   * Parses a natural language search query into structured electrical parameters.
   *
   * This method analyzes the input query and extracts:
   * - Electrical values (resistance, capacitance, inductance)
   * - Voltage ratings
   * - Component packages (0603, SOT-23, etc.)
   * - Tolerances (±1%, ±5%, etc.)
   * - Component types (X7R, NP0, etc.)
   * - Keywords and descriptive terms
   *
   * @param query - Natural language search query to parse
   * @returns Structured parameters extracted from the query
   *
   * @example
   * ```typescript
   * // Resistor parsing
   * const params1 = parser.parseQuery("10k resistor 0603 ±1% 50V");
   * // Result: {
   * //   value: { value: 10000, unit: "Ω", originalText: "10k" },
   * //   voltage: { value: 50, unit: "V", originalText: "50V" },
   * //   package: "0603",
   * //   tolerance: "±1%",
   * //   componentType: "resistor"
   * // }
   *
   * // Capacitor parsing
   * const params2 = parser.parseQuery("100µF 16V tantalum SMD");
   * // Result: {
   * //   value: { value: 100e-6, unit: "F", originalText: "100µF" },
   * //   voltage: { value: 16, unit: "V", originalText: "16V" },
   * //   keywords: ["tantalum", "SMD"]
   * // }
   *
   * // IC parsing
   * const params3 = parser.parseQuery("STM32F103 microcontroller LQFP64");
   * // Result: {
   * //   keywords: ["STM32F103", "microcontroller"],
   * //   package: "LQFP64"
   * // }
   * ```
   */
  parseQuery(query: string): ParsedParameters;
}
