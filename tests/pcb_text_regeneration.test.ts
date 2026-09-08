import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PCB } from '../src/index.js';
import { Schematic } from '../src/schematic.js';
import fs from 'node:fs';
import { parse, nameOf } from '../src/sexpr/index.js';

function getTextContent(grTextElement: any[]): string {
  const textTokens = [];
  for (let i = 1; i < grTextElement.length; i++) {
    if (Array.isArray(grTextElement[i])) break;
    textTokens.push(String(grTextElement[i]));
  }
  return textTokens.join(' ');
}

describe('PCB Text Regeneration (Remove Old gr_text)', () => {
  const testBoardName = 'test_pcb_text_regen';

  beforeEach(() => {
    // Clean up any existing test files
    const buildPath = `./build/${testBoardName}.kicad_pcb`;
    if (fs.existsSync(buildPath)) {
      fs.unlinkSync(buildPath);
    }
  });

  afterEach(() => {
    // Clean up test files after each test
    const buildPath = `./build/${testBoardName}.kicad_pcb`;
    if (fs.existsSync(buildPath)) {
      fs.unlinkSync(buildPath);
    }
  });

  it('should remove old gr_text elements when board is regenerated', () => {
    // First generation - create PCB with text "Version 1.0"
    let pcb = new PCB(testBoardName, { schematic: new Schematic(testBoardName) });

    pcb.text({
      text: 'Version 1.0',
      x: 100,
      y: 50,
      layer: 'F.SilkS',
    });

    pcb.text({
      text: 'Old Text',
      x: 50,
      y: 50,
      layer: 'F.SilkS',
    });

    pcb.create();

    // Verify first generation has 2 text elements
    let pcbFile = fs.readFileSync(`./build/${testBoardName}.kicad_pcb`, 'utf8');
    let boardContents = parse(pcbFile);
    let grTextElements = boardContents.filter((item: any) => Array.isArray(item) && nameOf(item[0]) === 'gr_text');

    expect(grTextElements.length).toBe(2);
    expect(grTextElements.some((el: any) => getTextContent(el) === 'Version 1.0')).toBe(true);
    expect(grTextElements.some((el: any) => getTextContent(el) === 'Old Text')).toBe(true);

    // Second generation - create new PCB instance that loads the existing file
    // This time, only add "Version 2.0" text
    pcb = new PCB(testBoardName, { schematic: new Schematic(testBoardName) });

    pcb.text({
      text: 'Version 2.0',
      x: 100,
      y: 50,
      layer: 'F.SilkS',
    });

    pcb.text({
      text: 'New Text',
      x: 150,
      y: 50,
      layer: 'F.SilkS',
    });

    pcb.create();

    // Verify second generation ONLY has the new text elements
    pcbFile = fs.readFileSync(`./build/${testBoardName}.kicad_pcb`, 'utf8');
    boardContents = parse(pcbFile);
    grTextElements = boardContents.filter((item: any) => Array.isArray(item) && nameOf(item[0]) === 'gr_text');

    // Should have exactly 2 text elements (the new ones)
    expect(grTextElements.length).toBe(2);

    // Should have the new text
    expect(grTextElements.some((el: any) => getTextContent(el) === 'Version 2.0')).toBe(true);
    expect(grTextElements.some((el: any) => getTextContent(el) === 'New Text')).toBe(true);

    // Should NOT have the old text
    expect(grTextElements.some((el: any) => getTextContent(el) === 'Version 1.0')).toBe(false);
    expect(grTextElements.some((el: any) => getTextContent(el) === 'Old Text')).toBe(false);
  });

  it('should allow removing all text by not adding any', () => {
    // First generation - create PCB with text
    let pcb = new PCB(testBoardName, { schematic: new Schematic(testBoardName) });

    pcb.text({
      text: 'Temporary Text',
      x: 100,
      y: 50,
    });

    pcb.create();

    // Verify first generation has text
    let pcbFile = fs.readFileSync(`./build/${testBoardName}.kicad_pcb`, 'utf8');
    let boardContents = parse(pcbFile);
    let grTextElements = boardContents.filter((item: any) => Array.isArray(item) && nameOf(item[0]) === 'gr_text');

    expect(grTextElements.length).toBe(1);

    // Second generation - don't add any text
    pcb = new PCB(testBoardName, { schematic: new Schematic(testBoardName) });
    // No pcb.text() calls
    pcb.create();

    // Verify second generation has NO text elements
    pcbFile = fs.readFileSync(`./build/${testBoardName}.kicad_pcb`, 'utf8');
    boardContents = parse(pcbFile);
    grTextElements = boardContents.filter((item: any) => Array.isArray(item) && nameOf(item[0]) === 'gr_text');

    expect(grTextElements.length).toBe(0);
  });

  it('should handle multiple regenerations with different text', () => {
    const textVersions = [['Alpha', 'Beta'], ['Gamma', 'Delta', 'Epsilon'], ['Final']];

    for (let i = 0; i < textVersions.length; i++) {
      const pcb = new PCB(testBoardName, { schematic: new Schematic(testBoardName) });

      // Add current version's text
      textVersions[i].forEach((text, idx) => {
        pcb.text({
          text,
          x: 100 + idx * 10,
          y: 50,
        });
      });

      pcb.create();

      // Verify only current version's text exists
      const pcbFile = fs.readFileSync(`./build/${testBoardName}.kicad_pcb`, 'utf8');
      const boardContents = parse(pcbFile);
      const grTextElements = boardContents.filter((item: any) => Array.isArray(item) && nameOf(item[0]) === 'gr_text');

      expect(grTextElements.length).toBe(textVersions[i].length);

      // Verify current version's text is present
      textVersions[i].forEach((expectedText) => {
        expect(grTextElements.some((el: any) => getTextContent(el) === expectedText)).toBe(true);
      });

      // Verify previous versions' text is NOT present
      for (let j = 0; j < i; j++) {
        textVersions[j].forEach((oldText) => {
          expect(grTextElements.some((el: any) => getTextContent(el) === oldText)).toBe(false);
        });
      }
    }
  });
});
