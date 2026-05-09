import MarkdownIt from 'markdown-it';

// Extract image attributes parsing
interface ImageAttributes {
    alt: string;
    src: string;
    width?: number;
    height?: number;
}

function parseImageAttributes(match: RegExpExecArray): ImageAttributes {
    const [, alt, src, width, height] = match;
    return {
        alt,
        src,
        width: width ? parseInt(width, 10) : undefined,
        height: height ? parseInt(height, 10) : undefined
    };
}

export const customImagePlugin = (md: MarkdownIt, processAltText: (layers: string[], src: string, width?: number) => Promise<void> | void) => {
    // Track all image processing tasks to avoid duplicate processing
    const processedImages = new Map<string, Promise<void>>();

    md.inline.ruler.before('image', 'custom_image', (state, silent) => {
        const pos = state.pos;
        if (state.src[pos] !== '!') return false;

        // Improved regex to capture optional widthxheight or just width
        const match = /^!\[([^\]]*?)\]\(([^)]+?)(?:\s+=(\d+(?:\.\d+)?)(?:x(\d+(?:\.\d+)?))?)?\)/.exec(
            state.src.slice(pos)
        );
        if (!match) return false;

        const [fullMatch, altContent, src, width, height] = match;
        
        // Process image only if it's a custom format
        if (altContent.startsWith('{') && altContent.endsWith('}')) {
            const layers = altContent.slice(1, -1).split(/\s*,\s*/);
            const widthNum = width ? parseInt(width, 10) : undefined;
            
            // Create a unique key for this image processing request
            const imageKey = `${layers.join(',')}-${src}-${width || 'default'}`;
            
            // Only process if we haven't already started processing this exact combination
            if (!processedImages.has(imageKey)) {
                const result = processAltText(layers, src, widthNum);
                if (result instanceof Promise) {
                    processedImages.set(imageKey, result);
                }
            }
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