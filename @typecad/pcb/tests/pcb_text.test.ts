import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PCB } from '../src/index.js';
import { Schematic } from '../src/schematic.js';
import fs from 'node:fs';
import { parse, Sym, nameOf } from '../src/sexpr/index.js';

function getTextContent(grTextElement: any[]): string {
  const textTokens = [];
  for (let i = 1; i < grTextElement.length; i++) {
    if (Array.isArray(grTextElement[i])) break;
    textTokens.push(String(grTextElement[i]));
  }
  return textTokens.join(' ');
}

describe('PCB Text Functionality', () => {
  const testBoardName = 'test_pcb_text';
  let pcb: PCB;

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

  it('should add basic text to PCB', () => {
    pcb = new PCB(testBoardName, { schematic: new Schematic(testBoardName) });

    pcb.text({
      text: 'Hello PCB',
      x: 100,
      y: 50,
    });

    pcb.create();

    // Read the generated PCB file
    const pcbFile = fs.readFileSync(`./build/${testBoardName}.kicad_pcb`, 'utf8');
    const boardContents = parse(pcbFile);

    // Find gr_text elements
    const grTextElements = boardContents.filter((item: any) => Array.isArray(item) && nameOf(item[0]) === 'gr_text');

    expect(grTextElements.length).toBeGreaterThan(0);

    const textElement = grTextElements.find((item: any) => getTextContent(item) === 'Hello PCB');
    expect(textElement).toBeDefined();
  });

  it('should add text with custom font and size', () => {
    pcb = new PCB(testBoardName, { schematic: new Schematic(testBoardName) });

    pcb.text({
      text: 'TYPECAD 1HZ',
      x: 145.415,
      y: 108.585,
      rotation: 0,
      layer: 'F.SilkS',
      font: 'Super Skinny Pixel Bricks',
      width: 5,
      height: 5,
    });

    pcb.create();

    // Read and parse the generated PCB file
    const pcbFile = fs.readFileSync(`./build/${testBoardName}.kicad_pcb`, 'utf8');
    const boardContents = parse(pcbFile);

    // Find the text element
    const grTextElements = boardContents.filter((item: any) => Array.isArray(item) && nameOf(item[0]) === 'gr_text');

    const textElement = grTextElements.find((item: any) => getTextContent(item) === 'TYPECAD 1HZ');

    expect(textElement).toBeDefined();

    // Check position
    const atNode = textElement.find((item: any) => Array.isArray(item) && nameOf(item[0]) === 'at');
    expect(parseFloat(atNode[1])).toBe(145.415);
    expect(parseFloat(atNode[2])).toBe(108.585);

    // Check layer
    const layerNode = textElement.find((item: any) => Array.isArray(item) && nameOf(item[0]) === 'layer');
    expect(layerNode[1]).toBe('F.SilkS');

    // Check effects (font)
    const effectsNode = textElement.find((item: any) => Array.isArray(item) && nameOf(item[0]) === 'effects');
    expect(effectsNode).toBeDefined();

    const fontNode = effectsNode.find((item: any) => Array.isArray(item) && nameOf(item[0]) === 'font');
    expect(fontNode).toBeDefined();

    // Check for font face
    const faceNode = fontNode.find((item: any) => Array.isArray(item) && nameOf(item[0]) === 'face');
    expect(faceNode).toBeDefined();
    const faceTokens = [];
    for (let i = 1; i < faceNode.length; i++) {
      if (!Array.isArray(faceNode[i])) {
        faceTokens.push(String(faceNode[i]));
      }
    }
    const faceName = faceTokens.join(' ');
    expect(faceName).toBe('Super Skinny Pixel Bricks');

    // Check for size
    const sizeNode = fontNode.find((item: any) => Array.isArray(item) && nameOf(item[0]) === 'size');
    expect(sizeNode).toBeDefined();
    expect(parseFloat(sizeNode[1])).toBe(5); // height
    expect(parseFloat(sizeNode[2])).toBe(5); // width
  });

  it('should add multiple text elements', () => {
    pcb = new PCB(testBoardName, { schematic: new Schematic(testBoardName) });

    pcb.text({
      text: 'Title',
      x: 100,
      y: 20,
      layer: 'F.SilkS',
    });

    pcb.text({
      text: 'v1.0',
      x: 100,
      y: 30,
      layer: 'F.SilkS',
    });

    pcb.text({
      text: 'Back Label',
      x: 100,
      y: 40,
      layer: 'B.SilkS',
    });

    pcb.create();

    const pcbFile = fs.readFileSync(`./build/${testBoardName}.kicad_pcb`, 'utf8');
    const boardContents = parse(pcbFile);

    const grTextElements = boardContents.filter((item: any) => Array.isArray(item) && nameOf(item[0]) === 'gr_text');

    expect(grTextElements.length).toBeGreaterThanOrEqual(3);
  });

  it('should support text formatting options', () => {
    pcb = new PCB(testBoardName, { schematic: new Schematic(testBoardName) });

    pcb.text({
      text: 'Bold Italic',
      x: 100,
      y: 50,
      bold: true,
      italic: true,
      thickness: 0.5,
    });

    pcb.create();

    const pcbFile = fs.readFileSync(`./build/${testBoardName}.kicad_pcb`, 'utf8');
    const boardContents = parse(pcbFile);

    const grTextElements = boardContents.filter((item: any) => Array.isArray(item) && nameOf(item[0]) === 'gr_text');

    const textElement = grTextElements.find((item: any) => getTextContent(item) === 'Bold Italic');

    expect(textElement).toBeDefined();

    const effectsNode = textElement.find((item: any) => Array.isArray(item) && nameOf(item[0]) === 'effects');
    const fontNode = effectsNode.find((item: any) => Array.isArray(item) && nameOf(item[0]) === 'font');

    // Check for bold and italic flags
    const hasBold = fontNode.some((item: any) => Sym.isSym(item) && item.name === 'bold');
    const hasItalic = fontNode.some((item: any) => Sym.isSym(item) && item.name === 'italic');

    expect(hasBold).toBe(true);
    expect(hasItalic).toBe(true);

    // Check thickness
    const thicknessNode = fontNode.find((item: any) => Array.isArray(item) && nameOf(item[0]) === 'thickness');
    expect(thicknessNode).toBeDefined();
    expect(parseFloat(thicknessNode[1])).toBe(0.5);
  });

  it('should support text justification', () => {
    pcb = new PCB(testBoardName, { schematic: new Schematic(testBoardName) });

    pcb.text({
      text: 'Centered',
      x: 100,
      y: 50,
      justify: {
        horizontal: 'center',
        vertical: 'middle',
      },
    });

    pcb.create();

    const pcbFile = fs.readFileSync(`./build/${testBoardName}.kicad_pcb`, 'utf8');
    const boardContents = parse(pcbFile);

    const grTextElements = boardContents.filter((item: any) => Array.isArray(item) && nameOf(item[0]) === 'gr_text');

    const textElement = grTextElements.find((item: any) => getTextContent(item) === 'Centered');

    expect(textElement).toBeDefined();

    const effectsNode = textElement.find((item: any) => Array.isArray(item) && nameOf(item[0]) === 'effects');

    const justifyNode = effectsNode.find((item: any) => Array.isArray(item) && nameOf(item[0]) === 'justify');

    expect(justifyNode).toBeDefined();
    expect(justifyNode.some((item: any) => String(item) === 'center')).toBe(true);
    expect(justifyNode.some((item: any) => String(item) === 'middle')).toBe(true);
  });

  it('should apply default values', () => {
    pcb = new PCB(testBoardName, { schematic: new Schematic(testBoardName) });

    pcb.text({
      text: 'Default Text',
      x: 100,
      y: 50,
    });

    pcb.create();

    const pcbFile = fs.readFileSync(`./build/${testBoardName}.kicad_pcb`, 'utf8');
    const boardContents = parse(pcbFile);

    const grTextElements = boardContents.filter((item: any) => Array.isArray(item) && nameOf(item[0]) === 'gr_text');

    const textElement = grTextElements.find((item: any) => getTextContent(item) === 'Default Text');

    expect(textElement).toBeDefined();

    // Check default layer is F.SilkS
    const layerNode = textElement.find((item: any) => Array.isArray(item) && nameOf(item[0]) === 'layer');
    expect(layerNode[1]).toBe('F.SilkS');

    // Check default rotation is 0
    const atNode = textElement.find((item: any) => Array.isArray(item) && nameOf(item[0]) === 'at');
    expect(parseFloat(atNode[3])).toBe(0);

    // Check default size is 1.27
    const effectsNode = textElement.find((item: any) => Array.isArray(item) && nameOf(item[0]) === 'effects');
    const fontNode = effectsNode.find((item: any) => Array.isArray(item) && nameOf(item[0]) === 'font');
    const sizeNode = fontNode.find((item: any) => Array.isArray(item) && nameOf(item[0]) === 'size');
    expect(parseFloat(sizeNode[1])).toBe(1.27); // height
    expect(parseFloat(sizeNode[2])).toBe(1.27); // width

    // When no justify is specified, the justify node exists but has no values
    const justifyNode = effectsNode.find((item: any) => Array.isArray(item) && nameOf(item[0]) === 'justify');
    expect(justifyNode).toBeDefined();
    expect(justifyNode.length).toBe(1); // Just [Sym('justify')] with no values
  });

  it('should support rotation', () => {
    pcb = new PCB(testBoardName, { schematic: new Schematic(testBoardName) });

    pcb.text({
      text: 'Rotated',
      x: 100,
      y: 50,
      rotation: 90,
    });

    pcb.create();

    const pcbFile = fs.readFileSync(`./build/${testBoardName}.kicad_pcb`, 'utf8');
    const boardContents = parse(pcbFile);

    const grTextElements = boardContents.filter((item: any) => Array.isArray(item) && nameOf(item[0]) === 'gr_text');

    const textElement = grTextElements.find((item: any) => getTextContent(item) === 'Rotated');

    const atNode = textElement.find((item: any) => Array.isArray(item) && nameOf(item[0]) === 'at');
    expect(parseFloat(atNode[3])).toBe(90);
  });

  it('should support hide flag', () => {
    pcb = new PCB(testBoardName, { schematic: new Schematic(testBoardName) });

    pcb.text({
      text: 'Hidden',
      x: 100,
      y: 50,
      hide: true,
    });

    pcb.create();

    const pcbFile = fs.readFileSync(`./build/${testBoardName}.kicad_pcb`, 'utf8');
    const boardContents = parse(pcbFile);

    const grTextElements = boardContents.filter((item: any) => Array.isArray(item) && nameOf(item[0]) === 'gr_text');

    const textElement = grTextElements.find((item: any) => getTextContent(item) === 'Hidden');

    const effectsNode = textElement.find((item: any) => Array.isArray(item) && nameOf(item[0]) === 'effects');

    // Check for hide flag
    const hasHide = effectsNode.some((item: any) => Sym.isSym(item) && item.name === 'hide');
    expect(hasHide).toBe(true);
  });
});
