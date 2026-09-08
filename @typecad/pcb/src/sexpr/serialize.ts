import { Sym } from './sym.js';
import type { SExpr } from './types.js';
import { escapeSexprString } from './escape.js';

export interface SerializeOptions {
  pretty?: boolean;
  indentSize?: number;
}

const INLINE_ATOMS = new Set([
  'at',
  'size',
  'width',
  'drill',
  'thickness',
  'radius',
  'net',
  'start',
  'end',
  'center',
  'mid',
  'offset',
  'scale',
  'rotate',
  'xyz',
  'version',
  'general',
  'clearance',
  'trace_width',
  'via_dia',
  'via_drill',
  'uvia_dia',
  'uvia_drill',
  'diff_pair_width',
  'diff_pair_gap',
  'locked',
  'free',
  'yes',
  'no',
  'tstamp',
  'tedit',
  'roundrect_rratio',
  'chamfer_ratio',
  'xy',
  'pt',
  'pad_to_mask_clearance',
  'solder_mask_min_width',
  'solder_mask_margin',
  'solder_paste_margin',
  'solder_paste_ratio',
  'thermal_gap',
  'thermal_bridge_width',
  'min_thickness',
  'zone_connect',
  'thermal_relief_gap',
  'thermal_relief_width',
  'edge',
  'die_length',
  'number',
  'length',
  'line',
  'property',
  'uuid',
  'layer',
  'layers',
  'name',
  'value',
  'font',
  'effects',
  'justify',
  'hide',
  'segment',
  'via',
  'net',
  'path',
  'lib_id',
  'fp_text',
  'gr_text',
  'gr_line',
  'gr_circle',
  'gr_arc',
  'gr_rect',
  'gr_poly',
  'pad',
  'pin',
  'stroke',
  'fill',
  'hatch',
  'group',
  'members',
  'connect_pads',
  'keepout',
  'stackup',
  'copper_finish',
  'dielectric_constraints',
  'roughening',
  'epsilon_r',
  'loss_tangent',
]);

export function serialize(expr: SExpr, options?: SerializeOptions): string {
  const pretty = options?.pretty ?? false;
  const indentSize = options?.indentSize ?? 2;
  const parts: string[] = [];
  const len = () => parts.length;

  function emit(s: string): void {
    parts[len()] = s;
  }

  function emitIndent(depth: number): void {
    if (!pretty) return;
    parts[len()] = '\n';
    for (let i = 0; i < depth * indentSize; i++) {
      parts[len()] = ' ';
    }
  }

  function shouldInlineList(list: SExpr[]): boolean {
    if (!pretty) return true;
    if (list.length === 0) return true;
    const first = list[0];
    if (Sym.isSym(first) && INLINE_ATOMS.has(first.name)) {
      let estLen = first.name.length + 2;
      for (let i = 1; i < list.length; i++) {
        const item = list[i];
        if (typeof item === 'number') estLen += String(item).length + 1;
        else if (typeof item === 'string') estLen += item.length + 3;
        else if (Sym.isSym(item)) estLen += item.name.length + 1;
        else if (Array.isArray(item)) estLen += 10;
        if (estLen > 200) return false;
      }
      return true;
    }
    if (list.length <= 4) {
      for (let i = 1; i < list.length; i++) {
        if (Array.isArray(list[i])) return false;
      }
      return true;
    }
    return false;
  }

  function writeExpr(expr: SExpr, depth: number): void {
    if (Sym.isSym(expr)) {
      emit(expr.name);
      return;
    }
    if (typeof expr === 'string') {
      emit('"');
      emit(escapeSexprString(expr));
      emit('"');
      return;
    }
    if (typeof expr === 'number') {
      emit(Number.isInteger(expr) ? expr.toString() : expr.toString());
      return;
    }
    if (Array.isArray(expr)) {
      const inline = shouldInlineList(expr);
      emit('(');
      if (expr.length > 0) {
        if (!inline) {
          emitIndent(depth + 1);
        }
        writeExpr(expr[0], depth + 1);
        for (let i = 1; i < expr.length; i++) {
          if (inline) {
            emit(' ');
          } else {
            emitIndent(depth + 1);
          }
          writeExpr(expr[i], depth + 1);
        }
      }
      if (!inline) {
        emitIndent(depth);
      }
      emit(')');
      return;
    }
  }

  writeExpr(expr, 0);
  return parts.join('');
}

export function prettyPrint(expr: SExpr, indentSize?: number): string {
  return serialize(expr, { pretty: true, indentSize });
}
