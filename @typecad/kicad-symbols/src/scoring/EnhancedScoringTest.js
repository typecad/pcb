"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnhancedScoringTest = void 0;
var EnhancedScoringSystem_js_1 = require("./EnhancedScoringSystem.js");
/**
 * Test file demonstrating the Enhanced Scoring System
 */
var EnhancedScoringTest = /** @class */ (function () {
    function EnhancedScoringTest() {
        this.scorer = new EnhancedScoringSystem_js_1.EnhancedScoringSystem();
    }
    /**
     * Test the enhanced scoring system with various examples
     */
    EnhancedScoringTest.prototype.runTests = function () {
        console.log('=== Enhanced Scoring System Tests ===\n');
        // Test 1: Sensirion 3.6V search
        this.testSensirionSearch();
        // Test 2: Frequency matching
        this.testFrequencyMatching();
        // Test 3: Memory size matching
        this.testMemoryMatching();
        // Test 4: Footprint matching
        this.testFootprintMatching();
        // Test 5: Multi-parameter matching
        this.testMultiParameterMatching();
        console.log('\n=== All Tests Completed ===');
    };
    /**
     * Test Sensirion 3.6V search (original problem case)
     */
    EnhancedScoringTest.prototype.testSensirionSearch = function () {
        console.log('Test 1: Sensirion 3.6V Search');
        console.log('Query: "sensirion 3.6V"');
        var parameters = {
            keywords: ['sensirion', '3.6V']
        };
        // Mock Sensirion humidity sensor component
        var sensirionComponent = {
            lcsc: 'Sensor:SHT30',
            category_id: 'Sensor',
            category: 'Sensor',
            subcategory: 'Humidity Sensor',
            mfr: 'SHT30',
            package: 'Symbol',
            joints: '0',
            manufacturer: 'Sensirion',
            basic: '1',
            preferred: '1',
            description: 'Digital humidity and temperature sensor, 1.2-3.6V operating voltage - Keywords: I2C SENSOR',
            datasheet: '',
            stock: '∞',
            last_on_stock: '2025-08-04T16:54:22.328Z',
            price: '[]',
            extra: JSON.stringify({
                symbolType: 'schematic',
                library: 'Sensor',
                originalDescription: 'Digital humidity and temperature sensor, 1.2-3.6V operating voltage',
                keywords: 'I2C SENSOR',
                keywordList: ['I2C', 'SENSOR'],
                searchTerms: ['sht30', 'sensor', 'digital', 'humidity', 'temperature', '12-36v', 'operating', 'voltage', 'i2c'],
                properties: [
                    { name: 'Reference', value: 'U' },
                    { name: 'Value', value: 'SHT30' },
                    { name: 'Description', value: 'Digital humidity and temperature sensor, 1.2-3.6V operating voltage' },
                    { name: 'ki_keywords', value: 'I2C SENSOR' }
                ]
            }),
            assembly_process: 'N/A',
            min_order_qty: '0',
            attrition_qty: '0'
        };
        var score = this.scorer.scoreComponent(sensirionComponent, parameters);
        console.log("Score: ".concat(score.score));
        console.log('Match Details:');
        score.matchDetails.forEach(function (detail) {
            console.log("  - ".concat(detail.parameter, ": ").concat(detail.score, " points (").concat(detail.reason, ")"));
        });
        console.log('');
    };
    /**
     * Test frequency matching
     */
    EnhancedScoringTest.prototype.testFrequencyMatching = function () {
        console.log('Test 2: Frequency Matching');
        console.log('Query: "32MHz oscillator"');
        var parameters = {
            keywords: ['32MHz', 'oscillator']
        };
        // Mock oscillator component
        var oscillatorComponent = {
            lcsc: 'Oscillator:32MHz',
            category_id: 'Oscillator',
            category: 'Oscillator',
            subcategory: 'Crystal Oscillator',
            mfr: '32MHz',
            package: 'Symbol',
            joints: '0',
            manufacturer: 'KiCad',
            basic: '1',
            preferred: '1',
            description: '32MHz Crystal Oscillator, 3.3V operation - Keywords: Crystal Clock',
            datasheet: '',
            stock: '∞',
            last_on_stock: '2025-08-04T16:54:22.328Z',
            price: '[]',
            extra: JSON.stringify({
                symbolType: 'schematic',
                library: 'Oscillator',
                originalDescription: '32MHz Crystal Oscillator, 3.3V operation',
                keywords: 'Crystal Clock',
                keywordList: ['Crystal', 'Clock'],
                searchTerms: ['32mhz', 'oscillator', 'crystal', 'clock', '33v', 'operation'],
                properties: [
                    { name: 'Reference', value: 'Y' },
                    { name: 'Value', value: '32MHz' },
                    { name: 'Description', value: '32MHz Crystal Oscillator, 3.3V operation' },
                    { name: 'ki_keywords', value: 'Crystal Clock' }
                ]
            }),
            assembly_process: 'N/A',
            min_order_qty: '0',
            attrition_qty: '0'
        };
        var score = this.scorer.scoreComponent(oscillatorComponent, parameters);
        console.log("Score: ".concat(score.score));
        console.log('Match Details:');
        score.matchDetails.forEach(function (detail) {
            console.log("  - ".concat(detail.parameter, ": ").concat(detail.score, " points (").concat(detail.reason, ")"));
        });
        console.log('');
    };
    /**
     * Test memory size matching
     */
    EnhancedScoringTest.prototype.testMemoryMatching = function () {
        console.log('Test 3: Memory Size Matching');
        console.log('Query: "256KB EEPROM"');
        var parameters = {
            keywords: ['256KB', 'EEPROM']
        };
        // Mock EEPROM component
        var eepromComponent = {
            lcsc: 'Memory_EEPROM:24C256',
            category_id: 'Memory_EEPROM',
            category: 'Memory_EEPROM',
            subcategory: 'EEPROM',
            mfr: '24C256',
            package: 'Symbol',
            joints: '0',
            manufacturer: 'KiCad',
            basic: '1',
            preferred: '1',
            description: '256KB I2C EEPROM, 1.8-5.5V operation - Keywords: I2C EEPROM Serial 256KB',
            datasheet: '',
            stock: '∞',
            last_on_stock: '2025-08-04T16:54:22.328Z',
            price: '[]',
            extra: JSON.stringify({
                symbolType: 'schematic',
                library: 'Memory_EEPROM',
                originalDescription: '256KB I2C EEPROM, 1.8-5.5V operation',
                keywords: 'I2C EEPROM Serial 256KB',
                keywordList: ['I2C', 'EEPROM', 'Serial', '256KB'],
                searchTerms: ['24c256', 'memory_eeprom', '256kb', 'i2c', 'eeprom', 'serial', '18-55v', 'operation'],
                properties: [
                    { name: 'Reference', value: 'U' },
                    { name: 'Value', value: '24C256' },
                    { name: 'Description', value: '256KB I2C EEPROM, 1.8-5.5V operation' },
                    { name: 'ki_keywords', value: 'I2C EEPROM Serial 256KB' }
                ]
            }),
            assembly_process: 'N/A',
            min_order_qty: '0',
            attrition_qty: '0'
        };
        var score = this.scorer.scoreComponent(eepromComponent, parameters);
        console.log("Score: ".concat(score.score));
        console.log('Match Details:');
        score.matchDetails.forEach(function (detail) {
            console.log("  - ".concat(detail.parameter, ": ").concat(detail.score, " points (").concat(detail.reason, ")"));
        });
        console.log('');
    };
    /**
     * Test footprint matching
     */
    EnhancedScoringTest.prototype.testFootprintMatching = function () {
        console.log('Test 4: Footprint Matching');
        console.log('Query: "QFN package"');
        var parameters = {
            keywords: ['QFN', 'package'],
            package: 'QFN'
        };
        // Mock QFN component
        var qfnComponent = {
            lcsc: 'IC:QFN_Example',
            category_id: 'IC',
            category: 'IC',
            subcategory: 'Integrated Circuit',
            mfr: 'QFN_Example',
            package: 'Symbol',
            joints: '0',
            manufacturer: 'KiCad',
            basic: '1',
            preferred: '1',
            description: 'Example IC in QFN-16 package, 3.3V operation - Keywords: QFN IC',
            datasheet: '',
            stock: '∞',
            last_on_stock: '2025-08-04T16:54:22.328Z',
            price: '[]',
            extra: JSON.stringify({
                symbolType: 'schematic',
                library: 'IC',
                originalDescription: 'Example IC in QFN-16 package, 3.3V operation',
                keywords: 'QFN IC',
                keywordList: ['QFN', 'IC'],
                searchTerms: ['qfn', 'example', 'ic', 'qfn16', 'package', '33v', 'operation'],
                properties: [
                    { name: 'Reference', value: 'U' },
                    { name: 'Value', value: 'QFN_Example' },
                    { name: 'Description', value: 'Example IC in QFN-16 package, 3.3V operation' },
                    { name: 'ki_keywords', value: 'QFN IC' }
                ]
            }),
            assembly_process: 'N/A',
            min_order_qty: '0',
            attrition_qty: '0'
        };
        var score = this.scorer.scoreComponent(qfnComponent, parameters);
        console.log("Score: ".concat(score.score));
        console.log('Match Details:');
        score.matchDetails.forEach(function (detail) {
            console.log("  - ".concat(detail.parameter, ": ").concat(detail.score, " points (").concat(detail.reason, ")"));
        });
        console.log('');
    };
    /**
     * Test multi-parameter matching
     */
    EnhancedScoringTest.prototype.testMultiParameterMatching = function () {
        console.log('Test 5: Multi-Parameter Matching');
        console.log('Query: "Sensirion 3.6V QFN sensor"');
        var parameters = {
            keywords: ['Sensirion', '3.6V', 'QFN', 'sensor'],
            package: 'QFN'
        };
        // Mock multi-parameter component
        var multiParamComponent = {
            lcsc: 'Sensor:SHT30_QFN',
            category_id: 'Sensor',
            category: 'Sensor',
            subcategory: 'Humidity Sensor',
            mfr: 'SHT30',
            package: 'Symbol',
            joints: '0',
            manufacturer: 'Sensirion',
            basic: '1',
            preferred: '1',
            description: 'Sensirion SHT30 digital humidity sensor in QFN-8 package, 1.2-3.6V operation - Keywords: I2C SENSOR QFN',
            datasheet: '',
            stock: '∞',
            last_on_stock: '2025-08-04T16:54:22.328Z',
            price: '[]',
            extra: JSON.stringify({
                symbolType: 'schematic',
                library: 'Sensor',
                originalDescription: 'Sensirion SHT30 digital humidity sensor in QFN-8 package, 1.2-3.6V operation',
                keywords: 'I2C SENSOR QFN',
                keywordList: ['I2C', 'SENSOR', 'QFN'],
                searchTerms: ['sht30', 'sensirion', 'sensor', 'digital', 'humidity', 'qfn8', 'package', '12-36v', 'operation', 'i2c'],
                properties: [
                    { name: 'Reference', value: 'U' },
                    { name: 'Value', value: 'SHT30' },
                    { name: 'Description', value: 'Sensirion SHT30 digital humidity sensor in QFN-8 package, 1.2-3.6V operation' },
                    { name: 'ki_keywords', value: 'I2C SENSOR QFN' }
                ]
            }),
            assembly_process: 'N/A',
            min_order_qty: '0',
            attrition_qty: '0'
        };
        var score = this.scorer.scoreComponent(multiParamComponent, parameters);
        console.log("Score: ".concat(score.score));
        console.log('Match Details:');
        score.matchDetails.forEach(function (detail) {
            console.log("  - ".concat(detail.parameter, ": ").concat(detail.score, " points (").concat(detail.reason, ")"));
        });
        console.log('');
    };
    return EnhancedScoringTest;
}());
exports.EnhancedScoringTest = EnhancedScoringTest;
// Run tests if this file is executed directly
if (import.meta.url === "file://".concat(process.argv[1])) {
    var test = new EnhancedScoringTest();
    test.runTests();
}
