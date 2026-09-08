interface LeafElement {
  tag: string;
  attributes: string;
  outerHtml: string;
  index: number;
  textContent?: string;
}

function extractLeafElements(svg: string): LeafElement[] {
  const elements: LeafElement[] = [];
  const tagRegex = /<(path|circle|rect|line|ellipse|polygon|polyline|text)\b([\s\S]*?)>/gi;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(svg)) !== null) {
    const tag = match[1].toLowerCase();
    const attrs = match[2];
    const openingTag = match[0];
    let fullElement: string;
    let elementEnd: number;
    let textContent: string | undefined;

    if (openingTag.trim().endsWith('/>') || openingTag.endsWith('?')) {
      fullElement = openingTag;
      elementEnd = match.index + openingTag.length;
    } else {
      const closeTag = `</${tag}>`;
      const closeIndex = svg.indexOf(closeTag, match.index + openingTag.length);
      const contentEnd = closeIndex !== -1 ? closeIndex + closeTag.length : svg.length;
      fullElement = svg.slice(match.index, contentEnd);
      elementEnd = contentEnd;
      if (tag === 'text') {
        textContent = svg.slice(match.index + openingTag.length, closeIndex !== -1 ? closeIndex : svg.length);
      }
    }

    elements.push({ tag, attributes: attrs.trim(), outerHtml: fullElement, index: match.index, textContent });
    tagRegex.lastIndex = elementEnd;
  }

  return elements;
}

function getAttr(attrs: string, name: string): string {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i');
  const m = attrs.match(pattern);
  return m ? m[1] : '';
}

function computeElementKey(el: LeafElement): string {
  const { tag, attributes: attrs, textContent } = el;
  switch (tag) {
    case 'path': {
      const d = getAttr(attrs, 'd');
      return 'path:' + d.replace(/\s+/g, ' ').trim();
    }
    case 'circle': {
      return `circle:${getAttr(attrs, 'cx')}:${getAttr(attrs, 'cy')}:${getAttr(attrs, 'r')}`;
    }
    case 'rect': {
      return `rect:${getAttr(attrs, 'x')}:${getAttr(attrs, 'y')}:${getAttr(attrs, 'width')}:${getAttr(attrs, 'height')}`;
    }
    case 'line': {
      return `line:${getAttr(attrs, 'x1')}:${getAttr(attrs, 'y1')}:${getAttr(attrs, 'x2')}:${getAttr(attrs, 'y2')}`;
    }
    case 'ellipse': {
      return `ellipse:${getAttr(attrs, 'cx')}:${getAttr(attrs, 'cy')}:${getAttr(attrs, 'rx')}:${getAttr(attrs, 'ry')}`;
    }
    case 'text': {
      const x = getAttr(attrs, 'x');
      const y = getAttr(attrs, 'y');
      const content = textContent || '';
      return `text:${x}:${y}:${content.replace(/\s+/g, ' ').trim()}`;
    }
    case 'polygon':
    case 'polyline': {
      const pts = getAttr(attrs, 'points');
      return `${tag}:${pts.replace(/\s+/g, ' ').trim()}`;
    }
    default:
      return '';
  }
}

function injectClassInElement(outerHtml: string, className: string): string {
  const classRegex = /\bclass\s*=\s*"([^"]*)"/;
  const existing = outerHtml.match(classRegex);
  if (existing) {
    const existingClasses = existing[1].split(/\s+/).filter(Boolean);
    if (!existingClasses.includes(className)) {
      existingClasses.push(className);
      return outerHtml.replace(classRegex, `class="${existingClasses.join(' ')}"`);
    }
    return outerHtml;
  }
  return outerHtml.replace(/^<\w+/, `$& class="${className}"`);
}

export interface SVGAnnotation {
  annotatedOriginal: string;
  annotatedModified: string;
}

export function annotateLayerSvgs(originalSvg: string, modifiedSvg: string): SVGAnnotation | null {
  const origElements = extractLeafElements(originalSvg);
  const modElements = extractLeafElements(modifiedSvg);

  if (origElements.length === 0 && modElements.length === 0) {
    return null;
  }

  const origKeyMap = new Map<string, string>();
  for (const el of origElements) {
    const key = computeElementKey(el);
    if (key) origKeyMap.set(key, el.outerHtml);
  }

  const modKeySet = new Set<string>();
  for (const el of modElements) {
    const key = computeElementKey(el);
    if (key) modKeySet.add(key);
  }

  const origReplacements: Array<{ index: number; oldHtml: string; newHtml: string }> = [];
  for (const el of origElements) {
    const key = computeElementKey(el);
    if (!key) continue;
    if (modKeySet.has(key)) {
      const newHtml = injectClassInElement(el.outerHtml, 'diff-hidden');
      if (newHtml !== el.outerHtml) {
        origReplacements.push({ index: el.index, oldHtml: el.outerHtml, newHtml });
      }
    } else {
      const newHtml = injectClassInElement(el.outerHtml, 'diff-removed');
      if (newHtml !== el.outerHtml) {
        origReplacements.push({ index: el.index, oldHtml: el.outerHtml, newHtml });
      }
    }
  }

  const modReplacements: Array<{ index: number; oldHtml: string; newHtml: string }> = [];
  for (const el of modElements) {
    const key = computeElementKey(el);
    if (!key) continue;
    if (!origKeyMap.has(key)) {
      const newHtml = injectClassInElement(el.outerHtml, 'diff-added');
      if (newHtml !== el.outerHtml) {
        modReplacements.push({ index: el.index, oldHtml: el.outerHtml, newHtml });
      }
    }
  }

  if (origReplacements.length === 0 && modReplacements.length === 0) {
    return null;
  }

  let annotatedOriginal = originalSvg;
  for (const r of [...origReplacements].reverse()) {
    annotatedOriginal =
      annotatedOriginal.slice(0, r.index) + r.newHtml + annotatedOriginal.slice(r.index + r.oldHtml.length);
  }

  let annotatedModified = modifiedSvg;
  for (const r of [...modReplacements].reverse()) {
    annotatedModified =
      annotatedModified.slice(0, r.index) + r.newHtml + annotatedModified.slice(r.index + r.oldHtml.length);
  }

  return { annotatedOriginal, annotatedModified };
}
