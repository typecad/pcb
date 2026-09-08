import * as fs from 'fs/promises';
import * as path from 'path';
import { KiCAD } from '../../kicad.js';
import { IMetadata, defaultMetadata } from './types/metadata.js';
import { parseMetadata } from './utils/metadata.js';
import { wrapSectionsInHtml } from './utils/html.js';
import { processKicadSvgLayers, renderKicad3DView, executeKicadDrillExport } from './utils/svg.js';
import { customImagePlugin } from './plugins/customImage.js';
import { generateStackupSvgString } from './utils/pcbLayerRenderer.js';
import { extractComponents } from './utils/pcbParser.js';
import { tempManager } from './utils/tempFileManager.js';
import { generateHtmlDocument } from './utils/template.js';
import { pathExists, ensureDir } from './utils/fs.js';
import chalk from 'chalk';
import yoctoSpinner from './utils/spinner.js';
import open from './utils/openFile.js';
import githubAlertsPlugin from './plugins/githubAlerts.js';
import namedCodeBlocks from './plugins/namedCodeBlocks.js';
import * as url from 'url';
import logger from '../../utils/logging.js';

function cleanSvgForInlining(svgContent: string): string {
  let svg = svgContent.replace(/<\?xml[^?]*\?>\s*/g, '');
  svg = svg.replace(/<!DOCTYPE[^>]*>\s*/g, '');
  return svg.trim();
}

/**
 * Restore markdown-it helpers that markdown-it 14 removed (we pin ^15) but
 * markdown-it-multimd-table-ext still calls at plugin init — its first line
 * is `options = md.utils.assign({}, defaults, options)`, which otherwise
 * dies with "md.utils.assign is not a function" (4.2.35 is the newest
 * release; `assign` is the plugin's only removed-API usage). The clone keeps
 * the restoration to THIS instance — mutating md.utils in place would leak
 * into every other markdown-it instance in the process. Drop this shim when
 * the plugin publishes a markdown-it 14+ compatible version.
 */
export function restoreRemovedMarkdownItUtils(md: any): any {
  if (typeof md?.utils?.assign !== 'function') {
    md.utils = { ...md.utils, assign: Object.assign };
  }
  return md;
}

function addComponentTooltips(
  svgContent: string,
  components: Map<string, { designator: string; value: string; footprint: string }>,
): string {
  if (components.size === 0) return svgContent;
  let result = svgContent;
  for (const [designator, info] of components) {
    const escaped = designator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const textRegex = new RegExp(`(<text\\b[^>]*>)(\\s*${escaped}\\s*)(</text>)`, 'gi');
    result = result.replace(textRegex, `$1$2<title>${designator}: ${info.value} (${info.footprint})</title>$3`);
  }
  return result;
}

function inlineLocalImages(
  html: string,
  svgContentMap: Map<string, string>,
  pngBufferMap: Map<string, Buffer>,
  components: Map<string, { designator: string; value: string; footprint: string }>,
): string {
  const imgTagRegex = /<div[^>]*class="[^"]*image-wrapper[^"]*"[^>]*>\s*<img[^>]+>\s*<\/div>/g;
  const replacements: Array<{ original: string; replacement: string }> = [];

  for (const match of [...html.matchAll(imgTagRegex)]) {
    const fullTag = match[0];
    const imgMatch = fullTag.match(/<img([^>]+)>/);
    if (!imgMatch) continue;

    const imgAttrs = imgMatch[1];
    const srcMatch = imgAttrs.match(/src="([^"]+)"/);
    if (!srcMatch) continue;

    const src = srcMatch[1];
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) continue;

    const widthMatch = imgAttrs.match(/data-width="([^"]*)"/);
    const dataWidth = widthMatch ? widthMatch[1] : '';
    const heightMatch = imgAttrs.match(/data-height="([^"]*)"/);
    const dataHeight = heightMatch ? heightMatch[1] : '';
    const isLayerMatch = imgAttrs.match(/data-is-layer="([^"]*)"/);
    const isLayer = isLayerMatch ? isLayerMatch[1] === 'true' : false;

    const classMatch = imgAttrs.match(/class="([^"]*)"/);
    const imgClasses = classMatch ? classMatch[1].trim() : '';
    const extraClass = imgClasses ? ' ' + imgClasses : '';
    const isDrill = imgClasses.includes('drill-layer');

    if (svgContentMap.has(src)) {
      let svgContent = cleanSvgForInlining(svgContentMap.get(src)!);
      svgContent = addComponentTooltips(svgContent, components);

      const isPercent = dataWidth.endsWith('%');
      const pctNum = isPercent ? parseFloat(dataWidth) : 0;

      let wrapperStyle = `display: flex; justify-content: center; align-items: center; margin: 0 auto;`;
      let svgStyle = '';

      if (isLayer && !isDrill) {
        wrapperStyle += ` background-color: var(--color-image-background);`;
      }

      if (dataWidth) {
        if (isPercent) {
          if (pctNum > 100) {
            wrapperStyle = `width: 100%; overflow-x: auto; display: block;`;
            svgStyle = `width: ${dataWidth}; max-width: none; height: auto; display: block;`;
          } else {
            wrapperStyle += ` width: ${dataWidth}; max-width: 100%;`;
            svgStyle = `width: 100%; height: auto;`;
          }
        } else {
          wrapperStyle += ` width: 100%; max-width: ${dataWidth}px;`;
          svgStyle = `width: 100%; height: auto;`;
        }
      } else {
        wrapperStyle += ` width: 100%; max-width: 100%;`;
        svgStyle = `max-width: 100%; height: auto;`;
      }

      if (dataHeight) {
        wrapperStyle += ` height: ${dataHeight}px;`;
        svgStyle += ` height: 100%; object-fit: contain;`;
      } else {
        wrapperStyle += ` height: auto;`;
      }

      if (svgStyle) {
        svgContent = svgContent.replace(/^<svg\b/, `<svg style="${svgStyle}"`);
      }

      const wrapper = `<div class="svg-inline${extraClass}" style="${wrapperStyle}">${svgContent}</div>`;
      replacements.push({ original: fullTag, replacement: wrapper });
    } else if (pngBufferMap.has(src)) {
      const buffer = pngBufferMap.get(src)!;
      const dataUri = `data:image/png;base64,${buffer.toString('base64')}`;
      const newTag = fullTag.replace(`src="${src}"`, `src="${dataUri}"`);
      replacements.push({ original: fullTag, replacement: newTag });
    } else {
      replacements.push({ original: fullTag, replacement: '' });
    }
  }

  let result = html;
  for (const { original, replacement } of replacements) {
    result = result.replace(original, replacement);
  }

  return result;
}

const docLogger = {
  info: (message: string) => logger.log(chalk.blue('ℹ'), message),
  success: (message: string) => logger.log(chalk.green('✔'), message),
  warning: (message: string) => logger.warn(message),
  error: (message: string) => logger.error(message),
  log: (...args: unknown[]) => logger.log(...args),
  debug: (message: string, verbose?: boolean) => {
    if (verbose) logger.log(chalk.gray('🔍'), chalk.gray(message));
  },
  banner: () => {
    logger.log();
    logger.log(chalk.bold.cyan('typeCAD Documentation Generator'));
    logger.log(chalk.gray('Generate beautiful PCB documentation'));
    logger.log();
  },
};

async function validateInputFile(filePath: string): Promise<void> {
  if (!filePath) {
    throw new Error('Input markdown file is required');
  }
  if (!filePath.endsWith('.md')) {
    throw new Error(`Input file must be a markdown file (.md), got: ${path.extname(filePath)}`);
  }
  if (!(await pathExists(filePath))) {
    throw new Error(`Input markdown file does not exist: ${chalk.cyan(filePath)}`);
  }
  const stats = await fs.stat(filePath);
  if (!stats.isFile()) {
    throw new Error(`Input path is not a file: ${chalk.cyan(filePath)}`);
  }
  try {
    await fs.access(filePath, fs.constants.R_OK);
  } catch {
    throw new Error(`Input file is not readable: ${chalk.cyan(filePath)}`);
  }
}

async function validatePcbFile(filePath: string): Promise<void> {
  if (!filePath) {
    throw new Error('PCB file is required');
  }
  if (!filePath.endsWith('.kicad_pcb')) {
    throw new Error(`PCB file must be a KiCad PCB file (.kicad_pcb), got: ${path.extname(filePath)}`);
  }
  if (!(await pathExists(filePath))) {
    throw new Error(`PCB file does not exist: ${chalk.cyan(filePath)}`);
  }
  const stats = await fs.stat(filePath);
  if (!stats.isFile()) {
    throw new Error(`PCB path is not a file: ${chalk.cyan(filePath)}`);
  }
  try {
    await fs.access(filePath, fs.constants.R_OK);
  } catch {
    throw new Error(`PCB file is not readable: ${chalk.cyan(filePath)}`);
  }
}

async function validateOutputDir(outputPath: string): Promise<void> {
  const outputDir = path.dirname(outputPath);
  try {
    await fs.access(outputDir, fs.constants.W_OK);
  } catch {
    try {
      await ensureDir(outputDir);
    } catch (createError) {
      throw new Error(`Cannot create output directory: ${chalk.cyan(outputDir)}. ${createError}`);
    }
  }
}

export async function generateDocumentation(
  inputFile: string,
  pcbFilePath: string,
  outputFile: string,
  options: { verbose?: boolean; quiet?: boolean; openFile?: boolean },
): Promise<void> {
  const verbose = options.verbose || false;
  const quiet = options.quiet || false;
  const shouldOpenFile = options.openFile !== false;

  if (!quiet) {
    docLogger.info(`Processing: ${chalk.cyan(path.basename(inputFile))}`);
    docLogger.debug(`Input file: ${inputFile}`, verbose);
    docLogger.debug(`PCB file: ${pcbFilePath}`, verbose);
    docLogger.debug(`Output file: ${outputFile}`, verbose);
  }

  if (!quiet) docLogger.info('Validating input files...');
  await validateInputFile(inputFile);
  await validatePcbFile(pcbFilePath);
  await validateOutputDir(outputFile);

  if (!quiet) docLogger.info('Initializing KiCad environment...');
  try {
    if (KiCAD.instance) docLogger.debug('KiCad CLI found and initialized', verbose);
  } catch (error) {
    throw new Error(`Failed to initialize KiCad: ${error}`);
  }

  if (!KiCAD.cliPath) {
    throw new Error('KiCad CLI path could not be resolved. Please ensure KiCad is installed.');
  }

  const metadata: IMetadata = { ...defaultMetadata };
  const processedImages = new Map<string, Promise<void>>();
  const stackupSvgMap: Map<string, string> = new Map();
  const svgContentMap: Map<string, string> = new Map();
  const pngBufferMap: Map<string, Buffer> = new Map();

  if (!quiet) docLogger.info('Reading markdown content...');
  const markdownContent = await fs.readFile(inputFile, 'utf-8');
  docLogger.debug(`Read ${markdownContent.length} characters from input file`, verbose);

  if (!quiet) docLogger.info('Parsing document metadata...');
  const frontMatterMatch = markdownContent.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  let contentToRender = markdownContent;
  if (frontMatterMatch) {
    const parsedMetadata = parseMetadata(frontMatterMatch[1]);
    Object.assign(metadata, parsedMetadata);
    contentToRender = markdownContent.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');
    docLogger.debug(`Found metadata: ${Object.keys(parsedMetadata).join(', ')}`, verbose);
  } else {
    docLogger.debug('No frontmatter found, using defaults', verbose);
  }

  if (!quiet) docLogger.info('Initializing markdown processor...');
  let MarkdownIt: any,
    Shiki: any,
    multimd_table_plugin: any,
    markdownItAttrs: any,
    markdownItTextualUml: any,
    markdownItMath: any,
    mathup: any,
    temml: any,
    taskList: any;
  try {
    [
      { default: MarkdownIt },
      { default: Shiki },
      { default: multimd_table_plugin },
      { default: markdownItAttrs },
      { default: markdownItTextualUml },
      { default: markdownItMath },
      { default: mathup },
      { default: temml },
      { default: taskList },
    ] = await Promise.all([
      import('markdown-it'),
      import('@shikijs/markdown-it'),
      import('markdown-it-multimd-table-ext'),
      import('markdown-it-attrs'),
      import('markdown-it-textual-uml'),
      import('markdown-it-math'),
      import('mathup'),
      import('temml'),
      import('@hackmd/markdown-it-task-lists'),
    ]);
  } catch (err: unknown) {
    const missingPkg = err instanceof Error && err.message ? err.message : String(err);
    throw new Error(
      `Documentation generation requires optional dependencies that are not installed.\n` +
        `Install them with: npm install markdown-it @shikijs/markdown-it markdown-it-multimd-table-ext markdown-it-attrs markdown-it-textual-uml markdown-it-math mathup temml @hackmd/markdown-it-task-lists\n` +
        `Original error: ${missingPkg}`,
    );
  }

  const md = new MarkdownIt({ html: true, linkify: true, typographer: true });
  restoreRemovedMarkdownItUtils(md);

  docLogger.debug(`Using syntax highlighting theme: ${metadata.highlight}`, verbose);
  const shikiPromise = Shiki({ themes: { light: metadata.highlight, dark: metadata.highlight } });

  const imageProcessingPromises: Promise<void>[] = [];

  if (!quiet) docLogger.info('Configuring image processing...');
  md.use(customImagePlugin, (layers: string[], imagePath: string, width?: number) => {
    const imageKey = `${layers.join(',')}-${imagePath}-${width || 'default'}`;

    if (processedImages.has(imageKey)) {
      return processedImages.get(imageKey);
    }

    const imageProcessingPromise = (async () => {
      if (layers.length === 1 && layers[0] === 'Stackup') {
        docLogger.debug('Processing stackup layer...', verbose);
        const svgContent = await generateStackupSvgString(pcbFilePath);
        if (svgContent) {
          stackupSvgMap.set(imagePath, svgContent);
        } else {
          docLogger.error('⚠️ No stackup information found in PCB file, skipping stackup image');
        }
        return;
      }

      if (layers.length === 1 && layers[0] === 'Drill') {
        docLogger.debug('Processing drill layer...', verbose);
        const svgContent = await executeKicadDrillExport(pcbFilePath);
        svgContentMap.set(imagePath, svgContent);
        return;
      }

      const filteredLayers = layers.filter((layer) => !layer.includes('Render') && layer !== 'Drill');
      const renderLayers = layers.filter((layer) => layer.includes('Render'));

      if (filteredLayers.length > 0) {
        const uniqueLayers = Array.from(new Set<string>(filteredLayers)).filter(
          (layer) => layer !== 'Render' && layer !== 'Stackup' && layer !== 'Drill',
        );
        if (uniqueLayers.length > 0) {
          docLogger.debug(`Processing PCB layers: [${uniqueLayers.join(', ')}]`, verbose);
          const svgContent = await processKicadSvgLayers(uniqueLayers, pcbFilePath, metadata.kicad_theme);
          svgContentMap.set(imagePath, svgContent);
        }
      }

      if (renderLayers.length > 0) {
        docLogger.debug(`Processing 3D render layers: [${renderLayers.join(', ')}]`, verbose);
        const renderResults = await Promise.all(
          renderLayers.map((layer) => {
            const [, side, x, y, z] = layer.split('/');
            return renderKicad3DView({ side, x, y, z }, pcbFilePath);
          }),
        );
        const combinedBuffer = renderResults[renderResults.length - 1];
        if (combinedBuffer) {
          pngBufferMap.set(imagePath, combinedBuffer);
        }
      }
    })();

    processedImages.set(imageKey, imageProcessingPromise);
    imageProcessingPromises.push(imageProcessingPromise);
    return imageProcessingPromise;
  });

  docLogger.debug('Configuring markdown plugins...', verbose);
  md.use(multimd_table_plugin as any, {
    multiline: true,
    rowspan: true,
    headerless: true,
    multibody: true,
    autolabel: true,
  });
  md.use(markdownItAttrs, { leftDelimiter: '{', rightDelimiter: '}', allowedAttributes: [] });
  md.use(markdownItTextualUml);
  md.use(markdownItMath, {
    inlineDelimiters: ['$', ['\\(', '\\)']],
    inlineRenderer(src: string, token: any) {
      return token.markup === '$' ? mathup(src).toString() : temml.renderToString(src);
    },
    blockDelimiters: ['$$', ['\\[', '\\]']],
    blockRenderer(src: string, token: any) {
      return token.markup === '$$'
        ? mathup(src, { display: 'block' }).toString()
        : temml.renderToString(src, { displayMode: true });
    },
  });
  md.use(taskList);
  md.use(githubAlertsPlugin);
  md.use(namedCodeBlocks);

  if (!quiet) docLogger.info('Rendering markdown to HTML...');
  md.use(await shikiPromise);
  const rawHtmlContent = md.render(contentToRender);
  const wrappedHtmlContent = wrapSectionsInHtml(rawHtmlContent);
  docLogger.debug(`Generated ${wrappedHtmlContent.length} characters of HTML`, verbose);

  const componentPromise = extractComponents(pcbFilePath).catch(() => new Map());
  if (!quiet && imageProcessingPromises.length > 0) {
    const spinner = yoctoSpinner({ text: ' Processing images, please wait...' }).start();
    await Promise.all([Promise.all(imageProcessingPromises), componentPromise]);
    spinner.success(`All ${imageProcessingPromises.length} images processed successfully`);
  } else if (imageProcessingPromises.length > 0) {
    await Promise.all([Promise.all(imageProcessingPromises), componentPromise]);
  }
  const components = await componentPromise;
  docLogger.debug(`Found ${components.size} components`, verbose);

  let finalHtmlContent = wrappedHtmlContent;
  if (stackupSvgMap.size > 0) {
    for (const [imagePath, svgContent] of stackupSvgMap) {
      const escaped = imagePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const imgPattern = new RegExp(
        `<div[^>]*class="[^"]*image-wrapper[^"]*"[^>]*>\\s*<img[^>]*src="${escaped.replace(/\//g, '\\/')}"[^>]*class="[^"]*stackup-container[^"]*"[^>]*>\\s*<\\/div>`,
        'g',
      );
      finalHtmlContent = finalHtmlContent.replace(imgPattern, (match) => {
        const widthMatch = match.match(/data-width="([^"]*)"/);
        let style = 'margin: 0 auto; cursor: pointer;';
        if (widthMatch) {
          const w = widthMatch[1];
          if (w.endsWith('%')) {
            style += ` max-width: ${w}; width: ${w};`;
          } else {
            style += ` max-width: ${w}px; width: 100%;`;
          }
        } else {
          style += ` max-width: 100%; width: 100%;`;
        }
        return `<div class="stackup-inline" style="${style}">${svgContent}</div>`;
      });
    }
  }

  if (!quiet) docLogger.info('Loading CSS styles...');
  let mainCssContent = '';
  try {
    const currentFilePath = url.fileURLToPath(import.meta.url);
    const currentDir = path.dirname(currentFilePath);
    const mainCssPath = path.resolve(currentDir, 'styles', 'main.css');
    mainCssContent = await fs.readFile(mainCssPath, 'utf-8');
    docLogger.debug(`Loaded ${mainCssContent.length} characters of CSS`, verbose);
  } catch (error) {
    docLogger.warning(`Could not load custom styles: ${error}`);
  }

  if (!quiet) docLogger.info('Generating final HTML document...');
  let finalHtml = generateHtmlDocument(metadata, path.basename(pcbFilePath), finalHtmlContent, mainCssContent);

  if (!quiet) docLogger.info('Inlining images...');
  finalHtml = inlineLocalImages(finalHtml, svgContentMap, pngBufferMap, components);

  if (!quiet) docLogger.info(`Writing output file: ${chalk.cyan(path.basename(outputFile))}`);
  await fs.writeFile(outputFile, finalHtml);
  docLogger.debug(`Wrote ${finalHtml.length} characters to output file`, verbose);

  docLogger.debug('Cleaning up temporary files...', verbose);
  await tempManager.cleanupAll();

  if (!quiet) {
    docLogger.success(
      `Documentation generated: ${chalk.cyan(path.basename(inputFile))} → ${chalk.cyan(path.basename(outputFile))}`,
    );
    if (shouldOpenFile) {
      try {
        docLogger.info('Opening documentation in browser...');
        await open(outputFile);
        docLogger.debug(`Opened file: ${outputFile}`, verbose);
      } catch (error) {
        docLogger.warning(`Could not open file automatically: ${error}`);
      }
    }
    docLogger.log();
    docLogger.log(chalk.italic.gray('This program is part of the typeCAD ecosystem'));
    docLogger.log(
      chalk.italic.gray('Visit https://typecad.net for more information about schematic-as-code for KiCAD'),
    );
  } else if (shouldOpenFile) {
    try {
      await open(outputFile);
    } catch {
      logger.debug('Failed to open output file in browser');
    }
  }
}
