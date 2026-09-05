import { describe, it, expect } from 'vitest';
import { ComponentFuzzyScorer, ComponentType } from '../FuzzyScorer.js';
import { ComponentRecord, ElectricalValue, ParsedParameters } from '../../types/index.js';

describe('ComponentFuzzyScorer', () => {
  const scorer = new ComponentFuzzyScorer();

  // Helper function to create a test component
  function createTestComponent(overrides: Partial<ComponentRecord> = {}): ComponentRecord {
    return {
      lcsc: 'C1234',
      category_id: '1',
      category: 'Capacitors',
      subcategory: 'MLCC - SMD/SMT',
      mfr: 'ABC123',
      package: '0603',
      joints: '2',
      manufacturer: 'Test Manufacturer',
      basic: '1',
      preferred: '1',
      description: '100nF 50V X7R 0603 Ceramic Capacitor',
      datasheet: 'http://example.com/datasheet.pdf',
      stock: '1000',
      last_on_stock: '2023-01-01',
      price: '{"1":0.01,"10":0.009,"100":0.008}',
      extra: '{}',
      assembly_process: 'SMT',
      min_order_qty: '1',
      attrition_qty: '0',
      ...overrides,
    };
  }

  // Helper function to create a test connector component
  function createConnectorComponent(overrides: Partial<ComponentRecord> = {}): ComponentRecord {
    return {
      lcsc: 'C5678',
      category_id: '2',
      category: 'Connectors',
      subcategory: 'Headers & Wire Housings',
      mfr: 'HDR123',
      package: 'THT',
      joints: '10',
      manufacturer: 'Test Manufacturer',
      basic: '1',
      preferred: '1',
      description: '10-Pin 2.54mm Male Header Connector',
      datasheet: 'http://example.com/datasheet.pdf',
      stock: '500',
      last_on_stock: '2023-01-01',
      price: '{"1":0.05,"10":0.045,"100":0.04}',
      extra: '{}',
      assembly_process: 'THT',
      min_order_qty: '1',
      attrition_qty: '0',
      ...overrides,
    };
  }

  // Helper function to create a test switch component
  function createSwitchComponent(overrides: Partial<ComponentRecord> = {}): ComponentRecord {
    return {
      lcsc: 'C9012',
      category_id: '3',
      category: 'Switches',
      subcategory: 'Tactile Switches',
      mfr: 'SW123',
      package: 'SMD',
      joints: '4',
      manufacturer: 'Test Manufacturer',
      basic: '1',
      preferred: '1',
      description: '6x6mm Tactile Momentary Push Button Switch',
      datasheet: 'http://example.com/datasheet.pdf',
      stock: '300',
      last_on_stock: '2023-01-01',
      price: '{"1":0.03,"10":0.027,"100":0.024}',
      extra: '{}',
      assembly_process: 'SMT',
      min_order_qty: '1',
      attrition_qty: '0',
      ...overrides,
    };
  }

  // Helper function to create a test IC component
  function createICComponent(overrides: Partial<ComponentRecord> = {}): ComponentRecord {
    return {
      lcsc: 'C3456',
      category_id: '4',
      category: 'Integrated Circuits (ICs)',
      subcategory: 'Microcontrollers',
      mfr: 'ATMEGA328P-AU',
      package: 'TQFP-32',
      joints: '32',
      manufacturer: 'Test Manufacturer',
      basic: '1',
      preferred: '1',
      description: 'ATMEGA328P 8-bit AVR Microcontroller 20MHz 32KB Flash',
      datasheet: 'http://example.com/datasheet.pdf',
      stock: '100',
      last_on_stock: '2023-01-01',
      price: '{"1":2.50,"10":2.25,"100":2.00}',
      extra: '{}',
      assembly_process: 'SMT',
      min_order_qty: '1',
      attrition_qty: '0',
      ...overrides,
    };
  }

  describe('scoreComponent', () => {
    it('should score exact matches with full points', () => {
      const component = createTestComponent();
      const parameters: ParsedParameters = {
        value: { value: 100e-9, unit: 'F', originalText: '100nF' },
        voltage: { value: 50, unit: 'V', originalText: '50V' },
        componentType: 'X7R',
        package: '0603',
      };

      const result = scorer.scoreComponent(component, parameters);

      // Should have at least 3 exact matches (value, voltage, type, package)
      expect(result.matchDetails.filter((d) => d.exact).length).toBeGreaterThanOrEqual(3);
      expect(result.score).toBeGreaterThan(300); // At least 100 points per exact match
    });

    it('should score close value matches with partial points', () => {
      const component = createTestComponent();
      const parameters: ParsedParameters = {
        value: { value: 101e-9, unit: 'F', originalText: '101nF' }, // Slightly different value
      };

      const result = scorer.scoreComponent(component, parameters);

      // Should have a value match with high but not perfect score
      const valueMatch = result.matchDetails.find((d) => d.parameter === 'capacitance');
      expect(valueMatch).toBeDefined();
      expect(valueMatch?.score).toBeGreaterThan(90); // Close match should get high score
      expect(valueMatch?.exact).toBe(false);
    });

    it('should score higher voltage with good points', () => {
      const component = createTestComponent({
        description: '100nF 100V X7R 0603 Ceramic Capacitor', // Higher voltage
      });
      const parameters: ParsedParameters = {
        voltage: { value: 50, unit: 'V', originalText: '50V' },
      };

      const result = scorer.scoreComponent(component, parameters);

      // Higher voltage should get good score
      const voltageMatch = result.matchDetails.find((d) => d.parameter === 'voltage');
      expect(voltageMatch).toBeDefined();
      expect(voltageMatch?.score).toBeGreaterThan(80); // Higher voltage is good
      expect(voltageMatch?.exact).toBe(false);
    });

    it('should score lower voltage with lower points', () => {
      const component = createTestComponent({
        description: '100nF 25V X7R 0603 Ceramic Capacitor', // Lower voltage
      });
      const parameters: ParsedParameters = {
        voltage: { value: 50, unit: 'V', originalText: '50V' },
      };

      const result = scorer.scoreComponent(component, parameters);

      // Lower voltage should get lower score or no match
      const voltageMatch = result.matchDetails.find((d) => d.parameter === 'voltage');
      if (voltageMatch) {
        expect(voltageMatch.score).toBeLessThan(70); // Lower voltage is problematic
        expect(voltageMatch.exact).toBe(false);
      }
    });

    it('should score similar packages with partial points', () => {
      const component = createTestComponent({
        package: '0805', // Similar but different package
      });
      const parameters: ParsedParameters = {
        package: '0603',
      };

      const result = scorer.scoreComponent(component, parameters);

      // Should have a package match with partial score
      const packageMatch = result.matchDetails.find((d) => d.parameter === 'package');
      expect(packageMatch).toBeDefined();
      expect(packageMatch?.score).toBeLessThan(80); // Not an exact match
      expect(packageMatch?.exact).toBe(false);
    });

    it('should score component type matches', () => {
      const component = createTestComponent();
      const parameters: ParsedParameters = {
        componentType: 'X7R',
      };

      const result = scorer.scoreComponent(component, parameters);

      // Should have a component type match
      const typeMatch = result.matchDetails.find((d) => d.parameter === 'componentType');
      expect(typeMatch).toBeDefined();
      expect(typeMatch?.score).toBeGreaterThan(0);
    });

    it('should score tolerance matches', () => {
      const component = createTestComponent({
        description: '100nF 50V X7R ±5% 0603 Ceramic Capacitor', // Added tolerance
      });
      const parameters: ParsedParameters = {
        tolerance: '±5%',
      };

      const result = scorer.scoreComponent(component, parameters);

      // Should have a tolerance match
      const toleranceMatch = result.matchDetails.find((d) => d.parameter === 'tolerance');
      expect(toleranceMatch).toBeDefined();
      expect(toleranceMatch?.score).toBeGreaterThan(0);
      expect(toleranceMatch?.exact).toBe(true);
    });

    it('should score keyword matches', () => {
      const component = createTestComponent();
      const parameters: ParsedParameters = {
        keywords: ['Ceramic', 'Capacitor', 'SMD'],
      };

      const result = scorer.scoreComponent(component, parameters);

      // Should have a keyword match
      const keywordMatch = result.matchDetails.find((d) => d.parameter === 'keywords');
      expect(keywordMatch).toBeDefined();
      expect(keywordMatch?.score).toBeGreaterThan(0);
    });

    it('should score category matches', () => {
      const component = createTestComponent();
      const parameters: ParsedParameters = {
        componentType: 'Capacitor',
      };

      const result = scorer.scoreComponent(component, parameters);

      // Should have a category match
      const categoryMatch = result.matchDetails.find((d) => d.parameter === 'category');
      expect(categoryMatch).toBeDefined();
      expect(categoryMatch?.score).toBeGreaterThan(0);
    });
  });

  describe('component-specific scoring strategies', () => {
    it('should apply different weights for capacitors', () => {
      const capacitor = createTestComponent();
      const parameters: ParsedParameters = {
        value: { value: 100e-9, unit: 'F', originalText: '100nF' },
        voltage: { value: 50, unit: 'V', originalText: '50V' },
        package: '0603',
        tolerance: '±10%',
      };

      const result = scorer.scoreComponent(capacitor, parameters);

      // Value should have higher weight for capacitors
      const valueMatch = result.matchDetails.find((d) => d.parameter === 'capacitance');
      const voltageMatch = result.matchDetails.find((d) => d.parameter === 'voltage');

      expect(valueMatch).toBeDefined();
      expect(voltageMatch).toBeDefined();

      // For capacitors, value should be weighted higher than voltage
      if (valueMatch && voltageMatch && valueMatch.exact && voltageMatch.exact) {
        expect(valueMatch.score).toBeGreaterThan(100); // Base score with weight applied
      }
    });

    it('should apply different weights for resistors', () => {
      const resistor = createTestComponent({
        category: 'Resistors',
        description: '10kΩ ±1% 0603 Thick Film Resistor',
      });
      const parameters: ParsedParameters = {
        value: { value: 10e3, unit: 'Ω', originalText: '10kΩ' },
        tolerance: '±1%',
        package: '0603',
      };

      const result = scorer.scoreComponent(resistor, parameters);

      // Tolerance should have higher weight for resistors
      const toleranceMatch = result.matchDetails.find((d) => d.parameter === 'tolerance');

      expect(toleranceMatch).toBeDefined();
      if (toleranceMatch && toleranceMatch.exact) {
        expect(toleranceMatch.score).toBeGreaterThan(100); // Base score with weight applied
      }
    });

    it('should score connectors without specific values', () => {
      const connector = createConnectorComponent();
      const parameters: ParsedParameters = {
        keywords: ['10-pin', 'header', 'male'],
      };

      const result = scorer.scoreComponent(connector, parameters);

      // Should have a non-value match for connector
      const nonValueMatch = result.matchDetails.find((d) => d.parameter === 'non-value-match');
      expect(nonValueMatch).toBeDefined();
      expect(nonValueMatch?.score).toBeGreaterThan(0);

      // Should have matched pin count and connector type
      expect(nonValueMatch?.reason).toContain('pin count');
      expect(nonValueMatch?.reason).toContain('header');
    });

    it('should score switches without specific values', () => {
      const switch1 = createSwitchComponent();
      const parameters: ParsedParameters = {
        keywords: ['tactile', 'momentary', 'button'],
      };

      const result = scorer.scoreComponent(switch1, parameters);

      // Should have a non-value match for switch
      const nonValueMatch = result.matchDetails.find((d) => d.parameter === 'non-value-match');
      expect(nonValueMatch).toBeDefined();
      expect(nonValueMatch?.score).toBeGreaterThan(0);

      // Should have matched switch type
      expect(nonValueMatch?.reason).toContain('tactile');
    });

    it('should score ICs without specific values', () => {
      const ic = createICComponent();
      const parameters: ParsedParameters = {
        keywords: ['ATMEGA328P', 'microcontroller'],
      };

      const result = scorer.scoreComponent(ic, parameters);

      // For ICs, we might get keyword matches instead of non-value matches
      const keywordMatch = result.matchDetails.find((d) => d.parameter === 'keywords');
      expect(keywordMatch).toBeDefined();
      expect(keywordMatch?.score).toBeGreaterThan(0);

      // Should have matched keywords related to microcontrollers
      expect(keywordMatch?.reason.toLowerCase()).toContain('microcontroller');
    });

    it('should prioritize important keywords for specific component types', () => {
      // Test with capacitor and important keywords
      const capacitor = createTestComponent();
      const capacitorParams: ParsedParameters = {
        keywords: ['X7R', 'ceramic', 'bypass'], // X7R and ceramic are important for capacitors
      };

      const capacitorResult = scorer.scoreComponent(capacitor, capacitorParams);
      const capacitorKeywordMatch = capacitorResult.matchDetails.find((d) => d.parameter === 'keywords');

      expect(capacitorKeywordMatch).toBeDefined();
      expect(capacitorKeywordMatch?.reason).toContain('important matches');

      // Test with IC and important keywords
      const ic = createICComponent();
      const icParams: ParsedParameters = {
        keywords: ['microcontroller', 'ATMEGA328P', 'flash'], // All important for ICs
      };

      const icResult = scorer.scoreComponent(ic, icParams);
      const icKeywordMatch = icResult.matchDetails.find((d) => d.parameter === 'keywords');

      expect(icKeywordMatch).toBeDefined();
      expect(icKeywordMatch?.score).toBeGreaterThan(0);
    });

    it('should detect component types correctly', () => {
      // Test with various component descriptions
      const components = [
        {
          desc: '100nF 50V X7R 0603 Ceramic Capacitor',
          category: 'Capacitors',
          expected: ComponentType.CAPACITOR,
        },
        {
          desc: '10kΩ ±1% 0603 Thick Film Resistor',
          category: 'Resistors',
          expected: ComponentType.RESISTOR,
        },
        {
          desc: '10µH Power Inductor',
          category: 'Inductors',
          expected: ComponentType.INDUCTOR,
        },
        {
          desc: '1N4148 Switching Diode',
          category: 'Diodes',
          expected: ComponentType.DIODE,
        },
        {
          desc: 'Red 0603 LED',
          category: 'LEDs',
          expected: ComponentType.DIODE,
        },
        {
          desc: '2N3904 NPN Transistor',
          category: 'Transistors',
          expected: ComponentType.TRANSISTOR,
        },
        {
          desc: 'ATMEGA328P 8-bit AVR Microcontroller',
          category: 'Integrated Circuits (ICs)',
          expected: ComponentType.IC,
        },
        {
          desc: '10-Pin 2.54mm Male Header Connector',
          category: 'Connectors',
          expected: ComponentType.CONNECTOR,
        },
        {
          desc: '6x6mm Tactile Momentary Push Button Switch',
          category: 'Switches',
          expected: ComponentType.SWITCH,
        },
        {
          desc: '16MHz Crystal Oscillator',
          category: 'Crystals & Oscillators',
          expected: ComponentType.CRYSTAL,
        },
        {
          desc: '500mA Resettable PTC Fuse',
          category: 'Fuses',
          expected: ComponentType.FUSE,
        },
      ];

      // Create test components and check type detection
      for (const { desc, category, expected } of components) {
        const component = createTestComponent({
          description: desc,
          category: category,
        });

        // Access private method for testing using any type assertion
        const detectedType = (scorer as any).detectComponentType(component);
        expect(detectedType).toBe(expected);
      }
    });
  });

  describe('rankComponents', () => {
    it('should rank components by score', () => {
      const components = [
        createTestComponent({
          description: '100nF 50V X7R 0603 Ceramic Capacitor',
          package: '0603',
        }),
        createTestComponent({
          description: '100nF 25V X7R 0603 Ceramic Capacitor', // Lower voltage
          package: '0603',
        }),
        createTestComponent({
          description: '100nF 50V X7R 0805 Ceramic Capacitor', // Different package
          package: '0805',
        }),
        createTestComponent({
          description: '220nF 50V X7R 0603 Ceramic Capacitor', // Different value
          package: '0603',
        }),
      ];

      const parameters: ParsedParameters = {
        value: { value: 100e-9, unit: 'F', originalText: '100nF' },
        voltage: { value: 50, unit: 'V', originalText: '50V' },
        package: '0603',
      };

      const results = scorer.rankComponents(components, parameters);

      // First result should be the exact match
      expect(results[0].component.description).toBe('100nF 50V X7R 0603 Ceramic Capacitor');

      // Check that results are sorted by score (highest first)
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });

    it('should rank components of different types appropriately', () => {
      const components = [
        createTestComponent({
          description: '100nF 50V X7R 0603 Ceramic Capacitor',
        }),
        createConnectorComponent({
          description: '10-Pin 2.54mm Male Header Connector',
        }),
        createSwitchComponent({
          description: '6x6mm Tactile Momentary Push Button Switch',
        }),
        createICComponent({
          description: 'ATMEGA328P 8-bit AVR Microcontroller',
        }),
      ];

      // Test with capacitor search
      const capacitorParams: ParsedParameters = {
        value: { value: 100e-9, unit: 'F', originalText: '100nF' },
        keywords: ['ceramic', 'capacitor'],
      };

      const capacitorResults = scorer.rankComponents(components, capacitorParams);
      expect(capacitorResults[0].component.description).toContain('Capacitor');

      // Test with connector search
      const connectorParams: ParsedParameters = {
        keywords: ['10-pin', 'header', 'male'],
      };

      const connectorResults = scorer.rankComponents(components, connectorParams);
      expect(connectorResults[0].component.description).toContain('Header Connector');

      // Test with switch search
      const switchParams: ParsedParameters = {
        keywords: ['tactile', 'button', 'switch'],
      };

      const switchResults = scorer.rankComponents(components, switchParams);
      expect(switchResults[0].component.description).toContain('Button Switch');
    });
  });

  describe('filterTopResults', () => {
    it('should return top N results with highest scores', () => {
      // Create 10 components with different scores
      const components = Array.from({ length: 10 }, (_, i) =>
        createTestComponent({
          lcsc: `C${1000 + i}`,
          description: `${100 + i}nF 50V X7R 0603 Ceramic Capacitor`,
          package: '0603',
        }),
      );

      const parameters: ParsedParameters = {
        value: { value: 100e-9, unit: 'F', originalText: '100nF' },
        voltage: { value: 50, unit: 'V', originalText: '50V' },
        package: '0603',
      };

      // Rank all components
      const rankedComponents = scorer.rankComponents(components, parameters);

      // Filter to top 5 (default)
      const topResults = scorer.filterTopResults(rankedComponents);

      // Should return exactly 5 results
      expect(topResults.length).toBe(5);

      // Results should be in same order as original ranking
      for (let i = 0; i < topResults.length; i++) {
        expect(topResults[i]).toBe(rankedComponents[i]);
      }

      // Test with custom limit
      const top3Results = scorer.filterTopResults(rankedComponents, 3);
      expect(top3Results.length).toBe(3);

      // Test with limit larger than available results
      const top20Results = scorer.filterTopResults(rankedComponents, 20);
      expect(top20Results.length).toBe(rankedComponents.length);
    });

    it('should filter out components with zero score', () => {
      // Create components with mix of zero and non-zero scores
      const components = [
        createTestComponent({ description: '100nF 50V X7R 0603 Ceramic Capacitor' }),
        createTestComponent({ description: '220nF 50V X7R 0603 Ceramic Capacitor' }),
        createConnectorComponent({ description: '10-Pin 2.54mm Male Header Connector' }),
      ];

      // Parameters that will only match capacitors
      const parameters: ParsedParameters = {
        value: { value: 100e-9, unit: 'F', originalText: '100nF' },
      };

      // Score components manually to ensure some have zero scores
      const scoredComponents = components.map((component) => {
        const score = scorer.scoreComponent(component, parameters);
        // Force one component to have zero score for testing
        if (component.description.includes('220nF')) {
          score.score = 0;
          score.matchDetails = [];
        }
        return score;
      });

      // Filter results
      const filteredResults = scorer.filterTopResults(scoredComponents);

      // Should not include components with zero score
      expect(filteredResults.every((result) => result.score > 0)).toBe(true);

      // Should include the component with non-zero score
      expect(filteredResults.some((result) => result.component.description.includes('100nF'))).toBe(true);

      // Should not include the component with zero score
      expect(filteredResults.some((result) => result.component.description.includes('220nF'))).toBe(false);
    });
  });

  describe('generateMatchSummary', () => {
    it('should generate a readable summary of match reasons', () => {
      const component = createTestComponent();
      const parameters: ParsedParameters = {
        value: { value: 100e-9, unit: 'F', originalText: '100nF' },
        voltage: { value: 50, unit: 'V', originalText: '50V' },
        package: '0603',
        componentType: 'X7R',
      };

      const result = scorer.scoreComponent(component, parameters);
      const summary = scorer.generateMatchSummary(result);

      // Summary should be a non-empty string
      expect(typeof summary).toBe('string');
      expect(summary.length).toBeGreaterThan(0);

      // Summary should mention the top match reasons
      expect(summary).toContain('match');

      // Should include exact match indicators for exact matches
      const exactMatches = result.matchDetails.filter((d) => d.exact);
      if (exactMatches.length > 0) {
        expect(summary).toContain('Exact match');
      }
    });

    it('should handle components with no match details', () => {
      const component = createTestComponent();
      const emptyScore: ComponentScore = {
        component,
        score: 0,
        matchDetails: [],
      };

      const summary = scorer.generateMatchSummary(emptyScore);

      // Should return a default message for no matches
      expect(summary).toBe('No matching criteria found');
    });

    it('should prioritize highest scoring match details', () => {
      // Create a component with multiple match details of varying scores
      const component = createTestComponent();

      // Create a component score with manually set match details
      const componentScore: ComponentScore = {
        component,
        score: 250,
        matchDetails: [
          {
            parameter: 'value',
            score: 100,
            exact: true,
            reason: 'Exact value match: 100nF',
          },
          {
            parameter: 'voltage',
            score: 90,
            exact: false,
            reason: 'Higher voltage (50V > 25V) is compatible',
          },
          {
            parameter: 'package',
            score: 40,
            exact: false,
            reason: 'Similar package size: 0603 vs 0805',
          },
          {
            parameter: 'keywords',
            score: 20,
            exact: false,
            reason: 'Keyword match: ceramic',
          },
        ],
      };

      const summary = scorer.generateMatchSummary(componentScore);

      // Summary should include the highest scoring reasons first
      expect(summary).toContain('Exact value match');
      expect(summary).toContain('Higher voltage');

      // The lowest scoring reason should not be included if we limit to top 3
      expect(summary).not.toContain('Keyword match: ceramic');
    });
  });
});
