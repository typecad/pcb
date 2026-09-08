import fs from 'node:fs';
import path from 'node:path';
import type {
  Node as AcornNode,
  ObjectExpression,
  VariableDeclaration,
  AssignmentExpression,
  NewExpression,
  MemberExpression,
  CallExpression,
  Identifier,
  Literal,
  ArrayExpression,
  Property,
} from 'acorn';
import * as acorn from 'acorn';
import { simple as walkSimple } from 'acorn-walk';
import { createRequire } from 'node:module';
import logger from '../utils/logging.js';

const _require = createRequire(import.meta.url);

type AcornTypescriptModule = {
  default?: (...args: unknown[]) => unknown;
  (...args: unknown[]): unknown;
};

const getTsPluginModule = (() => {
  let cached: AcornTypescriptModule | null | undefined = undefined;
  return (): AcornTypescriptModule | null | undefined => {
    if (cached === undefined) {
      try {
        cached = (_require('acorn-typescript') as AcornTypescriptModule) || null;
      } catch {
        cached = null;
      }
    }
    return cached;
  };
})();

export interface Range {
  start: number;
  end: number;
}

export interface PropertyValue {
  range: Range;
  value: unknown;
}

export interface ComponentInfo {
  variableName: string;
  isThis: boolean;
  creationRange: Range;
  constructorArgType: 'string' | 'object' | 'none';
  footprint?: string;
  reference?: string;
  properties: Record<string, PropertyValue>;
  inlinePcb?: {
    range: Range;
    props: Record<string, PropertyValue>;
  };
  line: number;
}

export interface PcbAssignmentInfo {
  variableName: string;
  isThis: boolean;
  assignmentRange: Range;
  objectRange: Range;
  props: Record<string, PropertyValue>;
  line: number;
}

export interface TextCallInfo {
  callRange: Range;
  text: string;
  props: Record<string, PropertyValue>;
  line: number;
}

export interface LayoutAssignmentInfo {
  variableName: string;
  isThis: boolean;
  propertyName: string;
  assignmentRange: Range;
  objectRange: Range;
  props: Record<string, PropertyValue>;
  line: number;
}

export interface Replacement {
  range: Range;
  newValue: string;
}

type WalkableNode = AcornNode & {
  start: number;
  end: number;
  loc?: { start: { line: number; column: number }; end: { line: number; column: number } } | null;
  name?: string;
  value?: unknown;
  properties?: Property[];
  elements?: AcornNode[];
  object?: AcornNode;
  callee?: AcornNode;
  arguments?: AcornNode[];
  left?: AcornNode;
  right?: AcornNode;
  init?: AcornNode;
  id?: AcornNode;
  declarations?: { id: AcornNode; init: AcornNode }[];
  type: string;
};

function parseSource(filePath: string): { ast: AcornNode; source: string } | null {
  let source: string;
  try {
    source = fs.readFileSync(filePath, 'utf-8');
  } catch {
    logger.debug('source_analyzer: cannot read file', filePath);
    return null;
  }

  try {
    const tsPlugin = getTsPluginModule();
    if (tsPlugin) {
      const pluginModule = (tsPlugin.default ? tsPlugin.default() : tsPlugin()) as Parameters<
        (typeof import('acorn').Parser)['extend']
      >[0];
      const Parser = _require('acorn').Parser.extend(pluginModule);
      const ast = Parser.parse(source, {
        ecmaVersion: 2022,
        sourceType: 'module',
        locations: true,
        allowReturnOutsideFunction: true,
        allowImportExportEverywhere: true,
      });
      return { ast, source };
    }
  } catch {
    logger.debug('source_analyzer: TS plugin parse failed, falling back');
  }

  try {
    const acornMod = _require('acorn');
    const ast = acornMod.parse(source, {
      ecmaVersion: 2022,
      sourceType: 'module',
      locations: true,
      allowReturnOutsideFunction: true,
      allowImportExportEverywhere: true,
    });
    return { ast, source };
  } catch {
    logger.debug('source_analyzer: acorn parse failed for', filePath);
    return null;
  }
}

function extractValue(node: AcornNode): unknown {
  const n = node as WalkableNode;
  switch (n.type) {
    case 'Literal':
      return n.value;
    case 'StringLiteral':
      return n.value;
    case 'NumericLiteral':
      return n.value;
    case 'BooleanLiteral':
      return n.value;
    case 'Identifier': {
      if (n.name === 'true') return true;
      if (n.name === 'false') return false;
      if (n.name === 'undefined' || n.name === 'null') return null;
      return n.name;
    }
    case 'ObjectExpression':
      return extractObjectProperties(n as unknown as ObjectExpression);
    case 'ArrayExpression': {
      const arr = n as unknown as ArrayExpression;
      return arr.elements ? arr.elements.map((el) => (el ? extractValue(el) : null)) : [];
    }
    case 'TemplateLiteral': {
      const tl = n as WalkableNode & { quasis?: { value: { raw: string } }[] };
      if (tl.quasis && tl.quasis.length > 0) return tl.quasis[0].value.raw;
      return undefined;
    }
    case 'UnaryExpression': {
      const ue = n as WalkableNode & { operator?: string; argument?: AcornNode };
      if (ue.operator === '-' && ue.argument) {
        const val = extractValue(ue.argument);
        return typeof val === 'number' ? -val : val;
      }
      return undefined;
    }
    default:
      return undefined;
  }
}

function extractObjectProperties(objNode: ObjectExpression): Record<string, PropertyValue> {
  const result: Record<string, PropertyValue> = {};
  for (const prop of objNode.properties) {
    if (prop.type === 'Property' && prop.key.type === 'Identifier') {
      const key = prop.key.name;
      const valueNode = prop.value as WalkableNode;
      result[key] = {
        range: { start: valueNode.start, end: valueNode.end },
        value: extractValue(prop.value),
      };
    }
  }
  return result;
}

function parseSourceInRange(source: string, start: number, end: number): AcornNode | null {
  try {
    const acornMod = _require('acorn');
    const fragment = source.slice(start, end);
    const wrapped = `(${fragment})`;
    const ast = acornMod.parse(wrapped, {
      ecmaVersion: 2022,
      sourceType: 'module',
    });
    const expr = (ast as unknown as { body: { expression: AcornNode }[] }).body[0]?.expression;
    if (expr) {
      const offset = start - 1;
      shiftPositions(expr, -offset);
      return expr;
    }
  } catch {
    // Ignore
  }
  return null;
}

function shiftPositions(node: AcornNode, offset: number): void {
  const n = node as WalkableNode;
  if (typeof n.start === 'number') {
    (n as { start: number }).start += offset;
  }
  if (typeof n.end === 'number') {
    (n as { end: number }).end += offset;
  }
  for (const key of Object.keys(n as unknown as Record<string, unknown>)) {
    const val = (n as unknown as Record<string, unknown>)[key];
    if (val && typeof val === 'object') {
      if (Array.isArray(val)) {
        for (const item of val) {
          if (item && typeof item === 'object' && 'type' in item) {
            shiftPositions(item as AcornNode, offset);
          }
        }
      } else if ('type' in val) {
        shiftPositions(val as AcornNode, offset);
      }
    }
  }
}

function getMemberVarName(node: AcornNode): { name: string; isThis: boolean } | null {
  const n = node as WalkableNode;
  if (n.type !== 'MemberExpression') return null;

  const memNode = node as unknown as MemberExpression;
  const prop = memNode.property as Identifier;
  if (!prop || prop.type !== 'Identifier') return null;

  const obj = memNode.object;
  if (obj.type === 'ThisExpression') {
    return { name: prop.name, isThis: true };
  }
  if (obj.type === 'Identifier' && (obj as Identifier).name === 'this') {
    return { name: prop.name, isThis: true };
  }
  if (obj.type === 'Identifier') {
    return { name: prop.name, isThis: false };
  }
  if (obj.type === 'MemberExpression') {
    return { name: prop.name, isThis: true };
  }

  return null;
}

function analyzeAst(
  ast: AcornNode,
  source: string,
): {
  components: ComponentInfo[];
  pcbAssignments: PcbAssignmentInfo[];
  layoutAssignments: LayoutAssignmentInfo[];
  textCalls: TextCallInfo[];
} {
  const components: ComponentInfo[] = [];
  const pcbAssignments: PcbAssignmentInfo[] = [];
  const layoutAssignments: LayoutAssignmentInfo[] = [];
  const textCalls: TextCallInfo[] = [];

  const root = ast as WalkableNode;

  function visitNode(node: AcornNode): void {
    const n = node as WalkableNode;

    if (n.type === 'AssignmentExpression') {
      handleAssignment(n);
    } else if (n.type === 'VariableDeclaration') {
      handleVariableDeclaration(n);
    } else if (n.type === 'CallExpression') {
      handleCallExpression(n);
    }

    for (const key of Object.keys(n as unknown as Record<string, unknown>)) {
      if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') continue;
      const val = (n as unknown as Record<string, unknown>)[key];
      if (val && typeof val === 'object') {
        if (Array.isArray(val)) {
          for (const item of val) {
            if (item && typeof item === 'object' && 'type' in item) {
              visitNode(item as AcornNode);
            }
          }
        } else if ('type' in val) {
          visitNode(val as AcornNode);
        }
      }
    }
  }

  function handleAssignment(n: WalkableNode): void {
    if (!n.left || !n.right) return;

    const left = n.left as WalkableNode;
    const right = n.right as WalkableNode;

    if (right.type === 'NewExpression') {
      handleNewExpressionAssignment(n, left, right);
    } else if (left.type === 'MemberExpression' && right.type === 'ObjectExpression') {
      handlePropertyAssignment(n, left, right);
    }
  }

  function handleNewExpressionAssignment(assignNode: WalkableNode, left: WalkableNode, right: WalkableNode): void {
    const varInfo = getMemberVarName(left as unknown as AcornNode);
    if (!varInfo) return;

    const newExpr = right as unknown as NewExpression;
    const callee = newExpr.callee as Identifier;
    if (!callee || callee.type !== 'Identifier') return;

    const arg = newExpr.arguments?.[0];
    if (!arg) {
      components.push({
        variableName: varInfo.name,
        isThis: varInfo.isThis,
        creationRange: { start: assignNode.start, end: assignNode.end },
        constructorArgType: 'none',
        properties: {},
        line: assignNode.loc?.start?.line ?? 0,
      });
      return;
    }

    if (arg.type === 'Literal' && typeof (arg as Literal).value === 'string') {
      components.push({
        variableName: varInfo.name,
        isThis: varInfo.isThis,
        creationRange: { start: assignNode.start, end: assignNode.end },
        constructorArgType: 'string',
        footprint: (arg as Literal).value as string,
        properties: {},
        line: assignNode.loc?.start?.line ?? 0,
      });
    } else if (arg.type === 'ObjectExpression') {
      const objExpr = arg as ObjectExpression;
      const props = extractObjectProperties(objExpr);
      const info: ComponentInfo = {
        variableName: varInfo.name,
        isThis: varInfo.isThis,
        creationRange: { start: assignNode.start, end: assignNode.end },
        constructorArgType: 'object',
        footprint: props['footprint']?.value as string | undefined,
        reference: props['reference']?.value as string | undefined,
        properties: props,
        line: assignNode.loc?.start?.line ?? 0,
      };

      if (props['pcb']) {
        info.inlinePcb = {
          range: props['pcb'].range,
          props: (props['pcb'].value instanceof Object ? props['pcb'].value : {}) as Record<string, PropertyValue>,
        };
      }

      components.push(info);
    }
  }

  function handlePropertyAssignment(assignNode: WalkableNode, left: WalkableNode, right: WalkableNode): void {
    const memExpr = left as unknown as MemberExpression;
    const prop = memExpr.property as Identifier;
    if (!prop || prop.type !== 'Identifier') return;

    const propName = prop.name;

    let varName: string | null = null;
    let isThis = false;
    const obj = memExpr.object;

    if (obj.type === 'ThisExpression') {
      return;
    }

    if (obj.type === 'MemberExpression') {
      const innerMem = obj as MemberExpression;
      const innerObj = innerMem.object;
      const innerProp = innerMem.property as Identifier;
      if (!innerProp) return;
      varName = innerProp.name;
      isThis =
        innerObj.type === 'ThisExpression' ||
        (innerObj.type === 'Identifier' && (innerObj as Identifier).name === 'this');
    } else if (obj.type === 'Identifier') {
      varName = (obj as Identifier).name;
      isThis = false;
    }

    if (!varName) return;

    const objExpr = right as unknown as ObjectExpression;
    const props = extractObjectProperties(objExpr);

    if (propName === 'pcb') {
      pcbAssignments.push({
        variableName: varName,
        isThis,
        assignmentRange: { start: assignNode.start, end: assignNode.end },
        objectRange: { start: objExpr.start, end: objExpr.end },
        props,
        line: assignNode.loc?.start?.line ?? 0,
      });
    } else if (propName === 'referenceLayout' || propName === 'valueLayout' || propName === 'fabLayout') {
      layoutAssignments.push({
        variableName: varName,
        isThis,
        propertyName: propName,
        assignmentRange: { start: assignNode.start, end: assignNode.end },
        objectRange: { start: objExpr.start, end: objExpr.end },
        props,
        line: assignNode.loc?.start?.line ?? 0,
      });
    }
  }

  function handleVariableDeclaration(n: WalkableNode): void {
    if (!n.declarations) return;
    const decl = n.declarations as { id: AcornNode; init: AcornNode }[];

    for (const d of decl) {
      const id = d.id as WalkableNode;
      const init = d.init as WalkableNode;

      if (!id || id.type !== 'Identifier') continue;
      if (!init || init.type !== 'NewExpression') continue;

      const newExpr = init as unknown as NewExpression;
      const callee = newExpr.callee as Identifier;
      if (!callee || callee.type !== 'Identifier') continue;

      const varName = (id as Identifier).name;
      const arg = newExpr.arguments?.[0];

      if (!arg) {
        components.push({
          variableName: varName,
          isThis: false,
          creationRange: { start: n.start, end: n.end },
          constructorArgType: 'none',
          properties: {},
          line: n.loc?.start?.line ?? 0,
        });
        continue;
      }

      if (arg.type === 'Literal' && typeof (arg as Literal).value === 'string') {
        components.push({
          variableName: varName,
          isThis: false,
          creationRange: { start: n.start, end: n.end },
          constructorArgType: 'string',
          footprint: (arg as Literal).value as string,
          properties: {},
          line: n.loc?.start?.line ?? 0,
        });
      } else if (arg.type === 'ObjectExpression') {
        const objExpr = arg as ObjectExpression;
        const props = extractObjectProperties(objExpr);
        const info: ComponentInfo = {
          variableName: varName,
          isThis: false,
          creationRange: { start: n.start, end: n.end },
          constructorArgType: 'object',
          footprint: props['footprint']?.value as string | undefined,
          reference: props['reference']?.value as string | undefined,
          properties: props,
          line: n.loc?.start?.line ?? 0,
        };

        if (props['pcb']) {
          info.inlinePcb = {
            range: props['pcb'].range,
            props: (props['pcb'].value instanceof Object ? props['pcb'].value : {}) as Record<string, PropertyValue>,
          };
        }

        components.push(info);
      }
    }
  }

  function handleCallExpression(n: WalkableNode): void {
    if (!n.callee) return;
    const callee = n.callee as WalkableNode;

    if (callee.type !== 'MemberExpression') return;
    const memExpr = callee as unknown as MemberExpression;
    const prop = memExpr.property as Identifier;
    if (!prop || prop.type !== 'Identifier' || prop.name !== 'text') return;

    const args = n.arguments as AcornNode[];
    if (!args || args.length === 0) return;

    const firstArg = args[0];
    if (firstArg.type !== 'ObjectExpression') return;

    const objExpr = firstArg as ObjectExpression;
    const props = extractObjectProperties(objExpr);
    const text = props['text']?.value as string | undefined;
    if (!text) return;

    textCalls.push({
      callRange: { start: n.start, end: n.end },
      text,
      props,
      line: n.loc?.start?.line ?? 0,
    });
  }

  visitNode(ast);

  return { components, pcbAssignments, layoutAssignments, textCalls };
}

export function analyzeFile(filePath: string): {
  components: ComponentInfo[];
  pcbAssignments: PcbAssignmentInfo[];
  layoutAssignments: LayoutAssignmentInfo[];
  textCalls: TextCallInfo[];
} | null {
  const result = parseSource(filePath);
  if (!result) return null;
  return analyzeAst(result.ast, result.source);
}

export function analyzeFileSync(filePath: string): {
  components: ComponentInfo[];
  pcbAssignments: PcbAssignmentInfo[];
  layoutAssignments: LayoutAssignmentInfo[];
  textCalls: TextCallInfo[];
} | null {
  const result = parseSource(filePath);
  if (!result) return null;
  return analyzeAst(result.ast, result.source);
}

export function findComponentByVariable(
  filePath: string,
  variableName: string,
  isThis?: boolean,
): ComponentInfo | null {
  const analysis = analyzeFile(filePath);
  if (!analysis) return null;

  return (
    analysis.components.find((c) => c.variableName === variableName && (isThis === undefined || c.isThis === isThis)) ??
    null
  );
}

export function findPcbAssignmentByVariable(
  filePath: string,
  variableName: string,
  isThis?: boolean,
): PcbAssignmentInfo | null {
  const analysis = analyzeFile(filePath);
  if (!analysis) return null;

  return (
    analysis.pcbAssignments.find(
      (p) => p.variableName === variableName && (isThis === undefined || p.isThis === isThis),
    ) ?? null
  );
}

export function findLayoutAssignments(
  filePath: string,
  variableName: string,
  isThis?: boolean,
): LayoutAssignmentInfo[] {
  const analysis = analyzeFile(filePath);
  if (!analysis) return [];

  return analysis.layoutAssignments.filter(
    (la) => la.variableName === variableName && (isThis === undefined || la.isThis === isThis),
  );
}

export function findTextCalls(filePath: string): TextCallInfo[] {
  const analysis = analyzeFile(filePath);
  if (!analysis) return [];
  return analysis.textCalls;
}

export function applyReplacements(filePath: string, replacements: Replacement[]): boolean {
  if (replacements.length === 0) return false;

  let source: string;
  try {
    source = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return false;
  }

  const sorted = [...replacements].sort((a, b) => b.range.start - a.range.start);

  let modified = source;
  for (const { range, newValue } of sorted) {
    if (range.start < 0 || range.end > modified.length || range.start > range.end) continue;
    modified = modified.slice(0, range.start) + newValue + modified.slice(range.end);
  }

  if (modified === source) return false;

  try {
    fs.writeFileSync(filePath + '.backup', source, 'utf-8');
    fs.writeFileSync(filePath, modified, 'utf-8');
  } catch {
    return false;
  }

  return true;
}

export function getMemberPrefix(isThis: boolean): string {
  return isThis ? 'this.' : '';
}

export function collectTypeScriptFiles(dir: string): string[] {
  const results: string[] = [];
  const absDir = path.resolve(dir);
  try {
    const entries = fs.readdirSync(absDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(absDir, entry.name);
      if (entry.isDirectory()) {
        if (['node_modules', 'dist', 'build', '.git', '.typecode'].includes(entry.name)) continue;
        results.push(...collectTypeScriptFiles(fullPath));
      } else if (entry.isFile() && /\.(ts|tsx|mts|cts)$/.test(entry.name)) {
        results.push(fullPath);
      }
    }
  } catch {}
  return results;
}
