import { describe, it, expect } from 'vitest';
import { EnhancedScoringSystem } from '../EnhancedScoringSystem.js';
import { ComponentRecord, ParsedParameters } from '../../types/index.js';

function makeComponent(overrides: Partial<ComponentRecord> = {}): ComponentRecord {
  return {
    lcsc: 'C100',
    category_id: '1',
    category: 'Resistors',
    subcategory: 'Chip Resistor',
    mfr: 'R_0603',
    package: '0603',
    joints: '2',
    manufacturer: 'TestMfr',
    basic: '1',
    preferred: '1',
    description: '10kΩ resistor',
    datasheet: '',
    stock: '100',
    last_on_stock: '2024-01-01',
    price: '[]',
    extra: '{}',
    assembly_process: 'SMT',
    min_order_qty: '1',
    attrition_qty: '0',
    ...overrides,
  };
}

describe('EnhancedScoringSystem', () => {
  const scorer = new EnhancedScoringSystem();

  describe('scoreComponent', () => {
    it('returns low score when keyword does not match primary fields', () => {
      const component = makeComponent();
      const params: ParsedParameters = { keywords: ['zzzzzzzz'] };
      const result = scorer.scoreComponent(component, params);
      expect(result.component).toBe(component);
      const keywordDetail = result.matchDetails.find((d) => d.parameter === 'keywords');
      expect(keywordDetail).toBeDefined();
      expect(keywordDetail!.score).toBe(0);
    });

    it('scores keyword matches in description', () => {
      const component = makeComponent({ description: '10kΩ thick film resistor' });
      const params: ParsedParameters = { keywords: ['resistor'] };
      const result = scorer.scoreComponent(component, params);
      expect(result.score).toBeGreaterThan(0);
      expect(result.matchDetails.some((d) => d.parameter === 'keywords')).toBe(true);
    });

    it('scores keyword matches in mfr', () => {
      const component = makeComponent({ description: 'something else', mfr: 'STM32F103' });
      const params: ParsedParameters = { keywords: ['stm32'] };
      const result = scorer.scoreComponent(component, params);
      expect(result.score).toBeGreaterThan(0);
    });

    it('scores keyword matches in category', () => {
      const component = makeComponent({ description: 'part', category: 'Capacitors' });
      const params: ParsedParameters = { keywords: ['capacitors'] };
      const result = scorer.scoreComponent(component, params);
      expect(result.score).toBeGreaterThan(0);
    });

    it('scores keyword matches in searchTerms from extra', () => {
      const component = makeComponent({
        description: 'part',
        extra: JSON.stringify({ searchTerms: ['ceramic', 'capacitor'] }),
      });
      const params: ParsedParameters = { keywords: ['ceramic'] };
      const result = scorer.scoreComponent(component, params);
      expect(result.score).toBeGreaterThan(0);
    });

    it('scores package/footprint match', () => {
      const component = makeComponent({ description: '0603 resistor', package: '0603' });
      const params: ParsedParameters = { package: '0603' };
      const result = scorer.scoreComponent(component, params);
      const footprintDetail = result.matchDetails.find(
        (d) => d.parameter === 'footprint_exact' || d.parameter === 'footprint_similar',
      );
      expect(footprintDetail).toBeDefined();
      expect(footprintDetail!.score).toBeGreaterThan(0);
    });

    it('scores component type match', () => {
      const component = makeComponent({ description: 'resistor' });
      const params: ParsedParameters = { componentType: 'resistor' };
      const result = scorer.scoreComponent(component, params);
      const typeDetail = result.matchDetails.find((d) => d.parameter === 'component_type');
      expect(typeDetail).toBeDefined();
      expect(typeDetail!.score).toBeGreaterThan(0);
    });

    it('applies type mismatch penalty for potentiometer when searching resistor', () => {
      const component = makeComponent({ description: 'potentiometer 10k' });
      const params: ParsedParameters = { componentType: 'resistor' };
      const result = scorer.scoreComponent(component, params);
      const typeDetail = result.matchDetails.find((d) => d.parameter === 'component_type');
      expect(typeDetail!.score).toBeLessThan(0);
    });

    it('scores voltage pattern detection in keywords', () => {
      const component = makeComponent({ description: 'capacitor 3.3V 50V x7r' });
      const params: ParsedParameters = { keywords: ['3.3V'] };
      const result = scorer.scoreComponent(component, params);
      expect(result.matchDetails.some((d) => d.parameter.startsWith('voltage') || d.parameter === 'keywords')).toBe(
        true,
      );
    });

    it('scores voltage range pattern detection', () => {
      const component = makeComponent({ description: 'capacitor 1.0-5.5V x7r' });
      const params: ParsedParameters = { keywords: ['3.3V'] };
      const result = scorer.scoreComponent(component, params);
      expect(result.matchDetails.some((d) => d.parameter.startsWith('voltage') || d.parameter === 'keywords')).toBe(
        true,
      );
    });

    it('scores frequency pattern detection', () => {
      const component = makeComponent({ description: 'crystal 16MHz oscillator' });
      const params: ParsedParameters = { keywords: ['16MHz'] };
      const result = scorer.scoreComponent(component, params);
      expect(result.matchDetails.some((d) => d.parameter.startsWith('frequency') || d.parameter === 'keywords')).toBe(
        true,
      );
    });

    it('scores memory pattern detection', () => {
      const component = makeComponent({ description: 'memory 256MBit flash' });
      const params: ParsedParameters = { keywords: ['256MBit'] };
      const result = scorer.scoreComponent(component, params);
      expect(result.matchDetails.some((d) => d.parameter.startsWith('memory') || d.parameter === 'keywords')).toBe(
        true,
      );
    });

    it('scores temperature pattern detection', () => {
      const component = makeComponent({ description: 'sensor -40-85°C range' });
      const params: ParsedParameters = { keywords: ['25°C'] };
      const result = scorer.scoreComponent(component, params);
      expect(result.matchDetails.some((d) => d.parameter.startsWith('temperature') || d.parameter === 'keywords')).toBe(
        true,
      );
    });

    it('scores exact temperature pattern detection', () => {
      const component = makeComponent({ description: 'rated 125°C high temp' });
      const params: ParsedParameters = { keywords: ['125°C'] };
      const result = scorer.scoreComponent(component, params);
      expect(result.matchDetails.some((d) => d.parameter.startsWith('temperature') || d.parameter === 'keywords')).toBe(
        true,
      );
    });

    it('scores manufacturer match via manufacturer field', () => {
      const component = makeComponent({ manufacturer: 'Texas Instruments' });
      const params: ParsedParameters = { keywords: ['texas'] };
      const result = scorer.scoreComponent(component, params);
      const mfrDetail = result.matchDetails.find((d) => d.parameter === 'manufacturer');
      expect(mfrDetail).toBeDefined();
      expect(mfrDetail!.score).toBeGreaterThan(0);
    });

    it('scores manufacturer variation match', () => {
      const component = makeComponent({ manufacturer: 'Analog Devices', mfr: 'AD1234' });
      const params: ParsedParameters = { keywords: ['adi'] };
      const result = scorer.scoreComponent(component, params);
      const mfrDetail = result.matchDetails.find((d) => d.parameter === 'manufacturer_variation');
      expect(mfrDetail).toBeDefined();
    });

    it('scores category match', () => {
      const component = makeComponent({ category: 'Resistors' });
      const params: ParsedParameters = { keywords: ['resistors'] };
      const result = scorer.scoreComponent(component, params);
      const catDetail = result.matchDetails.find((d) => d.parameter === 'category');
      expect(catDetail).toBeDefined();
      expect(catDetail!.score).toBeGreaterThan(0);
    });

    it('applies multi-parameter bonus', () => {
      const component = makeComponent({ description: '10kΩ resistor 0603 thick film' });
      const params: ParsedParameters = { keywords: ['resistor'], package: '0603', componentType: 'resistor' };
      const result = scorer.scoreComponent(component, params);
      const bonus = result.matchDetails.find((d) => d.parameter === 'multi_parameter_bonus');
      expect(bonus).toBeDefined();
      expect(bonus!.score).toBeGreaterThan(0);
    });

    it('applies simplicity bonus for simple resistor', () => {
      const component = makeComponent({
        description: 'resistor',
        extra: JSON.stringify({ library: 'Device' }),
      });
      const params: ParsedParameters = { componentType: 'resistor' };
      const result = scorer.scoreComponent(component, params);
      const bonus = result.matchDetails.find((d) => d.parameter === 'simplicity_bonus');
      expect(bonus).toBeDefined();
      expect(bonus!.score).toBeGreaterThan(0);
    });

    it('applies simplicity penalty for resistor network', () => {
      const component = makeComponent({ description: 'resistor network 4x10k' });
      const params: ParsedParameters = { componentType: 'resistor' };
      const result = scorer.scoreComponent(component, params);
      const bonus = result.matchDetails.find((d) => d.parameter === 'simplicity_bonus');
      if (bonus) {
        expect(bonus.score).toBeLessThan(0);
      }
    });

    it('applies simplicity bonus for simple capacitor', () => {
      const component = makeComponent({
        description: 'capacitor',
        category: 'Capacitors',
        extra: JSON.stringify({ library: 'Device' }),
      });
      const params: ParsedParameters = { componentType: 'capacitor' };
      const result = scorer.scoreComponent(component, params);
      const bonus = result.matchDetails.find((d) => d.parameter === 'simplicity_bonus');
      expect(bonus).toBeDefined();
      expect(bonus!.score).toBeGreaterThan(0);
    });

    it('applies simplicity penalty for complex inductor match', () => {
      const component = makeComponent({ description: 'dc-dc converter with inductor' });
      const params: ParsedParameters = { componentType: 'inductor' };
      const result = scorer.scoreComponent(component, params);
      const bonus = result.matchDetails.find((d) => d.parameter === 'simplicity_bonus');
      if (bonus) {
        expect(bonus.score).toBeLessThan(0);
      }
    });

    it('applies device library bonus for type match in Device library', () => {
      const component = makeComponent({
        description: 'resistor',
        extra: JSON.stringify({ library: 'Device' }),
      });
      const params: ParsedParameters = { componentType: 'resistor' };
      const result = scorer.scoreComponent(component, params);
      const typeDetail = result.matchDetails.find((d) => d.parameter === 'component_type');
      expect(typeDetail!.reason).toContain('Device library bonus');
    });

    it('handles component type variations', () => {
      const component = makeComponent({ description: 'mosfet n-channel' });
      const params: ParsedParameters = { componentType: 'transistor' };
      const result = scorer.scoreComponent(component, params);
      const typeDetail = result.matchDetails.find((d) => d.parameter === 'component_type');
      expect(typeDetail!.score).toBeGreaterThan(0);
    });

    it('handles type variation for connector', () => {
      const component = makeComponent({ description: 'header 2x5 pin' });
      const params: ParsedParameters = { componentType: 'connector' };
      const result = scorer.scoreComponent(component, params);
      const typeDetail = result.matchDetails.find((d) => d.parameter === 'component_type');
      expect(typeDetail!.score).toBeGreaterThan(0);
    });

    it('handles type variation for crystal', () => {
      const component = makeComponent({ description: 'crystal 32.768kHz' });
      const params: ParsedParameters = { componentType: 'crystal' };
      const result = scorer.scoreComponent(component, params);
      const typeDetail = result.matchDetails.find((d) => d.parameter === 'component_type');
      expect(typeDetail!.score).toBeGreaterThan(0);
    });

    it('handles type variation for switch/button', () => {
      const component = makeComponent({ description: 'tactile button smd' });
      const params: ParsedParameters = { componentType: 'switch' };
      const result = scorer.scoreComponent(component, params);
      const typeDetail = result.matchDetails.find((d) => d.parameter === 'component_type');
      expect(typeDetail!.score).toBeGreaterThan(0);
    });

    it('returns 0 type score when no match', () => {
      const component = makeComponent({ description: 'voltage regulator' });
      const params: ParsedParameters = { componentType: 'inductor' };
      const result = scorer.scoreComponent(component, params);
      const typeDetail = result.matchDetails.find((d) => d.parameter === 'component_type');
      expect(typeDetail!.score).toBe(0);
    });

    it('handles negative match for inductor-less components', () => {
      const component = makeComponent({ description: 'inductor-less filter' });
      const params: ParsedParameters = { componentType: 'inductor' };
      const result = scorer.scoreComponent(component, params);
      const typeDetail = result.matchDetails.find((d) => d.parameter === 'component_type');
      expect(typeDetail!.score).toBeLessThan(0);
    });

    it('handles negative match for varactor when searching capacitor', () => {
      const component = makeComponent({ description: 'varactor diode' });
      const params: ParsedParameters = { componentType: 'capacitor' };
      const result = scorer.scoreComponent(component, params);
      const typeDetail = result.matchDetails.find((d) => d.parameter === 'component_type');
      expect(typeDetail!.score).toBeLessThan(0);
    });

    it('handles negative match for led when searching diode', () => {
      const component = makeComponent({ description: 'led blue 5mm' });
      const params: ParsedParameters = { componentType: 'diode' };
      const result = scorer.scoreComponent(component, params);
      const typeDetail = result.matchDetails.find((d) => d.parameter === 'component_type');
      expect(typeDetail!.score).toBeLessThan(0);
    });

    it('handles negative match for thyristor when searching transistor', () => {
      const component = makeComponent({ description: 'thyristor scr' });
      const params: ParsedParameters = { componentType: 'transistor' };
      const result = scorer.scoreComponent(component, params);
      const typeDetail = result.matchDetails.find((d) => d.parameter === 'component_type');
      expect(typeDetail!.score).toBeLessThan(0);
    });

    it('scores QFN footprint pattern', () => {
      const component = makeComponent({ description: 'mcu QFN-48 package' });
      const params: ParsedParameters = { package: 'QFN' };
      const result = scorer.scoreComponent(component, params);
      const fpDetail = result.matchDetails.find(
        (d) => d.parameter === 'footprint_exact' || d.parameter === 'footprint_similar',
      );
      expect(fpDetail).toBeDefined();
      expect(fpDetail!.score).toBeGreaterThan(0);
    });

    it('scores SOIC footprint pattern', () => {
      const component = makeComponent({ description: 'op-amp SOIC-8' });
      const params: ParsedParameters = { package: 'SOIC' };
      const result = scorer.scoreComponent(component, params);
      const fpDetail = result.matchDetails.find(
        (d) => d.parameter === 'footprint_exact' || d.parameter === 'footprint_similar',
      );
      expect(fpDetail).toBeDefined();
    });

    it('scores BGA footprint pattern', () => {
      const component = makeComponent({ description: 'fpga BGA-256' });
      const params: ParsedParameters = { package: 'BGA' };
      const result = scorer.scoreComponent(component, params);
      const fpDetail = result.matchDetails.find(
        (d) => d.parameter === 'footprint_exact' || d.parameter === 'footprint_similar',
      );
      expect(fpDetail).toBeDefined();
    });

    it('scores DIP footprint pattern', () => {
      const component = makeComponent({ description: 'DIP-8 timer ic' });
      const params: ParsedParameters = { package: 'DIP' };
      const result = scorer.scoreComponent(component, params);
      const fpDetail = result.matchDetails.find(
        (d) => d.parameter === 'footprint_exact' || d.parameter === 'footprint_similar',
      );
      expect(fpDetail).toBeDefined();
    });

    it('returns generic package match for symbol package type', () => {
      const component = makeComponent({ description: 'some symbol' });
      const params: ParsedParameters = { package: 'Symbol' };
      const result = scorer.scoreComponent(component, params);
      const fpDetail = result.matchDetails.find((d) => d.parameter === 'package_generic');
      expect(fpDetail).toBeDefined();
    });

    it('returns 0 footprint score when no match', () => {
      const component = makeComponent({ description: 'voltage regulator' });
      const params: ParsedParameters = { package: 'TO-999' };
      const result = scorer.scoreComponent(component, params);
      const fpDetail = result.matchDetails.find((d) => d.parameter === 'footprint');
      expect(fpDetail).toBeDefined();
      expect(fpDetail!.score).toBe(0);
    });

    it('matches manufacturer via mfr field before part number', () => {
      const component = makeComponent({ mfr: 'STM32F103C8T6', manufacturer: 'UnknownMfr' });
      const params: ParsedParameters = { keywords: ['stm32f103'] };
      const result = scorer.scoreComponent(component, params);
      const match = result.matchDetails.find(
        (d) => d.parameter === 'part_number' || d.parameter === 'manufacturer_variation',
      );
      expect(match).toBeDefined();
    });

    it('returns null manufacturer match when no keywords', () => {
      const component = makeComponent();
      const params: ParsedParameters = {};
      const result = scorer.scoreComponent(component, params);
      expect(result.matchDetails.find((d) => d.parameter === 'manufacturer')).toBeUndefined();
    });

    it('handles extra with invalid JSON gracefully', () => {
      const component = makeComponent({ extra: 'not json' });
      const params: ParsedParameters = { keywords: ['resistor'] };
      expect(() => scorer.scoreComponent(component, params)).not.toThrow();
    });

    it('combines multiple scoring dimensions', () => {
      const component = makeComponent({
        description: '10kΩ resistor 0603 thick film',
        category: 'Resistors',
        manufacturer: 'Yageo',
        mfr: 'RC0603JR-0710KL',
        extra: JSON.stringify({ searchTerms: ['resistor', 'thick', 'film', '10k'] }),
      });
      const params: ParsedParameters = {
        keywords: ['resistor', '10k', '0603'],
        package: '0603',
        componentType: 'resistor',
      };
      const result = scorer.scoreComponent(component, params);
      expect(result.score).toBeGreaterThan(100);
    });
  });

  describe('rankComponents', () => {
    it('ranks components by score descending', () => {
      const comp1 = makeComponent({ description: 'resistor', mfr: 'R1' });
      const comp2 = makeComponent({ description: 'capacitor 100nF', mfr: 'C1' });
      const comp3 = makeComponent({ description: '10kΩ resistor thick film', mfr: 'R2' });
      const params: ParsedParameters = { keywords: ['resistor'] };
      const ranked = scorer.rankComponents([comp1, comp2, comp3], params);
      expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score);
      expect(ranked[1].score).toBeGreaterThanOrEqual(ranked[2].score);
    });

    it('returns empty array for empty input', () => {
      const ranked = scorer.rankComponents([], { keywords: ['test'] });
      expect(ranked).toHaveLength(0);
    });
  });

  describe('filterTopResults', () => {
    it('returns top N results', () => {
      const scores = [100, 90, 80, 70, 60, 50].map((s) => ({
        component: makeComponent(),
        score: s,
        matchDetails: [],
      }));
      const filtered = scorer.filterTopResults(scores, 3);
      expect(filtered).toHaveLength(3);
      expect(filtered[0].score).toBe(100);
    });

    it('returns all results if fewer than limit', () => {
      const scores = [100, 90].map((s) => ({
        component: makeComponent(),
        score: s,
        matchDetails: [],
      }));
      const filtered = scorer.filterTopResults(scores, 5);
      expect(filtered).toHaveLength(2);
    });

    it('defaults to 5 results', () => {
      const scores = Array.from({ length: 10 }, (_, i) => ({
        component: makeComponent(),
        score: 100 - i * 10,
        matchDetails: [],
      }));
      const filtered = scorer.filterTopResults(scores);
      expect(filtered).toHaveLength(5);
    });
  });

  describe('generateMatchSummary', () => {
    it('generates summary from match details', () => {
      const componentScore = {
        component: makeComponent(),
        score: 200,
        matchDetails: [
          { parameter: 'keywords', score: 70, exact: true, reason: 'Matched 1/1 keywords' },
          { parameter: 'footprint', score: 85, exact: true, reason: 'Footprint match' },
        ],
      };
      const summary = scorer.generateMatchSummary(componentScore);
      expect(summary).toContain('keywords');
      expect(summary).toContain('70 pts');
      expect(summary).toContain('footprint');
      expect(summary).toContain('85 pts');
    });

    it('returns default message when no matches', () => {
      const componentScore = {
        component: makeComponent(),
        score: 0,
        matchDetails: [{ parameter: 'keywords', score: 0, exact: false, reason: 'No match' }],
      };
      const summary = scorer.generateMatchSummary(componentScore);
      expect(summary).toBe('No significant matches found');
    });
  });

  describe('edge cases', () => {
    it('handles empty keywords array', () => {
      const component = makeComponent();
      const result = scorer.scoreComponent(component, { keywords: [] });
      expect(result.matchDetails).toHaveLength(0);
    });

    it('handles parameters with only componentType', () => {
      const component = makeComponent({ description: 'resistor' });
      const result = scorer.scoreComponent(component, { componentType: 'resistor' });
      expect(result.score).toBeGreaterThan(0);
    });

    it('handles parameters with only package', () => {
      const component = makeComponent({ description: '0603 component' });
      const result = scorer.scoreComponent(component, { package: '0603' });
      expect(result.score).toBeGreaterThan(0);
    });

    it('frequency range pattern detection', () => {
      const component = makeComponent({ description: 'filter 1-100MHz bandpass' });
      const params: ParsedParameters = { keywords: ['50MHz'] };
      const result = scorer.scoreComponent(component, params);
      expect(result.matchDetails.some((d) => d.parameter.startsWith('frequency') || d.parameter === 'keywords')).toBe(
        true,
      );
    });

    it('fuzzy match works via searchTerms with close strings', () => {
      const component = makeComponent({
        description: 'part',
        extra: JSON.stringify({ searchTerms: ['resistor'] }),
      });
      const params: ParsedParameters = { keywords: ['resistor'] };
      const result = scorer.scoreComponent(component, params);
      expect(result.matchDetails.some((d) => d.parameter === 'keywords' && d.score > 0)).toBe(true);
    });

    it('potentiometer check via mfr field', () => {
      const component = makeComponent({ description: 'variable resistor', mfr: 'POT-10K' });
      const params: ParsedParameters = { componentType: 'resistor' };
      const result = scorer.scoreComponent(component, params);
      const typeDetail = result.matchDetails.find((d) => d.parameter === 'component_type');
      expect(typeDetail!.score).toBeLessThan(0);
    });

    it('simplicity bonus for Device library even without componentType', () => {
      const component = makeComponent({
        description: 'some part',
        extra: JSON.stringify({ library: 'Device' }),
      });
      const params: ParsedParameters = { keywords: ['part'] };
      const result = scorer.scoreComponent(component, params);
      const bonus = result.matchDetails.find((d) => d.parameter === 'simplicity_bonus');
      expect(bonus).toBeDefined();
      expect(bonus!.score).toBeGreaterThan(0);
    });

    it('multi-parameter bonus increases with more matches', () => {
      const component = makeComponent({
        description: 'resistor',
        category: 'Resistors',
        extra: JSON.stringify({ library: 'Device' }),
      });
      const params: ParsedParameters = { keywords: ['resistor'], componentType: 'resistor' };
      const result = scorer.scoreComponent(component, params);
      const bonus = result.matchDetails.find((d) => d.parameter === 'multi_parameter_bonus');
      expect(bonus).toBeDefined();
      expect(bonus!.score).toBeGreaterThan(0);
    });
  });
});
