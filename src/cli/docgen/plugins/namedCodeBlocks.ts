import type { MarkdownIt } from 'markdown-it';

export default function namedCodeBlocksPlugin(md: MarkdownIt): void {
  const defaultRender = md.renderer.rules.fence;
  if (!defaultRender) throw new Error('defaultRender is undefined');

  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const orgInfo = token.info;
    const info = token.info ? String(token.info).trim() : '';

    let langName = '';
    let fileName = '';

    if (info) {
      const arr = info.split(/\s+/g);
      const match = arr[0].match(/^([^:\n]+)?(:([^:\n]*))?$/);
      if (match) {
        langName = match[1] || '';
        fileName = match[3] || '';
        token.info = langName;
      }
    }

    const rendered = defaultRender(tokens, idx, options, env, self);
    token.info = orgInfo;

    if (fileName && langName) {
      return `<div class="named-fence-block">${rendered}<div class="named-fence-filename">${fileName}</div></div>`;
    }

    return rendered;
  };
}
