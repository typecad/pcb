import { describe, it, expect } from 'vitest';
import {
  parse,
  serialize,
  prettyPrint,
  s,
  ss,
  sym,
  str,
  num,
  yes,
  no,
  SNode,
  isList,
  isSym,
  isString,
  isNumber,
  nameOf,
  Sym,
  ParseError,
} from '../src/sexpr/index.js';
import type { SExpr } from '../src/sexpr/types.js';

describe('Sym', () => {
  it('interns symbols so same name returns same instance', () => {
    const a = Sym.for('at');
    const b = Sym.for('at');
    expect(a).toBe(b);
  });

  it('different names are different instances', () => {
    const a = Sym.for('at');
    const b = Sym.for('layer');
    expect(a).not.toBe(b);
  });

  it('toString returns the name', () => {
    expect(Sym.for('footprint').toString()).toBe('footprint');
  });

  it('isSym type guard works', () => {
    expect(Sym.isSym(Sym.for('at'))).toBe(true);
    expect(Sym.isSym('hello')).toBe(false);
    expect(Sym.isSym(42)).toBe(false);
    expect(Sym.isSym([])).toBe(false);
  });
});

describe('Parser', () => {
  it('parses a simple symbol', () => {
    const result = parse('hello');
    expect(Sym.isSym(result)).toBe(true);
    expect((result as Sym).name).toBe('hello');
  });

  it('parses a quoted string', () => {
    const result = parse('"hello world"');
    expect(typeof result).toBe('string');
    expect(result).toBe('hello world');
  });

  it('parses an integer', () => {
    const result = parse('42');
    expect(typeof result).toBe('number');
    expect(result).toBe(42);
  });

  it('parses a negative integer', () => {
    const result = parse('-10');
    expect(typeof result).toBe('number');
    expect(result).toBe(-10);
  });

  it('parses a float', () => {
    const result = parse('3.14');
    expect(typeof result).toBe('number');
    expect(result).toBeCloseTo(3.14);
  });

  it('parses a negative float', () => {
    const result = parse('-2.5');
    expect(typeof result).toBe('number');
    expect(result).toBe(-2.5);
  });

  it('parses an empty list', () => {
    const result = parse('()');
    expect(Array.isArray(result)).toBe(true);
    expect((result as SExpr[]).length).toBe(0);
  });

  it('parses a simple list', () => {
    const result = parse('(at 10 20)');
    expect(Array.isArray(result)).toBe(true);
    const list = result as SExpr[];
    expect(list.length).toBe(3);
    expect(Sym.isSym(list[0]) && list[0].name).toBe('at');
    expect(list[1]).toBe(10);
    expect(list[2]).toBe(20);
  });

  it('parses a list with a quoted string', () => {
    const result = parse('(layer "F.Cu")');
    const list = result as SExpr[];
    expect(Sym.isSym(list[0]) && list[0].name).toBe('layer');
    expect(list[1]).toBe('F.Cu');
  });

  it('parses nested lists', () => {
    const result = parse('(footprint "Resistor:R_0805" (at 10 20 0) (layer "F.Cu"))');
    const list = result as SExpr[];
    expect(Sym.isSym(list[0]) && list[0].name).toBe('footprint');
    expect(list[1]).toBe('Resistor:R_0805');
    const atNode = list[2] as SExpr[];
    expect(Sym.isSym(atNode[0]) && atNode[0].name).toBe('at');
    expect(atNode[1]).toBe(10);
    expect(atNode[2]).toBe(20);
    expect(atNode[3]).toBe(0);
  });

  it('parses multi-word quoted strings correctly', () => {
    const result = parse('(gr_text "Hello World" (at 10 20))');
    const list = result as SExpr[];
    expect(list[1]).toBe('Hello World');
  });

  it('handles whitespace between items', () => {
    const result = parse('  (  at   10   20  )  ');
    const list = result as SExpr[];
    expect(Sym.isSym(list[0]) && list[0].name).toBe('at');
    expect(list[1]).toBe(10);
    expect(list[2]).toBe(20);
  });

  it('handles newlines and tabs', () => {
    const result = parse('(at\n\t10\n\t20\n)');
    const list = result as SExpr[];
    expect(list.length).toBe(3);
    expect(list[1]).toBe(10);
    expect(list[2]).toBe(20);
  });

  it('handles comments', () => {
    const result = parse('(version 20240101)\n# this is a comment\n(generator "pcbnew")');
    const list = result as SExpr[];
    expect(list.length).toBe(2);
  });

  it('handles KiCAD semicolon comments', () => {
    const result = parse('(version 20240101)\n; this is a comment\n(generator "pcbnew")');
    const list = result as SExpr[];
    expect(list.length).toBe(2);
  });

  it('semicolon delimits atoms', () => {
    const result = parse('(at 10 20);comment');
    const list = result as SExpr[];
    expect(list.length).toBe(3);
  });

  it('parses a realistic KiCAD footprint node', () => {
    const input = `(footprint "Resistor_SMD:R_0805_2012Metric" (layer "F.Cu") (at 10.5 20.3 90) (uuid "abc123-def456") (property "Reference" "R1" (at 0 -1.65 90) (layer "F.SilkS")) (property "Value" "10k" (at 0 1.65 90) (layer "F.Fab")))`;
    const result = parse(input) as SExpr[];
    expect(Sym.isSym(result[0]) && result[0].name).toBe('footprint');
    expect(result[1]).toBe('Resistor_SMD:R_0805_2012Metric');

    const atNode = result[3] as SExpr[];
    expect(atNode[1]).toBe(10.5);
    expect(atNode[2]).toBe(20.3);
    expect(atNode[3]).toBe(90);

    const props = result.filter(
      (el) => Array.isArray(el) && el.length > 0 && Sym.isSym(el[0]) && el[0].name === 'property',
    );
    expect(props.length).toBe(2);
  });

  it('parses boolean yes/no', () => {
    const result = parse('(locked yes) (free no)') as SExpr[];
    const locked = result[0] as SExpr[];
    const free = result[1] as SExpr[];
    expect(Sym.isSym(locked[1]) && locked[1].name).toBe('yes');
    expect(Sym.isSym(free[1]) && free[1].name).toBe('no');
  });

  it('handles deeply nested structures', () => {
    const input = `(effects (font (size 1.27 1.27) (thickness 0.15) bold italic) (justify left mirror) hide)`;
    const result = parse(input) as SExpr[];
    expect(Sym.isSym(result[0]) && result[0].name).toBe('effects');

    const fontNode = result[1] as SExpr[];
    expect(Sym.isSym(fontNode[0]) && fontNode[0].name).toBe('font');
    expect(Sym.isSym(fontNode[3]) && fontNode[3].name).toBe('bold');
    expect(Sym.isSym(fontNode[4]) && fontNode[4].name).toBe('italic');

    const justifyNode = result[2] as SExpr[];
    expect(Sym.isSym(justifyNode[1]) && justifyNode[1].name).toBe('left');
    expect(Sym.isSym(justifyNode[2]) && justifyNode[2].name).toBe('mirror');

    expect(Sym.isSym(result[3]) && result[3].name).toBe('hide');
  });

  it('throws on unterminated string', () => {
    expect(() => parse('"unterminated')).toThrow(ParseError);
  });

  it('throws on unexpected closing paren', () => {
    expect(() => parse(')')).toThrow(ParseError);
  });

  it('throws on unterminated list', () => {
    expect(() => parse('(at 10 20')).toThrow(ParseError);
  });

  it('parses an empty string value', () => {
    const result = parse('(property "Ref" "")') as SExpr[];
    expect(result[2]).toBe('');
  });

  it('handles strings containing special characters', () => {
    const result = parse('(property "Code" "typecad:v1:abc123")') as SExpr[];
    expect(result[2]).toBe('typecad:v1:abc123');
  });

  it('handles KiCAD net format', () => {
    const result = parse('(net 1 "VCC") (net 2 "GND")') as SExpr[];
    expect(result.length).toBe(2);
    const net1 = result[0] as SExpr[];
    expect(net1[1]).toBe(1);
    expect(net1[2]).toBe('VCC');
  });

  it('handles escaped characters in strings', () => {
    const result = parse('"hello \\"world\\""') as string;
    expect(result).toBe('hello "world"');
  });

  it('round-trips strings with escaped quotes', () => {
    const input = '(property "Description" "Power symbol creates a global label with name \\"GND\\" , ground")';
    const parsed = parse(input);
    expect(serialize(parsed)).toBe(input);
  });

  it('round-trips strings with escaped backslashes', () => {
    const input = '(property "Path" "C:\\\\Users\\\\test")';
    const parsed = parse(input);
    expect(serialize(parsed)).toBe(input);
  });

  it('handles exponential notation', () => {
    const result = parse('1e5');
    expect(typeof result).toBe('number');
    expect(result).toBe(1e5);
  });
});

describe('Serializer', () => {
  it('serializes a symbol', () => {
    expect(serialize(Sym.for('at'))).toBe('at');
  });

  it('serializes a string with quotes', () => {
    expect(serialize('F.Cu')).toBe('"F.Cu"');
  });

  it('serializes a number', () => {
    expect(serialize(42)).toBe('42');
    expect(serialize(3.14)).toBe('3.14');
    expect(serialize(-10)).toBe('-10');
  });

  it('serializes an empty list', () => {
    expect(serialize([])).toBe('()');
  });

  it('serializes a simple list', () => {
    const expr = [Sym.for('at'), 10, 20] as SExpr[];
    expect(serialize(expr)).toBe('(at 10 20)');
  });

  it('serializes a list with a quoted string', () => {
    const expr = [Sym.for('layer'), 'F.Cu'] as SExpr[];
    expect(serialize(expr)).toBe('(layer "F.Cu")');
  });

  it('serializes nested lists', () => {
    const expr: SExpr = [
      Sym.for('footprint'),
      'Resistor:R_0805',
      [Sym.for('at'), 10, 20, 0],
      [Sym.for('layer'), 'F.Cu'],
    ];
    const result = serialize(expr);
    expect(result).toContain('(footprint');
    expect(result).toContain('"Resistor:R_0805"');
    expect(result).toContain('(at 10 20 0)');
    expect(result).toContain('"F.Cu"');
  });

  it('round-trips parse → serialize for simple expressions', () => {
    const input = '(at 10 20 90)';
    expect(serialize(parse(input))).toBe(input);
  });

  it('round-trips parse → serialize for string values', () => {
    const input = '(layer "F.Cu")';
    expect(serialize(parse(input))).toBe(input);
  });

  it('round-trips a realistic KiCAD expression', () => {
    const input = '(footprint "Resistor_SMD:R_0805" (at 10.5 20.3 90) (layer "F.Cu") (uuid "abc-123"))';
    const parsed = parse(input);
    const output = serialize(parsed);
    expect(output).toBe(input);
  });

  it('pretty-prints with indentation', () => {
    const expr: SExpr = [
      Sym.for('footprint'),
      'R_0805',
      [Sym.for('at'), 10, 20],
      [Sym.for('layer'), 'F.Cu'],
      [Sym.for('fp_text'), 'user', 'test', [Sym.for('at'), 5, 5], [Sym.for('layer'), 'F.Fab']],
    ];
    const result = prettyPrint(expr);
    expect(result).toContain('\n');
    expect(result).toContain('  ');
    expect(result).toContain('(at 10 20)');
  });

  it('inlines short lists in pretty mode', () => {
    const expr: SExpr = [Sym.for('footprint'), 'R_0805', [Sym.for('at'), 10, 20]];
    const result = prettyPrint(expr);
    expect(result).toContain('(at 10 20)');
  });
});

describe('Builder', () => {
  it('s() creates a named list', () => {
    const result = s('at', 10, 20);
    expect(Array.isArray(result)).toBe(true);
    expect(Sym.isSym(result[0]) && result[0].name).toBe('at');
    expect(result[1]).toBe(10);
    expect(result[2]).toBe(20);
  });

  it('s() with nested s()', () => {
    const result = s('footprint', 'R_0805', s('at', 10, 20, 0), s('layer', 'F.Cu'));
    expect(Sym.isSym(result[0]) && result[0].name).toBe('footprint');
    expect(result[1]).toBe('R_0805');
    const atNode = result[2] as SExpr[];
    expect(Sym.isSym(atNode[0]) && atNode[0].name).toBe('at');
  });

  it('builds a via node matching KiCAD format', () => {
    const via = s(
      'via',
      s('at', 10, 20),
      s('size', 0.6),
      s('drill', 0.3),
      s('layers', 'F.Cu', 'B.Cu'),
      s('free', yes()),
      s('net', 5),
      s('uuid', 'abc-123'),
    );
    const output = serialize(via);
    expect(output).toContain('(via');
    expect(output).toContain('(at 10 20)');
    expect(output).toContain('"F.Cu"');
    expect(output).toContain('"B.Cu"');
    expect(output).toContain('(free yes)');
    expect(output).toContain('(net 5)');
    expect(output).toContain('"abc-123"');
  });

  it('yes() and no() return interned syms', () => {
    expect(yes().name).toBe('yes');
    expect(no().name).toBe('no');
    expect(yes()).toBe(Sym.for('yes'));
  });

  it('builder output can be serialized and re-parsed', () => {
    const built = s(
      'segment',
      s('start', 0, 0),
      s('end', 10, 10),
      s('width', 0.25),
      s('layer', 'F.Cu'),
      s('net', 1),
      s('uuid', 'test-uuid'),
    );
    const serialized = serialize(built);
    const reparsed = parse(serialized) as SExpr[];

    expect(Sym.isSym(reparsed[0]) && reparsed[0].name).toBe('segment');
    const start = reparsed[1] as SExpr[];
    expect(start[1]).toBe(0);
    expect(start[2]).toBe(0);
  });
});

describe('SNode query', () => {
  function makeTestTree(): SNode {
    const parsed = parse(
      `(footprint "Resistor:R_0805" (at 10.5 20.3 90) (layer "F.Cu") (uuid "abc-123") (property "Reference" "R1" (at 0 -1.65 90)) (property "Value" "10k" (at 0 1.65 90)) (pad 1 smd roundrect (at -1 0 90) (size 0.5 0.8) (layers "F.Cu" "F.Paste" "F.Mask") (uuid "pad1-uuid")))`,
    );
    return SNode.from(parsed as SExpr[]);
  }

  it('name returns the node type', () => {
    const node = makeTestTree();
    expect(node.name).toBe('footprint');
  });

  it('getString returns string values', () => {
    const node = makeTestTree();
    expect(node.getString(1)).toBe('Resistor:R_0805');
  });

  it('getNumber returns numeric values', () => {
    const node = makeTestTree();
    const atNode = node.child('at')!;
    expect(atNode.getNumber(1)).toBe(10.5);
    expect(atNode.getNumber(2)).toBe(20.3);
    expect(atNode.getNumber(3)).toBe(90);
  });

  it('child finds a direct child by name', () => {
    const node = makeTestTree();
    const layer = node.child('layer');
    expect(layer).not.toBeNull();
    expect(layer!.name).toBe('layer');
    expect(layer!.getString(1)).toBe('F.Cu');
  });

  it('child returns null for missing name', () => {
    const node = makeTestTree();
    expect(node.child('nonexistent')).toBeNull();
  });

  it('children returns all children', () => {
    const node = makeTestTree();
    const allChildren = node.children();
    expect(allChildren.length).toBeGreaterThanOrEqual(4);
  });

  it('children filters by name', () => {
    const node = makeTestTree();
    const properties = node.children('property');
    expect(properties.length).toBe(2);
  });

  it('findAll recursively finds nodes', () => {
    const node = makeTestTree();
    const uuids = node.findAll('uuid');
    expect(uuids.length).toBeGreaterThanOrEqual(2);
  });

  it('getBool returns boolean values', () => {
    const parsed = parse('(locked yes)');
    const node = SNode.from(parsed as SExpr[]);
    expect(node.getBool(1)).toBe(true);

    const parsed2 = parse('(locked no)');
    const node2 = SNode.from(parsed2 as SExpr[]);
    expect(node2.getBool(1)).toBe(false);
  });

  it('getNumber returns fallback for missing values', () => {
    const parsed = parse('(at 10 20)');
    const node = SNode.from(parsed as SExpr[]);
    expect(node.getNumber(3, 0)).toBe(0);
    expect(node.getNumber(99, -1)).toBe(-1);
  });

  it('stringValue returns first string value', () => {
    const node = makeTestTree();
    expect(node.stringValue).toBe('Resistor:R_0805');
  });

  it('joinedStringValue joins consecutive strings', () => {
    const parsed = parse('(gr_text "Hello World" (at 10 20))');
    const node = SNode.from(parsed as SExpr[]);
    expect(node.joinedStringValue).toBe('Hello World');
  });

  it('set modifies a value in place', () => {
    const parsed = parse('(at 10 20 90)');
    const node = SNode.from(parsed as SExpr[]);
    node.set(1, 15);
    expect(node.getNumber(1)).toBe(15);
  });

  it('push adds children', () => {
    const parsed = parse('(footprint "R_0805")');
    const node = SNode.from(parsed as SExpr[]);
    const prevLen = node.length;
    node.push(s('layer', 'F.Cu'));
    expect(node.length).toBe(prevLen + 1);
  });

  it('removeChild removes a child by name', () => {
    const node = makeTestTree();
    expect(node.hasChild('uuid')).toBe(true);
    const removed = node.removeChild('uuid');
    expect(removed).toBe(true);
    expect(node.hasChild('uuid')).toBe(false);
  });

  it('replaceChild replaces a child', () => {
    const node = makeTestTree();
    const newLayer = s('layer', 'B.Cu');
    const replaced = node.replaceChild('layer', newLayer);
    expect(replaced).toBe(true);
    expect(node.child('layer')!.getString(1)).toBe('B.Cu');
  });

  it('is checks node type', () => {
    const node = makeTestTree();
    expect(node.is('footprint')).toBe(true);
    expect(node.is('pad')).toBe(false);
  });

  it('hasChild checks for child existence', () => {
    const node = makeTestTree();
    expect(node.hasChild('at')).toBe(true);
    expect(node.hasChild('missing')).toBe(false);
  });

  it('rawAt provides raw access', () => {
    const node = makeTestTree();
    const raw = node.rawAt(0);
    expect(Sym.isSym(raw) && raw.name).toBe('footprint');
  });

  it('toArray returns the underlying array', () => {
    const parsed = parse('(at 10 20)');
    const node = SNode.from(parsed as SExpr[]);
    const arr = node.toArray();
    expect(Array.isArray(arr)).toBe(true);
    expect(arr).toBe(parsed as SExpr[]);
  });

  it('pad node with layers round-trips correctly', () => {
    const node = makeTestTree();
    const pads = node.children('pad');
    expect(pads.length).toBe(1);
    const pad = pads[0];
    expect(pad.getNumber(1)).toBe(1);
    const layers = pad.child('layers');
    expect(layers).not.toBeNull();
  });
});

describe('Type guards', () => {
  it('isList', () => {
    expect(isList([])).toBe(true);
    expect(isList('str')).toBe(false);
    expect(isList(42)).toBe(false);
    expect(isList(Sym.for('x'))).toBe(false);
  });

  it('isSym', () => {
    expect(isSym(Sym.for('x'))).toBe(true);
    expect(isSym('x')).toBe(false);
  });

  it('isString', () => {
    expect(isString('hello')).toBe(true);
    expect(isString(Sym.for('hello'))).toBe(false);
  });

  it('isNumber', () => {
    expect(isNumber(42)).toBe(true);
    expect(isNumber('42')).toBe(false);
  });

  it('nameOf', () => {
    expect(nameOf(Sym.for('at'))).toBe('at');
    expect(nameOf('hello')).toBe('hello');
    expect(nameOf(42)).toBe('42');
    expect(nameOf([Sym.for('footprint'), 'R_0805'])).toBe('footprint');
  });
});

describe('Round-trip: large KiCAD-like expression', () => {
  const kicadPcb = `(kicad_pcb (version 20240101) (generator "typeCAD") (general (thickness 1.6)) (setup (pad_to_mask_clearance 0.05)) (net 0 "") (net 1 "VCC") (net 2 "GND") (net_class "Default" "" (clearance 0.2) (trace_width 0.25) (via_dia 0.8) (via_drill 0.4)) (footprint "Resistor_SMD:R_0805_2012Metric" (layer "F.Cu") (at 25 30 0) (uuid "aaaa-bbbb-cccc") (property "Reference" "R1" (at 0 -1.65) (layer "F.SilkS")) (property "Value" "10k" (at 0 1.65) (layer "F.Fab")) (fp_line (start -1.68 0.95) (end 1.68 0.95) (stroke (width 0.05) (type default)) (layer "F.CrtYd")) (pad 1 smd roundrect (at -0.9125 0) (size 0.975 1.4) (layers "F.Cu" "F.Paste" "F.Mask") (uuid "pad1")) (pad 2 smd roundrect (at 0.9125 0) (size 0.975 1.4) (layers "F.Cu" "F.Paste" "F.Mask") (uuid "pad2"))))`;

  it('parses and serializes back identically', () => {
    const parsed = parse(kicadPcb);
    const output = serialize(parsed);
    expect(output).toBe(kicadPcb);
  });

  it('SNode can navigate the full tree', () => {
    const tree = SNode.from(parse(kicadPcb) as SExpr[]);
    expect(tree.name).toBe('kicad_pcb');
    expect(tree.child('version')!.getNumber(1)).toBe(20240101);
    expect(tree.child('generator')!.stringValue).toBe('typeCAD');

    const footprints = tree.children('footprint');
    expect(footprints.length).toBe(1);

    const fp = footprints[0];
    expect(fp.getString(1)).toBe('Resistor_SMD:R_0805_2012Metric');

    const pads = fp.children('pad');
    expect(pads.length).toBe(2);
    expect(pads[0].getNumber(1)).toBe(1);
    expect(pads[1].getNumber(1)).toBe(2);

    const allUuids = tree.findAll('uuid');
    expect(allUuids.length).toBeGreaterThanOrEqual(3);
  });

  it('pretty-print produces multi-line output', () => {
    const parsed = parse(kicadPcb);
    const output = prettyPrint(parsed);
    expect(output.split('\n').length).toBeGreaterThan(5);
    expect(output).toContain('(version 20240101)');
    expect(output).toContain('(at 25 30 0)');
  });
});

describe('Edge cases', () => {
  it('handles empty quoted string', () => {
    const result = parse('""');
    expect(result).toBe('');
  });

  it('handles string with colons', () => {
    const result = parse('"Library:Symbol_Name"');
    expect(result).toBe('Library:Symbol_Name');
  });

  it('handles string with slashes', () => {
    const result = parse('"/path/to/file"');
    expect(result).toBe('/path/to/file');
  });

  it('handles string with underscores', () => {
    const result = parse('"some_name_here"');
    expect(result).toBe('some_name_here');
  });

  it('handles symbol with hyphens', () => {
    const result = parse('np-thru_hole');
    expect(Sym.isSym(result) && result.name).toBe('np-thru_hole');
  });

  it('handles symbol with dots', () => {
    const result = parse('Edge.Cuts');
    expect(Sym.isSym(result) && result.name).toBe('Edge.Cuts');
  });

  it('handles zero', () => {
    expect(parse('0')).toBe(0);
  });

  it('handles negative zero', () => {
    const result = parse('-0');
    expect(typeof result).toBe('number');
  });

  it('parses multiple top-level expressions', () => {
    const result = parse('(a 1) (b 2)') as SExpr[];
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(2);
  });

  it('preserves string order in multi-value nodes', () => {
    const input = '(property "Reference" "R1" (at 0 -1.65))';
    const result = parse(input) as SExpr[];
    expect(result[1]).toBe('Reference');
    expect(result[2]).toBe('R1');
  });
});
