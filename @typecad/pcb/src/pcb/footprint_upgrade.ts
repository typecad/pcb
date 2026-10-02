// ---------------------------------------------------------------------------
// Native replacement for `kicad-cli fp upgrade`: migrate .kicad_mod footprint
// files to the current file format without shelling out to KiCad.
//
// The transformation set was captured empirically against kicad-cli 10
// (before/after diffs on KiCad 5, KiCad 7 and current-format inputs):
//   - `module` root renamed to `footprint`; the footprint's name becomes the
//     file stem (KiCad library semantics — name must match the file)
//   - version/generator re-stamped (20241229 / typecad, matching the board
//     writer); files already at or beyond that version are skipped
//   - `(fp_text reference/value …)` become `(property "Reference"/"Value" …)`
//     with a 3-element `(at x y 0)` and `hide` normalized to `(hide yes)`;
//     user texts stay `fp_text user`
//   - missing Value/Datasheet/Description properties are synthesized
//   - all `(attr …)` nodes merge into one; `(width W)` strokes become
//     `(stroke (width W) (type solid))`; rects/circles gain `(fill no)`
//   - pad layer sets are canonicalized (F+B pairs compress to `*.Cu`/…;
//     explicit sides print Cu,Mask,Paste, wildcards print Cu,Paste,Mask)
//   - uuids are kept when present and generated when missing
//   - `(duplicate_pad_numbers_are_jumpers no)` and `(embedded_fonts no)`
//     stamped; `(model …)` nodes move last
//
// Deviations from kicad-cli, deliberately: per-file errors are isolated (the
// CLI aborts the whole library on one malformed file), and graphics keep
// their file order (KiCad's internal type sort is cosmetic).
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { parse, serialize, Sym } from '../sexpr/index.js';
import { GENERATOR_NAME, generatorVersion } from '../utils/generator_identity.js';
import type { SExpr } from '../sexpr/index.js';

/** The format version this writer emits — matches the board writer's stamp. */
export const FOOTPRINT_FORMAT_VERSION = 20241229;

type List = SExpr[];

function isList(e: SExpr | undefined): e is List {
  return Array.isArray(e);
}

function nameOf(e: SExpr): string | null {
  return isList(e) && Sym.isSym(e[0]) ? e[0].name : null;
}

function list(name: string, ...rest: SExpr[]): List {
  return [Sym.for(name), ...rest];
}

function num(v: number): SExpr {
  return v;
}

function child(node: List, name: string): List | undefined {
  return node.find((c): c is List => isList(c) && nameOf(c) === name);
}

function childValue(node: List, name: string): SExpr | undefined {
  return child(node, name)?.[1];
}

/** A `(uuid …)` node with a valid v4 uuid, or undefined for junk values. */
function existingUuid(node: List): List | undefined {
  const u = child(node, 'uuid');
  const v = u?.[1];
  return typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) ? u : undefined;
}

function ensureUuid(node: List, before?: string): void {
  if (existingUuid(node)) return;
  const uuid = list('uuid', randomUUID());
  const i = before ? node.findIndex((c) => isList(c) && nameOf(c) === before) : -1;
  if (i >= 0) node.splice(i, 0, uuid);
  else node.push(uuid);
}

/** `(at x y)` → `(at x y 0)` (text positions carry an angle; pad ones don't). */
function ensureAtAngle(node: List): void {
  const at = child(node, 'at');
  if (!at || at.length !== 3) return;
  const i = node.indexOf(at);
  node[i] = list('at', at[1], at[2], num(0));
}

const STANDARD_PROPERTIES = ['Reference', 'Value', 'Datasheet', 'Description'] as const;

/**
 * Quote a node's bare-symbol first value (easyeda-era files write
 * `(layer F.Cu)`/`(pad 1 …)` unquoted; the current format quotes them).
 */
function quoteFirstValue(node: List): List {
  const v = node[1];
  if (Sym.isSym(v)) {
    const copy = [...node] as List;
    copy[1] = v.name;
    return copy;
  }
  return node;
}

/** fp_text reference/value → property (user texts are returned unchanged). */
function migrateText(node: List, kind: string): { property?: List; userText?: List } {
  // easyeda2kicad-era files write the text (and layer) as bare symbols
  const rawText = node[2];
  const raw = typeof rawText === 'string' ? rawText : Sym.isSym(rawText) ? rawText.name : String(rawText ?? '');
  // KiCad migrated the legacy %R/%V variables to ${REFERENCE}/${VALUE}
  const text = raw.replaceAll('%R', '${REFERENCE}').replaceAll('%V', '${VALUE}');
  const at = child(node, 'at');
  const layer = child(node, 'layer');
  const effects = child(node, 'effects');
  const bareHide = node.some((c) => Sym.isSym(c) && c.name === 'hide');
  const hideList = child(node, 'hide');

  const body: List = [];
  if (at) {
    body.push(at.length >= 4 ? at : list('at', at[1], at[2] ?? num(0), at[3] ?? num(0)));
  }
  if (layer) body.push(quoteFirstValue(layer));
  if (hideList ?? bareHide) body.push(list('hide', Sym.for('yes')));

  if (kind === 'reference' || kind === 'value') {
    const prop = list('property', kind === 'reference' ? 'Reference' : 'Value', text, ...body);
    // a text without explicit effects takes KiCad's default font
    prop.push(effects ?? list('effects', list('font', list('size', num(1.27), num(1.27)))));
    return { property: prop };
  }
  const user = list('fp_text', Sym.for('user'), text, ...body);
  user.push(effects ?? list('effects', list('font', list('size', num(1.27), num(1.27)))));
  return { userText: user };
}

/** KiCad re-saves models with all three transform children present. */
function completeModel(model: List): List {
  const copy = [...model] as List;
  const defaults: Array<[string, number]> = [
    ['offset', 0],
    ['scale', 1],
    ['rotate', 0],
  ];
  for (const [part, v] of defaults) {
    if (!child(copy, part)) {
      copy.push(list(part, list('xyz', num(v), num(v), num(v))));
    }
  }
  return copy;
}

/** Synthesized standard property (Datasheet/Description/empty Value). */
function synthesizedProperty(name: string, hidden: boolean): List {
  const prop = list(
    'property',
    name,
    '',
    list('at', num(0), num(0), num(0)),
    list('layer', 'F.Fab'),
    ...(hidden ? [list('hide', Sym.for('yes'))] : []),
    list('uuid', randomUUID()),
    list('effects', list('font', list('size', num(1.27), num(1.27)))),
  );
  return prop;
}

const WILD = new Set(['*.Cu', '*.Mask', '*.Paste', '*']);

const isCopper = (t: string): boolean => t === 'F.Cu' || t === 'B.Cu' || /^In\d+\.Cu$/.test(t);
const isMask = (t: string): boolean => t === 'F.Mask' || t === 'B.Mask' || t === '*.Mask';
const isPaste = (t: string): boolean => t === 'F.Paste' || t === 'B.Paste' || t === '*.Paste';

/**
 * Canonicalize a pad layer set: expand wildcards, compress F+B pairs back to
 * `*` wildcards, and print in KiCad's order (explicit sides Cu,Mask,Paste;
 * wildcard parts Cu,Paste,Mask — both observed on kicad-cli 10 output).
 */
function canonicalPadLayers(tokens: string[]): string[] | null {
  const set = new Set<string>();
  for (const t of tokens) {
    if (t === '*' || t === '*.Cu') {
      set.add('F.Cu');
      set.add('B.Cu');
    } else if (t === '*.Mask') {
      set.add('F.Mask');
      set.add('B.Mask');
    } else if (t === '*.Paste') {
      set.add('F.Paste');
      set.add('B.Paste');
    } else {
      set.add(t);
    }
  }

  const coppers = [...set].filter(isCopper).sort((a, b) => {
    const rank = (l: string): number =>
      l === 'F.Cu' ? -1 : l === 'B.Cu' ? 999 : Number.parseInt(/^In(\d+)/.exec(l)![1], 10);
    return rank(a) - rank(b);
  });
  if (coppers.length === 0) return null;

  const maskBoth = set.has('F.Mask') && set.has('B.Mask');
  const pasteBoth = set.has('F.Paste') && set.has('B.Paste');
  const cuPart = coppers.length === 2 && coppers[0] === 'F.Cu' && coppers[1] === 'B.Cu' ? ['*.Cu'] : coppers;
  const maskPart = maskBoth ? ['*.Mask'] : set.has('F.Mask') ? ['F.Mask'] : set.has('B.Mask') ? ['B.Mask'] : [];
  const pastePart = pasteBoth ? ['*.Paste'] : set.has('F.Paste') ? ['F.Paste'] : set.has('B.Paste') ? ['B.Paste'] : [];

  // adhes/silk/… pad layers keep file order after the Cu/Mask/Paste trio
  const rest = [...new Set(tokens.filter((t) => !WILD.has(t) && !isCopper(t) && !isMask(t) && !isPaste(t)))];
  return pastePart[0] === '*.Paste'
    ? [...cuPart, ...pastePart, ...maskPart, ...rest]
    : [...cuPart, ...maskPart, ...pastePart, ...rest];
}

/** One footprint file's s-expression migrated to the current format. */
export function migrateFootprintSource(source: string, fileStem: string): string {
  const root = parse(source);
  if (!isList(root)) throw new Error('not an s-expression footprint file');
  const rootName = nameOf(root);
  if (rootName !== 'footprint' && rootName !== 'module') {
    throw new Error(`expected a footprint or module root, got ${String(rootName)}`);
  }

  const properties: List[] = [];
  const graphics: List[] = [];
  const pads: List[] = [];
  const models: List[] = [];
  const others: List[] = [];
  const attrTokens: string[] = [];
  let layerNode: List | undefined;
  let descrNode: List | undefined;
  let tagsNode: List | undefined;

  for (const node of root.slice(1)) {
    if (!isList(node)) continue; // the name atom is re-stamped below
    switch (nameOf(node)) {
      case 'version':
      case 'generator':
      case 'generator_version':
      case 'tedit':
        break; // re-stamped
      case 'layer':
        layerNode ??= quoteFirstValue(node);
        break;
      case 'descr':
        descrNode = [node[0], ...node.slice(1).map((c) => (Sym.isSym(c) ? c.name : c))] as List;
        break;
      case 'tags':
        tagsNode = [node[0], ...node.slice(1).map((c) => (Sym.isSym(c) ? c.name : c))] as List;
        break;
      case 'attr':
        for (const t of node.slice(1)) if (Sym.isSym(t)) attrTokens.push(t.name);
        break;
      case 'property': {
        // current-format input: keep as-is, guaranteeing at angle + uuid
        const copy = [...node] as List;
        ensureAtAngle(copy);
        ensureUuid(copy, 'effects');
        properties.push(copy);
        break;
      }
      case 'fp_text': {
        const kind = node[1];
        const kindName = Sym.isSym(kind) ? kind.name : '';
        const { property, userText } = migrateText(node, kindName);
        if (property) {
          ensureUuid(property, 'effects');
          properties.push(property);
        } else if (userText) {
          ensureAtAngle(userText);
          ensureUuid(userText, 'effects');
          graphics.push(userText);
        }
        break;
      }
      case 'fp_line':
      case 'fp_rect':
      case 'fp_circle':
      case 'fp_arc':
      case 'fp_poly': {
        const copy = node.map((c) => (isList(c) && nameOf(c) === 'layer' ? quoteFirstValue(c) : c)) as List;
        const width = child(copy, 'width');
        if (width && !child(copy, 'stroke')) {
          const i = copy.indexOf(width);
          copy[i] = list('stroke', list('width', width[1]), list('type', Sym.for('solid')));
        }
        if (!child(copy, 'fill') && (nameOf(copy) === 'fp_rect' || nameOf(copy) === 'fp_circle')) {
          const stroke = child(copy, 'stroke');
          const i = stroke ? copy.indexOf(stroke) : copy.length - 1;
          copy.splice(i + 1, 0, list('fill', Sym.for('no')));
        }
        ensureUuid(copy);
        graphics.push(orderGraphicChildren(copy));
        break;
      }
      case 'pad': {
        const copy = node.map((c) => (isList(c) && nameOf(c) === 'layer' ? quoteFirstValue(c) : c)) as List;
        if (Sym.isSym(copy[1]) || typeof copy[1] === 'number') copy[1] = String(copy[1]); // bare pad number → quoted
        const layersNode = child(copy, 'layers');
        if (layersNode) {
          const tokens = layersNode.slice(1).map(String);
          const canon = canonicalPadLayers(tokens);
          if (canon) {
            const i = copy.indexOf(layersNode);
            copy[i] = list('layers', ...canon);
          }
        }
        ensureUuid(copy);
        pads.push(copy);
        break;
      }
      case 'model':
        models.push(completeModel(node));
        break;
      case 'embedded_fonts':
      case 'duplicate_pad_numbers_are_jumpers':
        break; // re-stamped
      default:
        others.push(node);
        break;
    }
  }

  // standard properties first (Reference, Value, Datasheet, Description),
  // then any others the input carried
  const byName = new Map(properties.map((p) => [String(p[1] ?? ''), p]));
  const ordered: List[] = [];
  for (const name of STANDARD_PROPERTIES) {
    ordered.push(byName.get(name) ?? synthesizedProperty(name, name !== 'Value'));
  }
  for (const p of properties) {
    if (!(STANDARD_PROPERTIES as readonly string[]).includes(String(p[1] ?? ''))) ordered.push(p);
  }

  const out: List = [Sym.for('footprint'), fileStem];
  out.push(list('version', num(FOOTPRINT_FORMAT_VERSION)));
  out.push(list('generator', GENERATOR_NAME));
  out.push(list('generator_version', generatorVersion()));
  if (layerNode) out.push(layerNode);
  if (descrNode) out.push(descrNode);
  if (tagsNode) out.push(tagsNode);
  out.push(...ordered);
  if (attrTokens.length > 0) {
    const uniq = [...new Set(attrTokens)];
    out.push(list('attr', ...uniq.map((t) => Sym.for(t))));
  }
  out.push(list('duplicate_pad_numbers_are_jumpers', Sym.for('no')));
  out.push(...graphics, ...pads, ...others);
  out.push(list('embedded_fonts', Sym.for('no')));
  out.push(...models);

  return serialize(out, { pretty: true }) + '\n';
}

export interface FootprintUpgradeOptions {
  /** write upgraded copies into this directory instead of in place */
  outDir?: string;
  /** re-save even when the file is already at (or beyond) the target format */
  force?: boolean;
}

export type FileUpgradeStatus = 'upgraded' | 'skipped-current' | 'copied' | 'error';

export interface FootprintUpgradeResult {
  files: Array<{ file: string; status: FileUpgradeStatus; error?: string }>;
  upgraded: number;
  skipped: number;
  errors: number;
}

/** The `(version N)` stamp of a footprint file, or null when absent/unreadable. */
function fileFormatVersion(source: string): number | null {
  const root = parse(source);
  if (!isList(root)) return null;
  const v = childValue(root, 'version');
  return typeof v === 'number' ? v : null;
}

/**
 * Upgrade a footprint library (`.pretty` directory) or a single `.kicad_mod`
 * file to the current format, natively. Files already at or beyond the
 * target version are left untouched (copied verbatim to `outDir` when one is
 * given); a file that fails to parse is recorded and skipped — the rest of
 * the library still upgrades.
 */
export function upgradeFootprintLibrary(input: string, options: FootprintUpgradeOptions = {}): FootprintUpgradeResult {
  const inputPath = path.resolve(input);
  const stat = fs.statSync(inputPath);
  const single = stat.isFile();
  if (!single && !stat.isDirectory()) {
    throw new Error(`not a file or directory: ${inputPath}`);
  }

  const outDir = options.outDir ? path.resolve(options.outDir) : null;
  if (outDir && fs.existsSync(outDir)) {
    // kicad-cli parity: the output directory must not already exist
    throw new Error(`output path must not conflict with an existing path: ${outDir}`);
  }

  const files = single
    ? [inputPath]
    : fs
        .readdirSync(inputPath)
        .filter((f) => f.endsWith('.kicad_mod'))
        .sort()
        .map((f) => path.join(inputPath, f));

  if (outDir) fs.mkdirSync(outDir, { recursive: true });

  const result: FootprintUpgradeResult = { files: [], upgraded: 0, skipped: 0, errors: 0 };
  for (const file of files) {
    const stem = path.basename(file, '.kicad_mod');
    try {
      const source = fs.readFileSync(file, 'utf8');
      const version = fileFormatVersion(source);
      // A current-format file that still carries one of OUR legacy identity
      // stamps ('typecad', or an old un-versioned marker) is re-stamped —
      // it was written by an older typeCAD build. Upstream KiCad footprints
      // (kicad-footprint-generator etc.) are left untouched: they are not
      // ours to claim.
      const legacyOurs = /\(generator( |")("typecad"|typecad)\)/.test(source) && !source.includes(GENERATOR_NAME);
      if (version !== null && version >= FOOTPRINT_FORMAT_VERSION && !options.force && !legacyOurs) {
        if (outDir) fs.copyFileSync(file, path.join(outDir, path.basename(file)));
        result.files.push({ file: path.basename(file), status: 'skipped-current' });
        result.skipped++;
        continue;
      }
      if (legacyOurs && version !== null && version >= FOOTPRINT_FORMAT_VERSION && !options.force) {
        // re-stamp only: keep content, rewrite identity
        const target = outDir ? path.join(outDir, path.basename(file)) : file;
        const restamped = migrateFootprintSource(source, stem);
        fs.writeFileSync(target, restamped, 'utf8');
        result.files.push({ file: path.basename(file), status: 'upgraded' });
        result.upgraded++;
        continue;
      }
      const migrated = migrateFootprintSource(source, stem);
      const target = outDir ? path.join(outDir, path.basename(file)) : file;
      fs.writeFileSync(target, migrated, 'utf8');
      result.files.push({ file: path.basename(file), status: 'upgraded' });
      result.upgraded++;
    } catch (error) {
      result.files.push({
        file: path.basename(file),
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
      result.errors++;
    }
  }
  return result;
}

/** KiCad emits graphic children as geometry, stroke, fill, layer, uuid. */
function orderGraphicChildren(node: List): List {
  const rank = (n: string): number =>
    ({
      start: 0,
      mid: 1,
      end: 2,
      center: 3,
      pts: 4,
      stroke: 10,
      width: 11,
      fill: 20,
      layer: 30,
      uuid: 40,
      hide: 50,
      effects: 51,
      locked: 60,
    })[n] ?? 25;
  const head = node.slice(0, 2); // e.g. fp_line + nothing (fp_text carries text)
  const rest = node
    .slice(node[0] === Sym.for('fp_text') ? 3 : 2)
    .map((c, i) => ({ c, i, r: isList(c) ? rank(nameOf(c) ?? '') : 90 + i }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((e) => e.c);
  return [...head, ...rest] as List;
}
