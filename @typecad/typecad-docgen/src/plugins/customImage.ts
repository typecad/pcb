import MarkdownIt from 'markdown-it';

function escapeAttr(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

export const customImagePlugin = (md: MarkdownIt, processAltText: (layers: string[], src: string, width?: number) => Promise<void> | void) => {
    md.inline.ruler.before('image', 'custom_image', (state, silent) => {
        const pos = state.pos;
        if (state.src[pos] !== '!') return false;

        const match = /^!\[([^\]]*?)\]\(([^)]+?)(?:\s+=(\d+(?:\.\d+)?)(?:x(\d+(?:\.\d+)?))?)?\)/.exec(
            state.src.slice(pos)
        );
        if (!match) return false;

        const [fullMatch, altContent, src, width, height] = match;

        if (altContent.startsWith('{') && altContent.endsWith('}')) {
            const layers = altContent.slice(1, -1).split(/\s*,\s*/);
            const widthNum = width ? parseInt(width, 10) : undefined;

            processAltText(layers, src, widthNum);
        }

        const token = state.push('html_block', '', 0);

        const isLayerBasedImage = altContent.startsWith('{') && !altContent.includes('Render');
        const isDrillLayer = altContent === '{Drill}';
        const isStackupLayer = altContent === '{Stackup}';

        const dataLightSrcMatch = src.match(/data-light-src="([^"]+)"/);
        const dataDarkSrcMatch = src.match(/data-dark-src="([^"]+)"/);

        const cleanSrc = src.replace(/\s+data-light-src="[^"]+"\s+data-dark-src="[^"]+"/, '');

        let dataAttributes = '';
        if (isStackupLayer) {
            if (dataLightSrcMatch && dataDarkSrcMatch) {
                dataAttributes = ` data-light-src="${escapeAttr(dataLightSrcMatch[1])}" data-dark-src="${escapeAttr(dataDarkSrcMatch[1])}"`;
            }
            else {
                if (cleanSrc.includes('_light.png')) {
                    const darkSrc = cleanSrc.replace('_light.png', '_dark.png');
                    dataAttributes = ` data-light-src="${escapeAttr(cleanSrc)}" data-dark-src="${escapeAttr(darkSrc)}"`;
                } else if (cleanSrc.includes('_dark.png')) {
                    const lightSrc = cleanSrc.replace('_dark.png', '_light.png');
                    dataAttributes = ` data-light-src="${escapeAttr(lightSrc)}" data-dark-src="${escapeAttr(cleanSrc)}"`;
                } else {
                    const lightSrc = cleanSrc.replace(/\.png$/, '_light.png');
                    const darkSrc = cleanSrc.replace(/\.png$/, '_dark.png');
                    dataAttributes = ` data-light-src="${escapeAttr(lightSrc)}" data-dark-src="${escapeAttr(darkSrc)}"`;
                }
            }
        }

        const styleAttr = `style="${width ? `width: ${width}px; height: ${height ? height + 'px' : 'auto'};` : ''}${isLayerBasedImage && !isDrillLayer ? 'background-color: var(--color-image-background);' : ''}"`;

        token.content = `<div style="height: ${height ? height + 'px' : 'auto'}; display: flex; justify-content: center; align-items: center;"><img src="${escapeAttr(cleanSrc)}" alt="${escapeAttr(altContent)}" ${width ? `width="${width}"` : ''} ${height ? `height="${height}"` : ''} ${styleAttr}${dataAttributes} class="${isDrillLayer ? 'drill-layer' : ''}${isStackupLayer ? ' stackup-container' : ''}"></div>`;

        state.pos += fullMatch.length;
        return true;
    });
};
