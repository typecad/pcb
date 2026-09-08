export function wrapSectionsInHtml(htmlContent: string): string {
  if (!htmlContent.trim()) return '';

  const sections: string[] = [];
  const regex = /<h1[\s>]/gi;
  let lastEnd = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(htmlContent)) !== null) {
    if (lastEnd < match.index) {
      sections.push(htmlContent.slice(lastEnd, match.index));
    }
    lastEnd = match.index;
  }

  if (lastEnd < htmlContent.length) {
    sections.push(htmlContent.slice(lastEnd));
  }

  if (sections.length === 0) {
    return `<section>${htmlContent}</section>`;
  }

  return sections.map((s) => `<section>${s}</section>`).join('');
}
