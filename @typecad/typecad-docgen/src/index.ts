#!/usr/bin/env node

import * as fs from 'fs/promises';
import * as path from 'path';
import { Command } from 'commander';
import { KiCAD, kicad_cli_path } from '@typecad/typecad';
import MarkdownIt from 'markdown-it';
import Shiki from '@shikijs/markdown-it';
import multimd_table_plugin from 'markdown-it-multimd-table-ext';
import markdownItAttrs from 'markdown-it-attrs';
import markdownItTextualUml from 'markdown-it-textual-uml'
import { IMetadata, defaultMetadata } from './types/metadata.js';
import { parseMetadata } from './utils/metadata.js';
import { wrapSectionsInHtml } from './utils/html.js';
import {
    processKicadSvgLayers,
    renderKicad3DView,
    executeKicadDrillExport,
    svgToPngBuffer,
    writeBufferToFile,
    combineSvgLayers
} from './utils/svg.js';
import { customImagePlugin } from './plugins/customImage.js';
import { renderPCBLayers } from './utils/pcbLayerRenderer.js';
import { tempManager } from './utils/tempFileManager.js';
import { PCBConfig } from './utils/config.js';
import { generateHtmlDocument } from './utils/template.js';
import { pathExists, ensureDir } from './utils/fs.js';
import markdownItMath from "markdown-it-math";
import mathup from "mathup";
import temml from "temml";
import taskList from "@hackmd/markdown-it-task-lists";
import yoctoSpinner from 'yocto-spinner';
import chalk from 'chalk';
import open from 'open';
import MarkdownItGitHubAlerts from 'markdown-it-github-alerts';
import namedCodeBlocks from 'markdown-it-named-code-blocks';
import * as url from 'url';

const logger = {
    info: (message: string) => console.log(chalk.blue('ℹ'), message),
    success: (message: string) => console.log(chalk.green('✔'), message),
    warning: (message: string) => console.log(chalk.yellow('⚠'), message),
    error: (message: string) => console.error(chalk.red('✖'), message),
    debug: (message: string, verbose?: boolean) => {
        if (verbose) console.log(chalk.gray('🔍'), chalk.gray(message));
    },
    banner: () => {
        console.log();
        console.log(chalk.bold.cyan('typeCAD Documentation Generator'));
        console.log(chalk.gray('Generate beautiful PCB documentation'));
        console.log();
    }
};

async function validateInputFile(filePath: string): Promise<void> {
    if (!filePath) {
        throw new Error('Input markdown file is required');
    }
    if (!filePath.endsWith('.md')) {
        throw new Error(`Input file must be a markdown file (.md), got: ${path.extname(filePath)}`);
    }
    if (!await pathExists(filePath)) {
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
    if (!await pathExists(filePath)) {
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

async function getVersion(): Promise<string> {
    try {
        const currentFilePath = url.fileURLToPath(import.meta.url);
        const currentDir = path.dirname(currentFilePath);
        const pkgPath = path.resolve(currentDir, '..', 'package.json');
        const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
        return pkg.version || '0.0.0';
    } catch {
        return '0.0.0';
    }
}

export async function generateDocumentation(
    inputFile: string,
    pcbFilePath: string,
    outputFile: string,
    options: { verbose?: boolean; quiet?: boolean; openFile?: boolean }
): Promise<void> {
    const verbose = options.verbose || false;
    const quiet = options.quiet || false;
    const shouldOpenFile = options.openFile !== false;

    if (!quiet) {
        logger.info(`Processing: ${chalk.cyan(path.basename(inputFile))}`);
        logger.debug(`Input file: ${inputFile}`, verbose);
        logger.debug(`PCB file: ${pcbFilePath}`, verbose);
        logger.debug(`Output file: ${outputFile}`, verbose);
    }

    if (!quiet) logger.info('Validating input files...');
    await validateInputFile(inputFile);
    await validatePcbFile(pcbFilePath);
    await validateOutputDir(outputFile);

    if (!quiet) logger.info('Initializing KiCad environment...');
    try {
        new KiCAD();
        logger.debug('KiCad CLI found and initialized', verbose);
    } catch (error) {
        throw new Error(`Failed to initialize KiCad: ${error}`);
    }

    const cliPath = kicad_cli_path;
    if (!cliPath) {
        throw new Error('KiCad CLI path could not be resolved. Please ensure KiCad is installed.');
    }

    const inputDir = path.dirname(inputFile);
    const metadata: IMetadata = { ...defaultMetadata };
    const processedImages = new Map<string, Promise<void>>();
    const stackupReplacements: Map<string, string> = new Map();

    if (!quiet) logger.info('Reading markdown content...');
    const markdownContent = await fs.readFile(inputFile, 'utf-8');
    logger.debug(`Read ${markdownContent.length} characters from input file`, verbose);

    if (!quiet) logger.info('Parsing document metadata...');
    const frontMatterMatch = markdownContent.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
    let contentToRender = markdownContent;
    if (frontMatterMatch) {
        const parsedMetadata = parseMetadata(frontMatterMatch[1]);
        Object.assign(metadata, parsedMetadata);
        contentToRender = markdownContent.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');
        logger.debug(`Found metadata: ${Object.keys(parsedMetadata).join(', ')}`, verbose);
    } else {
        logger.debug('No frontmatter found, using defaults', verbose);
    }

    if (!quiet) logger.info('Initializing markdown processor...');
    const md = new MarkdownIt({ html: true, linkify: true, typographer: true });

    logger.debug(`Using syntax highlighting theme: ${metadata.highlight}`, verbose);
    md.use(await Shiki({ themes: { light: metadata.highlight, dark: metadata.highlight } }));

    const imageProcessingPromises: Promise<void>[] = [];

    if (!quiet) logger.info('Configuring image processing...');
    md.use(customImagePlugin, (layers: string[], imagePath: string, width?: number) => {
        const absoluteImagePath = path.resolve(inputDir, imagePath);
        const imageKey = `${layers.join(',')}-${absoluteImagePath}-${width || 'default'}`;

        if (processedImages.has(imageKey)) {
            return processedImages.get(imageKey);
        }

        const imageProcessingPromise = (async () => {
            const imageDir = path.dirname(absoluteImagePath);
            if (!await pathExists(imageDir)) {
                await ensureDir(imageDir);
            }

            if (layers.length === 1 && layers[0] === 'Stackup') {
                logger.debug('Processing stackup layer...', verbose);
                const lightModePath = absoluteImagePath.replace(/\.(png)$/i, '_light.png');
                const darkModePath = absoluteImagePath.replace(/\.(png)$/i, '_dark.png');

                await Promise.all([
                    renderPCBLayers(pcbFilePath, lightModePath, false),
                    renderPCBLayers(pcbFilePath, darkModePath, true)
                ]);

                const finalImagePath = metadata.dark_mode ? darkModePath : lightModePath;
                const finalImagePathRelative = path.relative(inputDir, finalImagePath);
                const lightImagePathRelative = path.relative(inputDir, lightModePath);
                const darkImagePathRelative = path.relative(inputDir, darkModePath);

                const widthStr = width ? ` =${width}` : '';
                const replacement = `![{Stackup}](${finalImagePathRelative}${widthStr} data-light-src="${lightImagePathRelative}" data-dark-src="${darkImagePathRelative}")`;
                stackupReplacements.set(imagePath, replacement);
                return;
            }

            if (layers.length === 1 && layers[0] === 'Drill') {
                logger.debug('Processing drill layer...', verbose);
                const svgContent = await executeKicadDrillExport(
                    cliPath, pcbFilePath, metadata.kicad_theme
                );
                const processedSvg = combineSvgLayers([svgContent]);
                const pngBuffer = await svgToPngBuffer(processedSvg, {
                    width: PCBConfig.dimensions.defaultWidth,
                    trim: true,
                    background: { r: 255, g: 255, b: 255, alpha: 1 }
                });
                await writeBufferToFile(pngBuffer, absoluteImagePath);
                return;
            }

            const filteredLayers = layers.filter(layer => !layer.includes('Render') && layer !== 'Drill');
            const renderLayers = layers.filter(layer => layer.includes('Render'));

            if (filteredLayers.length > 0) {
                const uniqueLayers = Array.from(new Set<string>(filteredLayers))
                    .filter(layer => layer !== 'Render' && layer !== 'Stackup' && layer !== 'Drill');
                if (uniqueLayers.length > 0) {
                    logger.debug(`Processing PCB layers: [${uniqueLayers.join(', ')}]`, verbose);
                    await processKicadSvgLayers(
                        uniqueLayers, pcbFilePath, absoluteImagePath,
                        cliPath, metadata.kicad_theme
                    );
                }
            }

            if (renderLayers.length > 0) {
                logger.debug(`Processing 3D render layers: [${renderLayers.join(', ')}]`, verbose);
                const renderPromises = renderLayers.map(layer => {
                    const [, side, x, y, z] = layer.split('/');
                    return renderKicad3DView({ side, x, y, z }, pcbFilePath, absoluteImagePath, cliPath);
                });
                await Promise.all(renderPromises);
            }
        })();

        processedImages.set(imageKey, imageProcessingPromise);
        imageProcessingPromises.push(imageProcessingPromise);
        return imageProcessingPromise;
    });

    logger.debug('Configuring markdown plugins...', verbose);
    md.use(multimd_table_plugin, { multiline: true, rowspan: true, headerless: true, multibody: true, autolabel: true });
    md.use(markdownItAttrs, { leftDelimiter: '{', rightDelimiter: '}', allowedAttributes: [] });
    md.use(markdownItTextualUml);
    md.use(markdownItMath, {
        inlineDelimiters: ["$", ["\\(", "\\)"]],
        inlineRenderer(src, token) {
            return token.markup === "$" ? mathup(src).toString() : temml.renderToString(src);
        },
        blockDelimiters: ["$$", ["\\[", "\\]"]],
        blockRenderer(src, token) {
            return token.markup === "$$" ? mathup(src, { display: "block" }).toString() : temml.renderToString(src, { displayMode: true });
        },
    });
    md.use(taskList);
    md.use(MarkdownItGitHubAlerts);
    md.use(namedCodeBlocks);

    if (!quiet) logger.info('Rendering markdown to HTML...');
    const rawHtmlContent = md.render(contentToRender);
    const wrappedHtmlContent = wrapSectionsInHtml(rawHtmlContent);
    logger.debug(`Generated ${wrappedHtmlContent.length} characters of HTML`, verbose);

    if (!quiet && imageProcessingPromises.length > 0) {
        const spinner = yoctoSpinner({text: ' Processing images, please wait...'}).start();
        await Promise.all(imageProcessingPromises);
        spinner.success(`All ${imageProcessingPromises.length} images processed successfully`);
    } else if (imageProcessingPromises.length > 0) {
        await Promise.all(imageProcessingPromises);
    }

    let finalHtmlContent = wrappedHtmlContent;
    if (stackupReplacements.size > 0) {
        for (const [original, replacement] of stackupReplacements) {
            const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            finalHtmlContent = finalHtmlContent.replace(
                new RegExp(`!\\[\\{Stackup\\}\\]\\(${escaped}(?:\\s*=\\s*\\d+)?\\)`, 'g'),
                replacement
            );
        }
    }

    if (!quiet) logger.info('Loading CSS styles...');
    let mainCssContent = '';
    try {
        const currentFilePath = url.fileURLToPath(import.meta.url);
        const currentDir = path.dirname(currentFilePath);
        const mainCssPath = path.resolve(currentDir, 'styles', 'main.css');
        mainCssContent = await fs.readFile(mainCssPath, 'utf-8');
        logger.debug(`Loaded ${mainCssContent.length} characters of CSS`, verbose);
    } catch (error) {
        logger.warning(`Could not load custom styles: ${error}`);
    }

    if (!quiet) logger.info('Generating final HTML document...');
    const finalHtml = generateHtmlDocument(metadata, path.basename(pcbFilePath), finalHtmlContent, mainCssContent);

    if (!quiet) logger.info(`Writing output file: ${chalk.cyan(path.basename(outputFile))}`);
    await fs.writeFile(outputFile, finalHtml);
    logger.debug(`Wrote ${finalHtml.length} characters to output file`, verbose);

    logger.debug('Cleaning up temporary files...', verbose);
    await tempManager.cleanupAll();

    if (!quiet) {
        logger.success(`Documentation generated: ${chalk.cyan(path.basename(inputFile))} → ${chalk.cyan(path.basename(outputFile))}`);
        if (shouldOpenFile) {
            try {
                logger.info('Opening documentation in browser...');
                await open(outputFile);
                logger.debug(`Opened file: ${outputFile}`, verbose);
            } catch (error) {
                logger.warning(`Could not open file automatically: ${error}`);
            }
        }
        console.log();
        console.log(chalk.italic.gray('This program is part of the typeCAD ecosystem'));
        console.log(chalk.italic.gray('Visit https://typecad.net for more information about schematic-as-code for KiCAD'));
    } else if (shouldOpenFile) {
        try { await open(outputFile); } catch {}
    }
}

const program = new Command();

program
    .name('typecad-docgen')
    .description('Generate beautiful PCB documentation from Markdown and KiCad files')
    .version(await getVersion())
    .configureHelp({ helpWidth: 100, sortSubcommands: true });

program
    .arguments('<markdown_file> <pcb_file>')
    .option('-o, --output <file>', 'Output HTML file (default: input file with .html extension)')
    .option('-v, --verbose', 'Enable verbose logging', false)
    .option('-q, --quiet', 'Suppress non-error output', false)
    .option('--no-open', 'Do not automatically open the generated HTML file in browser')
    .description('Generate beautiful PCB documentation\n\nArguments:\n  markdown_file  Input Markdown file (.md)\n  pcb_file       KiCad PCB file (.kicad_pcb)')
    .action(async (markdownFile: string, pcbFile: string, options: { output?: string; verbose?: boolean; quiet?: boolean; open?: boolean }) => {
        const { output, verbose, quiet, open: openFile } = options;

        if (!quiet) logger.banner();

        try {
            const inputFile = path.resolve(markdownFile);
            const outputFile = output ? path.resolve(output) : inputFile.replace(/\.md$/, '.html');
            const resolvedPcbFile = path.resolve(pcbFile);
            await generateDocumentation(inputFile, resolvedPcbFile, outputFile, { verbose, quiet, openFile });
        } catch (error) {
            logger.error(`${error}`);
            try { await tempManager.cleanupAll(); } catch (cleanupError) {
                logger.error(`Failed to clean up temporary files: ${cleanupError}`);
            }
            process.exit(1);
        }
    });

program.addHelpText('after', `
${chalk.bold('Examples:')}
  ${chalk.gray('# Basic usage')}
  ${chalk.cyan('typecad-docgen')} documentation.md board.kicad_pcb

  ${chalk.gray('# Specify custom output file')}
  ${chalk.cyan('typecad-docgen')} docs.md pcb.kicad_pcb ${chalk.yellow('-o')} custom-output.html

  ${chalk.gray('# Enable verbose logging')}
  ${chalk.cyan('typecad-docgen')} readme.md project.kicad_pcb ${chalk.yellow('--verbose')}

  ${chalk.gray('# Quiet mode (suppress output)')}
  ${chalk.cyan('typecad-docgen')} guide.md design.kicad_pcb ${chalk.yellow('--quiet')}

  ${chalk.gray('# Do not automatically open the generated file')}
  ${chalk.cyan('typecad-docgen')} docs.md board.kicad_pcb ${chalk.yellow('--no-open')}

${chalk.bold('Supported Markdown Features:')}
  • Custom PCB layer images: ${chalk.yellow('![{F.Cu,F.Mask}](output.png)')}
  • 3D renders: ${chalk.yellow('![{Render/top/0/0/0}](render.png)')}
  • Drill files: ${chalk.yellow('![{Drill}](drill.png)')}
  • PCB stackups: ${chalk.yellow('![{Stackup}](stackup.png)')}
  • GitHub-style alerts, task lists, and math equations

${chalk.bold('Requirements:')}
  • KiCad 7.0+ must be installed and available in PATH
  • Input file must be a valid Markdown file (.md)
  • PCB file must be a valid KiCad PCB file (.kicad_pcb)

${chalk.bold('More Information:')}
  Visit ${chalk.blue.underline('https://typecad.net')} for documentation and examples
`);

process.on('uncaughtException', (error) => {
    logger.error(`Uncaught exception: ${error}`);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error(`Unhandled rejection at ${promise}: ${reason}`);
    process.exit(1);
});

program.parse();
