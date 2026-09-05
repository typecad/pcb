import type { MarkdownIt } from 'markdown-it';

function escapeAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export const customImagePlugin = (
  md: MarkdownIt,
  processAltText: (layers: string[], src: string, width?: number) => Promise<void> | void,
) => {
  md.inline.ruler.before('image', 'custom_image', (state, silent) => {
    const pos = state.pos;
    if (state.src[pos] !== '!') return false;

    const match = /^!\[([^\]]*?)\]\(([^)]+?)(?:\s*=(\d+(?:\.\d+)?%?)(?:x(\d+(?:\.\d+)?))?)?\)/.exec(
      state.src.slice(pos),
    );
    if (!match) return false;

    const [fullMatch, altContent, src, width, height] = match;

    if (altContent.startsWith('{') && altContent.endsWith('}')) {
      const layers = altContent.slice(1, -1).split(/\s*,\s*/);
      const widthNum = width && !width.endsWith('%') ? parseFloat(width) : undefined;

      processAltText(layers, src, widthNum);
    }

    const token = state.push('html_block', '', 0);

    const isLayerBasedImage = altContent.startsWith('{') && !altContent.includes('Render');
    const isDrillLayer = altContent === '{Drill}';
    const isStackupLayer = altContent === '{Stackup}';

    let displayAlt = altContent;
    if (altContent.startsWith('{') && altContent.endsWith('}')) {
      const inner = altContent.slice(1, -1);
      if (inner === 'Drill') {
        displayAlt = 'Drill Map';
      } else if (inner === 'Stackup') {
        displayAlt = 'PCB Layer Stackup';
      } else if (inner.includes('Render')) {
        const parts = inner.split('/');
        const side = parts[1] || '';
        displayAlt = '3D Render - ' + side.charAt(0).toUpperCase() + side.slice(1);
      } else {
        displayAlt = inner.split(',').join(', ') + ' Layer';
      }
    }

    const isPercentWidth = width ? width.endsWith('%') : false;
    const widthCss = width ? (isPercentWidth ? width : width + 'px') : '';

    let wrapperStyle = `display: flex; justify-content: center; align-items: center; margin: 0 auto;`;
    if (widthCss) {
      if (isPercentWidth) {
        wrapperStyle += ` width: ${widthCss}; max-width: 100%;`;
      } else {
        wrapperStyle += ` width: 100%; max-width: ${widthCss};`;
      }
    } else {
      wrapperStyle += ` width: 100%; max-width: 100%;`;
    }
    if (height) {
      wrapperStyle += ` height: ${height}px;`;
    } else {
      wrapperStyle += ` height: auto;`;
    }

    let imgStyle = '';
    if (isLayerBasedImage && !isDrillLayer) {
      imgStyle += 'background-color: var(--color-image-background); ';
    }
    if (height) {
      imgStyle += 'height: 100%; width: auto; object-fit: contain;';
    } else if (widthCss) {
      imgStyle += 'width: 100%; height: auto;';
    } else {
      imgStyle += 'max-width: 100%; height: auto;';
    }

    token.content = `<div class="image-wrapper" style="${wrapperStyle}"><img src="${escapeAttr(src)}" alt="${escapeAttr(displayAlt)}" ${width ? `width="${width}"` : ''} ${height ? `height="${height}"` : ''} data-width="${width || ''}" data-height="${height || ''}" data-is-layer="${isLayerBasedImage}" style="${imgStyle}" class="${isDrillLayer ? 'drill-layer' : ''}${isStackupLayer ? ' stackup-container' : ''}"></div>`;

    state.pos += fullMatch.length;
    return true;
  });
};
