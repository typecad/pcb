export { generateDocumentation } from './index.js';
export { extractStackup, generateStackupSvgString, generateStackupSvgFromFile, generateStackupFiles } from './utils/pcbLayerRenderer.js';
export { parseMetadata } from './utils/metadata.js';
export { wrapSectionsInHtml } from './utils/html.js';
export { generateHtmlDocument, escapeHtml } from './utils/template.js';
export { pathExists, ensureDir } from './utils/fs.js';
export {
    writeStringToFile,
    writeBufferToFile,
    cropSvg,
    executeKicadSvgExport,
    executeKicadDrillExport,
    processKicadSvgLayers,
    renderKicad3DView
} from './utils/svg.js';
export { PCBConfig, SVGConfig, CacheConfig } from './utils/config.js';
export { TempFileManager, tempManager } from './utils/tempFileManager.js';
export { IMetadata, defaultMetadata, getDefaultMetadata } from './types/metadata.js';
