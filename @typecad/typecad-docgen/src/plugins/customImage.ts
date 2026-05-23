import MarkdownIt from 'markdown-it';

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

        // Create token for HTML output
        const token = state.push('html_block', '', 0);
        
        // Check if this is a layer-based image (not a render)
        const isLayerBasedImage = altContent.startsWith('{') && !altContent.includes('Render');
        const isDrillLayer = altContent === '{Drill}';
        const isStackupLayer = altContent === '{Stackup}';

        // Extract data attributes if present
        const dataLightSrcMatch = src.match(/data-light-src="([^"]+)"/);
        const dataDarkSrcMatch = src.match(/data-dark-src="([^"]+)"/);
        
        // Clean the src attribute by removing data attributes
        const cleanSrc = src.replace(/\s+data-light-src="[^"]+"\s+data-dark-src="[^"]+"/, '');
        
        // Create data attributes for light/dark mode if this is a stackup
        let dataAttributes = '';
        if (isStackupLayer) {
            // If data attributes are present in the src, use them
            if (dataLightSrcMatch && dataDarkSrcMatch) {
                dataAttributes = ` data-light-src="${dataLightSrcMatch[1]}" data-dark-src="${dataDarkSrcMatch[1]}"`;
            } 
            // Otherwise, try to derive them from the src
            else {
                // Check if the src already has _light or _dark suffix
                if (cleanSrc.includes('_light.png')) {
                    const darkSrc = cleanSrc.replace('_light.png', '_dark.png');
                    dataAttributes = ` data-light-src="${cleanSrc}" data-dark-src="${darkSrc}"`;
                } else if (cleanSrc.includes('_dark.png')) {
                    const lightSrc = cleanSrc.replace('_dark.png', '_light.png');
                    dataAttributes = ` data-light-src="${lightSrc}" data-dark-src="${cleanSrc}"`;
                } else {
                    // If no suffix, add both
                    const lightSrc = cleanSrc.replace(/\.png$/, '_light.png');
                    const darkSrc = cleanSrc.replace(/\.png$/, '_dark.png');
                    dataAttributes = ` data-light-src="${lightSrc}" data-dark-src="${darkSrc}"`;
                }
            }
        }

        // Create style attribute for dimensions and background
        const styleAttr = `style="${width ? `width: ${width}px; height: ${height ? height + 'px' : 'auto'};` : ''}${isLayerBasedImage && !isDrillLayer ? 'background-color: var(--color-image-background);' : ''}"`;

        // Generate image HTML with consistent attributes
        token.content = `<div style="height: ${height ? height + 'px' : 'auto'}; display: flex; justify-content: center; align-items: center;"><img src="${cleanSrc}" alt="${altContent.replace(/"/g, '&quot;')}" ${width ? `width="${width}"` : ''} ${height ? `height="${height}"` : ''} ${styleAttr}${dataAttributes} class="${isDrillLayer ? 'drill-layer' : ''}${isStackupLayer ? ' stackup-container' : ''}"></div>`;
        
        state.pos += fullMatch.length;
        return true;
    });
};