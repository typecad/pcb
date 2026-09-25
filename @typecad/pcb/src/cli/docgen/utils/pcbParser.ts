import { parse, isList } from '../../../sexpr/index.js';
import type { SExpr } from '../../../sexpr/index.js';

interface ComponentInfo {
  designator: string;
  value: string;
  footprint: string;
}

function extractStringValue(expr: SExpr): string {
  if (typeof expr === 'string') return expr;
  if (Array.isArray(expr) && expr.length > 0) return extractStringValue(expr[0]);
  return '';
}

function findChildren(node: SExpr, name: string): SExpr[] {
  if (!isList(node)) return [];
  const results: SExpr[] = [];
  for (const child of node) {
    if (isList(child) && child.length > 0 && extractStringValue(child[0]) === name) {
      results.push(child);
    }
  }
  return results;
}

function getChild(node: SExpr, name: string): SExpr | null {
  if (!isList(node)) return null;
  for (const child of node) {
    if (isList(child) && child.length > 0 && extractStringValue(child[0]) === name) {
      return child;
    }
  }
  return null;
}

function getStringAt(node: SExpr, index: number): string {
  if (!isList(node) || index >= node.length) return '';
  return extractStringValue(node[index]);
}

export async function extractComponents(pcbFilePath: string): Promise<Map<string, ComponentInfo>> {
  const fs = await import('fs/promises');
  const content = await fs.readFile(pcbFilePath, 'utf-8');
  const parsed = parse(content);
  const components = new Map<string, ComponentInfo>();

  if (!isList(parsed)) return components;

  const footprints = findChildren(parsed, 'footprint');
  for (const fp of footprints) {
    let designator = '';
    let value = '';
    const footprint = getStringAt(fp, 1);

    for (const prop of findChildren(fp, 'property')) {
      const propName = getStringAt(prop, 1);
      const propValue = getStringAt(prop, 2);
      if (propName === 'Reference') {
        designator = propValue;
      } else if (propName === 'Value') {
        value = propValue;
      }
    }

    for (const txt of findChildren(fp, 'fp_text')) {
      const textType = getStringAt(txt, 1);
      const textValue = getStringAt(txt, 2);
      if (textType === 'reference') {
        designator = textValue;
      } else if (textType === 'value') {
        value = textValue;
      }
    }

    if (designator && /^[A-Z]+\d+$/i.test(designator)) {
      components.set(designator, { designator, value, footprint });
    }
  }

  return components;
}
