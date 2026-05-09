"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ElectricalParameterParser = exports.DataSourceType = void 0;
var PackageRecognizer_js_1 = require("./PackageRecognizer.js");
var ComponentTypeRecognizer_js_1 = require("./ComponentTypeRecognizer.js");
/**
 * Data source types that affect parameter parsing behavior
 */
var DataSourceType;
(function (DataSourceType) {
    /** KiCad symbols without electrical values */
    DataSourceType["KICAD"] = "kicad";
})(DataSourceType || (exports.DataSourceType = DataSourceType = {}));
/**
 * Implementation of the ParameterParser interface that extracts electrical parameters from search queries
 * Behavior varies based on data source type
 */
var ElectricalParameterParser = /** @class */ (function () {
    /**
     * Creates a new ElectricalParameterParser
     * @param dataSourceType - Type of data source to adjust parsing behavior
     */
    function ElectricalParameterParser(dataSourceType) {
        if (dataSourceType === void 0) { dataSourceType = DataSourceType.KICAD; }
        // Regex patterns for electrical parameters
        this.voltagePattern = /(\d+(?:\.\d+)?)\s*[Vv](?:olt)?(?:DC|AC)?/g;
        this.capacitancePattern = /(\d+(?:\.\d+)?)\s*(?:p|n|µ|u|m)?[Ff](?:arad)?/g;
        this.resistancePattern = /(\d+(?:\.\d+)?)\s*(?:m|k|M|G)?(?:Ω|ohm|Ohm|OHM|R)/g;
        this.inductancePattern = /(\d+(?:\.\d+)?)\s*(?:n|µ|u|m)?[Hh](?:enry)?/g;
        this.dataSourceType = dataSourceType;
    }
    /**
     * Parses a natural language query to extract electrical parameters
     * @param query - The search query to parse
     * @returns Structured parameters extracted from the query
     */
    ElectricalParameterParser.prototype.parseQuery = function (query) {
        var result = {};
        // For KiCad symbols, skip electrical parameter extraction since they don't have electrical values
        if (this.dataSourceType === DataSourceType.KICAD) {
            // Only extract non-electrical parameters for KiCad symbols
            this.extractNonElectricalParameters(query, result);
            return result;
        }
        // Extract voltage
        var voltageMatch = this.extractElectricalValue(query, this.voltagePattern);
        if (voltageMatch) {
            result.voltage = this.normalizeVoltage(voltageMatch);
        }
        // Extract component value (capacitance, resistance, or inductance)
        var capacitanceMatch = this.extractElectricalValue(query, this.capacitancePattern);
        var resistanceMatch = this.extractElectricalValue(query, this.resistancePattern);
        var inductanceMatch = this.extractElectricalValue(query, this.inductancePattern);
        // Check for implicit resistance values (e.g., "10k resistor")
        var implicitResistanceMatch;
        if (!resistanceMatch && /\bresistor\b/i.test(query)) {
            implicitResistanceMatch = this.extractImplicitResistance(query);
        }
        // Check for implicit capacitance values (e.g., "100n capacitor")
        var implicitCapacitanceMatch;
        if (!capacitanceMatch && /\bcapacitor\b/i.test(query)) {
            implicitCapacitanceMatch = this.extractImplicitCapacitance(query);
        }
        // Check for implicit inductance values (e.g., "10u inductor")
        var implicitInductanceMatch;
        if (!inductanceMatch && /\binductor\b/i.test(query)) {
            implicitInductanceMatch = this.extractImplicitInductance(query);
        }
        // Use the first value found (assuming one component type per search)
        if (capacitanceMatch) {
            result.value = this.normalizeCapacitance(capacitanceMatch);
        }
        else if (resistanceMatch) {
            result.value = this.normalizeResistance(resistanceMatch);
        }
        else if (inductanceMatch) {
            result.value = this.normalizeInductance(inductanceMatch);
        }
        else if (implicitResistanceMatch) {
            result.value = this.normalizeResistance(implicitResistanceMatch);
        }
        else if (implicitCapacitanceMatch) {
            result.value = this.normalizeCapacitance(implicitCapacitanceMatch);
        }
        else if (implicitInductanceMatch) {
            result.value = this.normalizeInductance(implicitInductanceMatch);
        }
        // Extract package size using the PackageRecognizer
        var packageType = PackageRecognizer_js_1.PackageRecognizer.recognizePackage(query);
        if (packageType) {
            result.package = packageType;
        }
        // Extract component type
        var componentType = ComponentTypeRecognizer_js_1.ComponentTypeRecognizer.recognizeComponentType(query);
        if (componentType) {
            result.componentType = componentType;
        }
        // Extract tolerance
        var tolerance = ComponentTypeRecognizer_js_1.ComponentTypeRecognizer.extractTolerance(query);
        if (tolerance) {
            result.tolerance = tolerance;
        }
        // Extract keywords
        var keywords = ComponentTypeRecognizer_js_1.ComponentTypeRecognizer.extractKeywords(query);
        if (keywords.length > 0) {
            result.keywords = keywords;
        }
        return result;
    };
    /**
     * Extracts non-electrical parameters for KiCad symbols
     * @param query - The search query to parse
     * @param result - The result object to populate
     * @private
     */
    ElectricalParameterParser.prototype.extractNonElectricalParameters = function (query, result) {
        // Extract package size using the PackageRecognizer
        var packageType = PackageRecognizer_js_1.PackageRecognizer.recognizePackage(query);
        if (packageType) {
            result.package = packageType;
        }
        // Extract component type
        var componentType = ComponentTypeRecognizer_js_1.ComponentTypeRecognizer.recognizeComponentType(query);
        if (componentType) {
            result.componentType = componentType;
        }
        // Extract tolerance
        var tolerance = ComponentTypeRecognizer_js_1.ComponentTypeRecognizer.extractTolerance(query);
        if (tolerance) {
            result.tolerance = tolerance;
        }
        // Extract keywords
        var keywords = ComponentTypeRecognizer_js_1.ComponentTypeRecognizer.extractKeywords(query);
        if (keywords.length > 0) {
            result.keywords = keywords;
        }
    };
    /**
     * Extracts an electrical value from the query using the provided regex pattern
     * @param query - The search query
     * @param pattern - Regex pattern to match
     * @returns Electrical value or undefined if not found
     */
    ElectricalParameterParser.prototype.extractElectricalValue = function (query, pattern) {
        // Reset regex lastIndex to ensure we start from the beginning
        pattern.lastIndex = 0;
        var match = pattern.exec(query);
        if (!match)
            return undefined;
        return {
            value: parseFloat(match[1]),
            unit: match[0].substring(match[1].length).trim(),
            originalText: match[0]
        };
    };
    /**
     * Extracts implicit resistance values (e.g., "10k resistor")
     * @param query - The search query
     * @returns Electrical value or undefined if not found
     */
    ElectricalParameterParser.prototype.extractImplicitResistance = function (query) {
        // Pattern for values with multipliers followed by "resistor" (e.g., "10k resistor", "1.5M resistor")
        var implicitPattern = /(\d+(?:\.\d+)?)\s*([mkMG]?)\s+resistor/i;
        var match = query.match(implicitPattern);
        if (match) {
            var value = parseFloat(match[1]);
            var multiplier = match[2] || '';
            return {
                value: value,
                unit: multiplier + 'Ω',
                originalText: match[0]
            };
        }
        return undefined;
    };
    /**
     * Extracts implicit capacitance values (e.g., "100n capacitor")
     * @param query - The search query
     * @returns Electrical value or undefined if not found
     */
    ElectricalParameterParser.prototype.extractImplicitCapacitance = function (query) {
        // Pattern for values with multipliers followed by "capacitor" (e.g., "100n capacitor", "10u capacitor")
        var implicitPattern = /(\d+(?:\.\d+)?)\s*([pnumµ]?)\s+capacitor/i;
        var match = query.match(implicitPattern);
        if (match) {
            var value = parseFloat(match[1]);
            var multiplier = match[2] || '';
            return {
                value: value,
                unit: multiplier + 'F',
                originalText: match[0]
            };
        }
        return undefined;
    };
    /**
     * Extracts implicit inductance values (e.g., "10u inductor")
     * @param query - The search query
     * @returns Electrical value or undefined if not found
     */
    ElectricalParameterParser.prototype.extractImplicitInductance = function (query) {
        // Pattern for values with multipliers followed by "inductor" (e.g., "10u inductor", "1m inductor")
        var implicitPattern = /(\d+(?:\.\d+)?)\s*([numµm]?)\s+inductor/i;
        var match = query.match(implicitPattern);
        if (match) {
            var value = parseFloat(match[1]);
            var multiplier = match[2] || '';
            return {
                value: value,
                unit: multiplier + 'H',
                originalText: match[0]
            };
        }
        return undefined;
    };
    /**
     * Normalizes voltage values to a standard unit (V)
     * @param value - The extracted voltage value
     * @returns Normalized voltage value
     */
    ElectricalParameterParser.prototype.normalizeVoltage = function (value) {
        // Voltage is already in V, no conversion needed
        return {
            value: value.value,
            unit: 'V',
            originalText: value.originalText
        };
    };
    /**
     * Normalizes capacitance values to a standard unit (F)
     * @param value - The extracted capacitance value
     * @returns Normalized capacitance value
     */
    ElectricalParameterParser.prototype.normalizeCapacitance = function (value) {
        var normalizedValue = value.value;
        var normalizedUnit = 'F';
        // Convert to base unit (F)
        if (value.unit.includes('p')) {
            normalizedValue *= 1e-12;
        }
        else if (value.unit.includes('n')) {
            normalizedValue *= 1e-9;
        }
        else if (value.unit.includes('µ') || value.unit.includes('u')) {
            normalizedValue *= 1e-6;
        }
        else if (value.unit.includes('m')) {
            normalizedValue *= 1e-3;
        }
        return {
            value: normalizedValue,
            unit: normalizedUnit,
            originalText: value.originalText
        };
    };
    /**
     * Normalizes resistance values to a standard unit (Ω)
     * @param value - The extracted resistance value
     * @returns Normalized resistance value
     */
    ElectricalParameterParser.prototype.normalizeResistance = function (value) {
        var normalizedValue = value.value;
        var normalizedUnit = 'Ω';
        // Convert to base unit (Ω)
        if (value.unit.includes('m')) {
            normalizedValue *= 1e-3;
        }
        else if (value.unit.includes('k')) {
            normalizedValue *= 1e3;
        }
        else if (value.unit.includes('M')) {
            normalizedValue *= 1e6;
        }
        else if (value.unit.includes('G')) {
            normalizedValue *= 1e9;
        }
        return {
            value: normalizedValue,
            unit: normalizedUnit,
            originalText: value.originalText
        };
    };
    /**
     * Normalizes inductance values to a standard unit (H)
     * @param value - The extracted inductance value
     * @returns Normalized inductance value
     */
    ElectricalParameterParser.prototype.normalizeInductance = function (value) {
        var normalizedValue = value.value;
        var normalizedUnit = 'H';
        // Convert to base unit (H)
        if (value.unit.includes('n')) {
            normalizedValue *= 1e-9;
        }
        else if (value.unit.includes('µ') || value.unit.includes('u')) {
            normalizedValue *= 1e-6;
        }
        else if (value.unit.includes('m')) {
            normalizedValue *= 1e-3;
        }
        return {
            value: normalizedValue,
            unit: normalizedUnit,
            originalText: value.originalText
        };
    };
    return ElectricalParameterParser;
}());
exports.ElectricalParameterParser = ElectricalParameterParser;
