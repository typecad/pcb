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
  /**
   * True for class-field components (`private r1 = new Component(...)`).
   * In-place prop updates are safe, but inserting `this.r1.pcb = ...` after
   * the field would land inside the class body — inserts are skipped for
   * these and only existing assignments/inline props are updated.
   */
  isClassField?: boolean;
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

/** A statement-level `obj.method(...)` call, e.g. `typecad.zone({...});`. */
export interface MethodCallInfo {
  /** Enclosing ExpressionStatement range (includes the trailing `;`). */
  statementRange: Range;
  callRange: Range;
  /** Range of each top-level argument expression. */
  argRanges: Range[];
  objectName: string;
  method: string;
  /** Object-literal props of the first argument, when it is one. */
  props: Record<string, PropertyValue>;
  /** Best-effort literal value per argument. */
  args: unknown[];
  /** Whether each argument is a spread element. */
  spread: boolean[];
  line: number;
}

/** One link of a `X.push(typecad.track(...).from(...).to(...));` chain. */
export interface TrackChainStep {
  kind: 'from' | 'to' | 'via' | 'powerInfo' | 'unknown';
  value: unknown;
}

/** A statement-level track push with its decoded builder chain. */
export interface TrackPushInfo {
  variableName: string;
  /** Name of the object `.track()` was called on (e.g. `typecad`). */
  trackObjectName: string;
  statementRange: Range;
  steps: TrackChainStep[];
  /** True when the chain contains constructs this importer does not rewrite. */
  unsupported: boolean;
  line: number;
}

/** A `let X: TrackBuilder[] = [];` style declaration collecting track pushes. */
export interface ArrayDeclInfo {
  name: string;
  statementRange: Range;
  line: number;
}

/**
 * A loose `const routeN = new TrackBuilder(...).from(...).to(...);` chain —
 * the route statements the viewer's apply bridge writes beside create().
 * Their segments reach the board through create(), so the routing regen
 * owns them: left in place next to regenerated arrays they would duplicate
 * every track they carry.
 */
export interface RouteBuilderInfo {
  name: string;
  statementRange: Range;
  line: number;
}

/** A statement-level `array.push(identifier)` — the _sync.ts sidecar's
 *  `syncTracks.push(routeN)` collect lines. They belong to the routing
 *  region (a regen that absorbs the route must take its collect line, or
 *  the reference dangles). */
export interface IdentifierPushInfo {
  objectName: string;
  argName: string;
  statementRange: Range;
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

/** Convert PropertyValue-record trees from extractValue into plain JS values. */
export function toPlainValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toPlainValue);
  if (value && typeof value === 'object' && 'range' in (value as object) && 'value' in (value as object)) {
    return toPlainValue((value as PropertyValue).value);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = toPlainValue(v);
    return out;
  }
  return value;
}

function analyzeAst(
  ast: AcornNode,
  source: string,
): {
  components: ComponentInfo[];
  pcbAssignments: PcbAssignmentInfo[];
  layoutAssignments: LayoutAssignmentInfo[];
  textCalls: TextCallInfo[];
  methodCalls: MethodCallInfo[];
  trackPushes: TrackPushInfo[];
  arrayDeclarations: ArrayDeclInfo[];
  routeBuilders: RouteBuilderInfo[];
  identifierPushes: IdentifierPushInfo[];
} {
  const components: ComponentInfo[] = [];
  const pcbAssignments: PcbAssignmentInfo[] = [];
  const layoutAssignments: LayoutAssignmentInfo[] = [];
  const textCalls: TextCallInfo[] = [];
  const methodCalls: MethodCallInfo[] = [];
  const trackPushes: TrackPushInfo[] = [];
  const arrayDeclarations: ArrayDeclInfo[] = [];
  const routeBuilders: RouteBuilderInfo[] = [];
  const identifierPushes: IdentifierPushInfo[] = [];

  const root = ast as WalkableNode;

  function visitNode(node: AcornNode): void {
    const n = node as WalkableNode;

    if (n.type === 'AssignmentExpression') {
      handleAssignment(n);
    } else if (n.type === 'VariableDeclaration') {
      handleVariableDeclaration(n);
    } else if (n.type === 'PropertyDefinition' || n.type === 'ClassProperty') {
      handlePropertyDefinition(n);
    } else if (n.type === 'ExpressionStatement') {
      handleStatementCall(n);
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

  /**
   * Class-field components (`private r1 = new Resistor({...})`). These are
   * members: the footprint Code property and rewrites address them as
   * `this.r1`, so they register with isThis=true — the mirror of
   * handleVariableDeclaration for class bodies.
   */
  function handlePropertyDefinition(n: WalkableNode): void {
    const id = (n as unknown as { key?: AcornNode }).key as WalkableNode | undefined;
    const init = (n as unknown as { value?: AcornNode }).value as WalkableNode | undefined;
    if (!id || id.type !== 'Identifier') return;
    if (!init || init.type !== 'NewExpression') return;

    const newExpr = init as unknown as NewExpression;
    const arg = newExpr.arguments?.[0] as WalkableNode | undefined;
    const varName = (id as Identifier).name;

    if (!arg) {
      components.push({
        variableName: varName,
        isThis: true,
        isClassField: true,
        creationRange: { start: n.start, end: n.end },
        constructorArgType: 'none',
        properties: {},
        line: n.loc?.start?.line ?? 0,
      });
      return;
    }
    if (arg.type === 'Literal' && typeof (arg as Literal).value === 'string') {
      components.push({
        variableName: varName,
        isThis: true,
        isClassField: true,
        creationRange: { start: n.start, end: n.end },
        constructorArgType: 'string',
        footprint: (arg as Literal).value as string,
        properties: {},
        line: n.loc?.start?.line ?? 0,
      });
    } else if (arg.type === 'ObjectExpression') {
      const props = extractObjectProperties(arg as ObjectExpression);
      const info: ComponentInfo = {
        variableName: varName,
        isThis: true,
        isClassField: true,
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

  /** Record statement-level `obj.method(...)` calls plus track push chains. */
  function handleStatementCall(stmt: WalkableNode): void {
    const expr = (stmt as unknown as { expression?: AcornNode }).expression as WalkableNode | undefined;
    if (!expr || expr.type !== 'CallExpression') return;
    const callee = expr.callee as unknown as MemberExpression;
    if (!callee || callee.type !== 'MemberExpression') return;
    const obj = callee.object as WalkableNode;
    const prop = callee.property as Identifier;
    if (!obj || obj.type !== 'Identifier' || !prop || prop.type !== 'Identifier') return;

    const args = (expr.arguments ?? []) as WalkableNode[];
    const info: MethodCallInfo = {
      statementRange: { start: stmt.start, end: stmt.end },
      callRange: { start: expr.start, end: expr.end },
      argRanges: args.map((a) => ({ start: a.start, end: a.end })),
      objectName: (obj as Identifier).name,
      method: prop.name,
      props: args[0]?.type === 'ObjectExpression' ? extractObjectProperties(args[0] as ObjectExpression) : {},
      args: args.map((a) => toPlainValue(extractValue(a))),
      spread: args.map((a) => a.type === 'SpreadElement'),
      line: stmt.loc?.start?.line ?? 0,
    };
    methodCalls.push(info);

    if (prop.name === 'push' && args.length === 1 && args[0].type === 'Identifier') {
      identifierPushes.push({
        objectName: (obj as Identifier).name,
        argName: (args[0] as Identifier).name,
        statementRange: info.statementRange,
        line: info.line,
      });
    }

    if (prop.name === 'text' && typeof info.props['text']?.value === 'string') {
      textCalls.push({
        callRange: info.callRange,
        text: info.props['text'].value as string,
        props: info.props,
        line: info.line,
      });
    }

    if (prop.name === 'push' && args.length === 1 && args[0].type === 'CallExpression') {
      handleTrackPush(stmt, info, args[0]);
    }
  }

  /** Walk a `typecad.track(...).from(...).to(...).via(...)` chain. */
  function handleTrackPush(stmt: WalkableNode, info: MethodCallInfo, chainCall: WalkableNode): void {
    const push: TrackPushInfo = {
      variableName: info.objectName,
      trackObjectName: '',
      statementRange: info.statementRange,
      steps: [],
      unsupported: false,
      line: info.line,
    };

    let node: WalkableNode | undefined = chainCall;
    while (node?.type === 'CallExpression') {
      const callee = node.callee as WalkableNode;
      if (!callee || callee.type !== 'MemberExpression') {
        push.unsupported = true;
        break;
      }
      const prop = (callee as unknown as MemberExpression).property as Identifier;
      if (!prop || prop.type !== 'Identifier') {
        push.unsupported = true;
        break;
      }
      const kind = prop.name;
      if (kind === 'track') {
        const trackObj = (callee as unknown as MemberExpression).object as WalkableNode;
        if (!trackObj || trackObj.type !== 'Identifier') push.unsupported = true;
        else push.trackObjectName = (trackObj as Identifier).name;
        break;
      }
      const arg = (node.arguments ?? [])[0] as WalkableNode | undefined;
      const value = arg ? toPlainValue(extractValue(arg)) : undefined;
      if (kind === 'from' || kind === 'to' || kind === 'via' || kind === 'powerInfo') {
        push.steps.push({ kind, value });
      } else {
        push.steps.push({ kind: 'unknown', value });
        push.unsupported = true;
      }
      node = callee.object as WalkableNode;
    }

    if (!push.trackObjectName) push.unsupported = true;
    // powerInfo encodes design intent the routing generator cannot rebuild
    if (push.steps.some((s) => s.kind === 'powerInfo')) push.unsupported = true;
    push.steps.reverse();
    trackPushes.push(push);
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

      if (init?.type === 'ArrayExpression') {
        arrayDeclarations.push({
          name: (id as Identifier).name,
          statementRange: { start: n.start, end: n.end },
          line: n.loc?.start?.line ?? 0,
        });
      }

      // `const routeN = new TrackBuilder(...).from(...).to(...)` — a call
      // chain rooted at a TrackBuilder constructor. Loose route statements
      // belong to the routing section: the regen absorbs their segments
      // (they reach the board through create()) and must remove the
      // statements, or every track they carry would exist twice.
      if (init?.type === 'CallExpression') {
        // walk down the member-call chain (.to(...).from(...)) to its root:
        // each CallExpression's callee is the member access, whose object is
        // the next link — the root of `new TrackBuilder(...).from(...).to(...)`
        let root: AcornNode | undefined = init as AcornNode;
        for (;;) {
          const w = root as WalkableNode | undefined;
          if (!w) break;
          if (
            w.type === 'CallExpression' ||
            w.type === 'MemberExpression' ||
            w.type === 'OptionalMemberExpression' ||
            w.type === 'ChainExpression'
          ) {
            const link = w as unknown as { callee?: AcornNode; object?: AcornNode };
            root = link.callee ?? link.object;
          } else break;
        }
        const rootN = root as WalkableNode | undefined;
        if (
          rootN?.type === 'NewExpression' &&
          (rootN as unknown as { callee?: WalkableNode }).callee?.type === 'Identifier' &&
          ((rootN as unknown as { callee: Identifier }).callee as Identifier).name === 'TrackBuilder'
        ) {
          routeBuilders.push({
            name: (id as Identifier).name,
            statementRange: { start: n.start, end: n.end },
            line: n.loc?.start?.line ?? 0,
          });
        }
      }

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

  // Statement-level `typecad.text({...});` calls are recorded once, by
  // handleStatementCall. A former generic CallExpression visitor recorded
  // them a second time (the statement walk recurses into the call), which
  // doubled the text-call list — with duplicate labels on the board, the
  // extra entries paired against the wrong board text and the updater then
  // rewrote a call to its sibling's position.

  visitNode(ast);

  return { components, pcbAssignments, layoutAssignments, textCalls, methodCalls, trackPushes, arrayDeclarations, routeBuilders, identifierPushes };
}

export interface SourceAnalysis {
  components: ComponentInfo[];
  pcbAssignments: PcbAssignmentInfo[];
  layoutAssignments: LayoutAssignmentInfo[];
  textCalls: TextCallInfo[];
  methodCalls: MethodCallInfo[];
  trackPushes: TrackPushInfo[];
  arrayDeclarations: ArrayDeclInfo[];
  routeBuilders: RouteBuilderInfo[];
  identifierPushes: IdentifierPushInfo[];
}

export function analyzeFile(filePath: string): SourceAnalysis | null {
  const result = parseSource(filePath);
  if (!result) return null;
  return analyzeAst(result.ast, result.source);
}

export function analyzeFileSync(filePath: string): SourceAnalysis | null {
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

/** Statement-level `obj.method(...)` calls for the given method names. */
export function findMethodCalls(filePath: string, methods: string[]): MethodCallInfo[] {
  const analysis = analyzeFile(filePath);
  if (!analysis) return [];
  return analysis.methodCalls.filter((mc) => methods.includes(mc.method));
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
