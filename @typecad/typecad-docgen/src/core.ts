export { generateDocumentation } from './index.js';
export { extractStackup, renderPCBLayers, generateStackupSvgFromFile, generateStackupFiles } from './utils/pcbLayerRenderer.js';
export { parseMetadata } from './utils/metadata.js';
export { wrapSectionsInHtml } from './utils/html.js';
export { generateHtmlDocument, escapeHtml } from './utils/template.js';
export { pathExists, ensureDir } from './utils/fs.js';
export {
    processKicadSvgLayers,
    renderKicad3DView,
    executeKicadDrillExport,
    svgToPngBuffer,
    writeBufferToFile,
    combineSvgLayers,
    resizeSvg,
    svgToPng
} from './utils/svg.js';
export { PCBConfig, SVGConfig, CacheConfig } from './utils/config.js';
export { TempFileManager, tempManager } from './utils/tempFileManager.js';
export { IMetadata, defaultMetadata, getDefaultMetadata } from './types/metadata.js';
