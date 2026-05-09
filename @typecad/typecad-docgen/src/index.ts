#!/usr/bin/env tsx

import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
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
import {
    renderPCBLayers
} from './utils/pcbLayerRenderer.js';
import { tempManager } from './utils/tempFileManager.js';
import * as url from 'url';
import markdownItMath from "markdown-it-math";
import mathup from "mathup";
import temml from "temml";
import taskList from "@hackmd/markdown-it-task-lists";
import yoctoSpinner from 'yocto-spinner';
import chalk from 'chalk';
// @ts-ignore open package doesn't have proper TypeScript declarations
import open from 'open';

// @ts-ignore MarkdownItGitHubAlerts isn't exported as TypeScript wants?
import MarkdownItGitHubAlerts from 'markdown-it-github-alerts' 
import namedCodeBlocks from 'markdown-it-named-code-blocks';

// Convert fs methods to promise-based for better async handling
const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);
const mkdirAsync = promisify(fs.mkdir);
const existsAsync = promisify(fs.exists);

// Global metadata variable
let metadata: IMetadata = { ...defaultMetadata };

// CLI utility functions
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

// File validation functions
async function validateInputFile(filePath: string): Promise<void> {
    if (!filePath) {
        throw new Error('Input markdown file is required');
    }
    
    if (!filePath.endsWith('.md')) {
        throw new Error(`Input file must be a markdown file (.md), got: ${path.extname(filePath)}`);
    }
    
    const exists = await existsAsync(filePath);
    if (!exists) {
        throw new Error(`Input markdown file does not exist: ${chalk.cyan(filePath)}`);
    }
    
    const stats = await fs.promises.stat(filePath);
    if (!stats.isFile()) {
        throw new Error(`Input path is not a file: ${chalk.cyan(filePath)}`);
    }
    
    // Check if file is readable
    try {
        await fs.promises.access(filePath, fs.constants.R_OK);
    } catch (error) {
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
    
    const exists = await existsAsync(filePath);
    if (!exists) {
        throw new Error(`PCB file does not exist: ${chalk.cyan(filePath)}`);
    }
    
    const stats = await fs.promises.stat(filePath);
    if (!stats.isFile()) {
        throw new Error(`PCB path is not a file: ${chalk.cyan(filePath)}`);
    }
    
    // Check if file is readable
    try {
        await fs.promises.access(filePath, fs.constants.R_OK);
    } catch (error) {
        throw new Error(`PCB file is not readable: ${chalk.cyan(filePath)}`);
    }
}

async function validateOutputDir(outputPath: string): Promise<void> {
    const outputDir = path.dirname(outputPath);
    
    try {
        await fs.promises.access(outputDir, fs.constants.W_OK);
    } catch (error) {
        // Directory doesn't exist or isn't writable, try to create it
        try {
            await mkdirAsync(outputDir, { recursive: true });
        } catch (createError) {
            throw new Error(`Cannot create output directory: ${chalk.cyan(outputDir)}. ${createError}`);
        }
    }
}

// Main documentation generation function
async function generateDocumentation(
    inputFile: string, 
    pcbFilePath: string, 
    outputFile: string, 
    options: { verbose?: boolean; quiet?: boolean; openFile?: boolean }
): Promise<void> {
    const verbose = options.verbose || false;
    const quiet = options.quiet || false;
    const shouldOpenFile = options.openFile !== false; // Default to true unless explicitly set to false
    
    if (!quiet) {
        logger.info(`Processing: ${chalk.cyan(path.basename(inputFile))}`);
        logger.debug(`Input file: ${inputFile}`, verbose);
        logger.debug(`PCB file: ${pcbFilePath}`, verbose);
        logger.debug(`Output file: ${outputFile}`, verbose);
    }
    
    // Validation phase
    if (!quiet) logger.info('Validating input files...');
    await validateInputFile(inputFile);
    await validatePcbFile(pcbFilePath);
    await validateOutputDir(outputFile);
    
    // Initialize KiCad
    if (!quiet) logger.info('Initializing KiCad environment...');
    try {
        new KiCAD();
        logger.debug('KiCad CLI found and initialized', verbose);
    } catch (error) {
        throw new Error(`Failed to initialize KiCad: ${error}`);
    }
    
    const inputDir = path.dirname(inputFile);
    
    // Create an image cache to avoid processing the same image twice
    const processedImages = new Map<string, Promise<void>>();

    // Read markdown content
    if (!quiet) logger.info('Reading markdown content...');
    const markdownContent = await readFileAsync(inputFile, 'utf-8');
    logger.debug(`Read ${markdownContent.length} characters from input file`, verbose);

    // Parse frontmatter
    if (!quiet) logger.info('Parsing document metadata...');
    const frontMatterMatch = markdownContent.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
    let contentToRender = markdownContent;
    if (frontMatterMatch) {
        const frontMatter = frontMatterMatch[1];
        const parsedMetadata = parseMetadata(frontMatter);
        metadata = { ...metadata, ...parsedMetadata };
        // Remove frontmatter from content
        contentToRender = markdownContent.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');
        logger.debug(`Found metadata: ${Object.keys(parsedMetadata).join(', ')}`, verbose);
    } else {
        logger.debug('No frontmatter found, using defaults', verbose);
    }

    // Initialize markdown-it
    if (!quiet) logger.info('Initializing markdown processor...');
    const md = new MarkdownIt({
        html: true,
        linkify: true,
        typographer: true
    });

    // Configure Shiki for syntax highlighting
    logger.debug(`Using syntax highlighting theme: ${metadata.highlight}`, verbose);
    md.use(await Shiki({
        themes: {
            light: metadata.highlight,
            dark: metadata.highlight,
        }
    }));

    // Store image processing promises
    const imageProcessingPromises: Promise<void>[] = [];

    // Process custom images in Markdown with reduced file I/O and fully async
    if (!quiet) logger.info('Configuring image processing...');
    md.use(customImagePlugin, (layers: string[], imagePath: string, width?: number) => {
        const absoluteImagePath = path.resolve(inputDir, imagePath);

        // Check if we've already started processing this exact image with these layers
        const imageKey = `${layers.join(',')}-${absoluteImagePath}-${width || 'default'}`;

        if (processedImages.has(imageKey)) {
            // Return the existing promise - avoid duplicate processing
            return processedImages.get(imageKey);
        }

        // Create a promise for this image processing task
        const imageProcessingPromise = (async () => {
            try {
                logger.debug(`Processing image: ${imagePath} with layers [${layers.join(', ')}]`, verbose);
                
                // Ensure the output directory for the image exists
                const imageDir = path.dirname(absoluteImagePath);
                const imageDirExists = await existsAsync(imageDir);
                if (!imageDirExists) {
                    await mkdirAsync(imageDir, { recursive: true });
                }

                // Handle Stackup case - completely in-memory until final output
                if (layers.length === 1 && layers[0] === 'Stackup') {
                    logger.debug('Processing stackup layer...', verbose);
                    
                    try {
                        // Generate both light and dark mode versions
                        const lightModePath = absoluteImagePath.replace(/\.(png)$/i, '_light.png');
                        const darkModePath = absoluteImagePath.replace(/\.(png)$/i, '_dark.png');
                        
                        // Generate both versions in parallel
                        await Promise.all([
                            renderPCBLayers(pcbFilePath, lightModePath, false),
                            renderPCBLayers(pcbFilePath, darkModePath, true)
                        ]);
                        
                        // Update the image path to use the appropriate version based on dark mode setting
                        const isDarkMode = metadata.dark_mode;
                        const finalImagePath = isDarkMode ? darkModePath : lightModePath;
                        
                        // Store the relative paths for later use
                        const finalImagePathRelative = path.relative(inputDir, finalImagePath);
                        const lightImagePathRelative = path.relative(inputDir, lightModePath);
                        const darkImagePathRelative = path.relative(inputDir, darkModePath);
                        
                        // Create the markdown image with data attributes
                        const widthStr = width ? ` =${width}` : '';
                        const markdownImage = `![{Stackup}](${finalImagePathRelative}${widthStr} data-light-src="${lightImagePathRelative}" data-dark-src="${darkImagePathRelative}")`;
                        
                        // Update the image path in the markdown content
                        contentToRender = contentToRender.replace(
                            new RegExp(`!\\[\\{Stackup\\}\\]\\(${imagePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s*=\\s*\\d+)?\\)`, 'g'),
                            markdownImage
                        );
                        
                        return;
                    } catch (stackupError) {
                        throw new Error(`Failed to render stackup image ${imagePath}: ${stackupError}. The stackup must be configured within KiCAD in order to be rendered.`);
                    }
                }

                // Handle Drill case
                if (layers.length === 1 && layers[0] === 'Drill') {
                    logger.debug('Processing drill layer...', verbose);
                    
                    const svgContent = await executeKicadDrillExport(
                        kicad_cli_path as string,
                        pcbFilePath,
                        metadata.kicad_theme
                    );
                    
                    // Process SVG through the same pipeline as regular layers
                    const processedSvg = combineSvgLayers([svgContent]);
                    
                    // Convert SVG to PNG using sharp with fixed width of 5000
                    const pngBuffer = await svgToPngBuffer(processedSvg, {
                        width: 5000, // Always use 5000 width for drill images
                        trim: true,
                        background: { r: 255, g: 255, b: 255, alpha: 1 }
                    });
                    
                    await writeBufferToFile(pngBuffer, absoluteImagePath);
                    return;
                }

                // Separate standard layers and render layers
                const filteredLayers = layers.filter(layer => !layer.includes('Render') && layer !== 'Drill');
                const renderLayers = layers.filter(layer => layer.includes('Render'));

                // Process standard PCB layers
                if (filteredLayers.length > 0) {
                    const uniqueLayers = Array.from(new Set<string>(filteredLayers))
                        .filter(layer => layer !== 'Render' && layer !== 'Stackup' && layer !== 'Drill');

                    if (uniqueLayers.length > 0) {
                        logger.debug(`Processing PCB layers: [${uniqueLayers.join(', ')}]`, verbose);
                        
                        // Process KiCad SVG layers directly to PNG, all in memory where possible
                        await processKicadSvgLayers(
                            uniqueLayers,
                            pcbFilePath,
                            absoluteImagePath,
                            kicad_cli_path as string,
                            metadata.kicad_theme
                        );
                    }
                }

                // Process 3D render layers in parallel when possible
                if (renderLayers.length > 0) {
                    logger.debug(`Processing 3D render layers: [${renderLayers.join(', ')}]`, verbose);
                    
                    // Create an array to hold render processing promises
                    const renderPromises: Promise<string>[] = [];

                    for (const layer of renderLayers) {
                        const [render, side, x, y, z] = layer.split('/');

                        // Render the 3D view with minimal disk I/O
                        renderPromises.push(renderKicad3DView(
                            { side, x, y, z },
                            pcbFilePath,
                            absoluteImagePath,
                            kicad_cli_path as string
                        ));
                    }

                    // Wait for all render operations to complete
                    await Promise.all(renderPromises);
                }
            } catch (error) {
                logger.error(`Failed to process image ${imagePath}: ${error}`);
                throw error;
            }
        })();

        // Store in cache and promises array
        processedImages.set(imageKey, imageProcessingPromise);
        imageProcessingPromises.push(imageProcessingPromise);

        return imageProcessingPromise;
    });

    // Configure additional markdown plugins
    logger.debug('Configuring markdown plugins...', verbose);
    md.use(multimd_table_plugin, {
        multiline: true,
        rowspan: true,
        headerless: true,
        multibody: true,
        autolabel: true,
    });

    md.use(markdownItAttrs, {
        leftDelimiter: '{',
        rightDelimiter: '}',
        allowedAttributes: []
    });

    md.use(markdownItTextualUml);

    md.use(markdownItMath, {
        inlineDelimiters: ["$", ["\\(", "\\)"]],
        inlineRenderer(src, token) {
            if (token.markup === "$") {
                return mathup(src).toString();
            }

            return temml.renderToString(src);
        },

        blockDelimiters: ["$$", ["\\[", "\\]"]],
        blockRenderer(src, token) {
            if (token.markup === "$$") {
                return mathup(src, { display: "block" }).toString();
            }

            return temml.renderToString(src, { displayMode: true });
        },
    });

    md.use(taskList);
    md.use(MarkdownItGitHubAlerts)
    md.use(namedCodeBlocks);

    // Render markdown to HTML
    if (!quiet) logger.info('Rendering markdown to HTML...');
    const rawHtmlContent = md.render(contentToRender);
    const wrappedHtmlContent = wrapSectionsInHtml(rawHtmlContent);
    logger.debug(`Generated ${wrappedHtmlContent.length} characters of HTML`, verbose);

    // Load CSS styles
    if (!quiet) logger.info('Loading CSS styles...');
    let mainCssContent = '';
    try {
        // Determine the directory of the current module
        const currentFilePath = url.fileURLToPath(import.meta.url);
        const currentDir = path.dirname(currentFilePath);

        // Resolve the path to main.css relative to the current script
        const mainCssPath = path.resolve(currentDir, 'styles', 'main.css');

        // Read the file content
        mainCssContent = await readFileAsync(mainCssPath, 'utf-8');
        logger.debug(`Loaded ${mainCssContent.length} characters of CSS`, verbose);
    } catch (error) {
        logger.warning(`Could not load custom styles: ${error}`);
    }

    // Generate final HTML
    if (!quiet) logger.info('Generating final HTML document...');
    const finalHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${metadata.title} - typeCAD Documentation Generator</title>
    <!-- Add Google Fonts -->
    <link rel="icon" href="https://typecad.net/favicon.ico">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">

    <style>
${mainCssContent}
    </style>
    <link rel="stylesheet" href="${metadata.stylesheet}">
</head>
<body ${metadata.dark_mode ? 'class="dark-mode"' : 'class="light-mode"'}>
    <!-- Mobile warning message -->
    <div class="mobile-warning">
        This documentation is optimized for desktop viewing. Some features may not work correctly on mobile devices.
    </div>
    
    <!-- Dark mode toggle button with icon -->
    <button id="dark-mode-toggle" aria-label="Toggle dark mode">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="sun-moon">
            <circle cx="12" cy="12" r="5"/>
            <line x1="12" y1="1" x2="12" y2="3"/>
            <line x1="12" y1="21" x2="12" y2="23"/>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
            <line x1="1" y1="12" x2="3" y2="12"/>
            <line x1="21" y1="12" x2="23" y2="12"/>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
    </button>

    <!-- Title block -->
    <div id="title-block" class="title-block">
        <table>
            <tbody>
                <tr>
                    <td class="label">Company</td>
                    <td class="value">${metadata.company}</td>
                    <td class="label">Board Name</td>
                    <td class="value">${metadata.board_name}</td>
                    <td class="label">Variant</td>
                    <td class="value">${metadata.variant}</td>
                    <td class="label">Sheet</td>
                    <td class="value" id="page-count">1 of 1</td>
                </tr>
                <tr>
                    <td class="label">Filename</td>
                    <td class="value">${pcbFilePath}</td>
                    <td class="label">Revision</td>
                    <td class="value">${metadata.revision}</td>
                    <td class="label">Date</td>
                    <td class="value">${metadata.date}</td>
                </tr>
            </tbody>
        </table>
    </div>

    <!-- Scrollable content -->
    <div class="container">
        ${wrappedHtmlContent}
    </div>

    <!-- Modal for image zoom -->
    <div class="modal">
        <div class="modal-content-container">
            <img class="modal-content">
        </div>
    </div>

    <script>
        document.addEventListener("DOMContentLoaded", () => {
            // Initialize dark mode based on default setting
            const darkModeDefault = ${metadata.dark_mode};
            if (darkModeDefault) {
                document.body.classList.add('dark-mode');
            } else {
                document.body.classList.add('light-mode');
            }

            // Get all sections and update total pages
            const sections = document.querySelectorAll('section');
            const totalPages = sections.length;

            // Function to get URL parameters
            function getUrlParameter(name) {
                const urlParams = new URLSearchParams(window.location.search);
                return urlParams.get(name) || '';
            }

            // Function to scroll to a specific section
            function scrollToSection(sectionIndex) {
                const sections = document.querySelectorAll('section');
                if (sectionIndex >= 0 && sectionIndex < sections.length) {
                    const section = sections[sectionIndex];
                    section.scrollIntoView({ behavior: 'smooth' });
                    updatePageCount();
                }
            }

            // Function to update page count based on scroll position
            function updatePageCount() {
                const container = document.querySelector('.container');
                const containerRect = container.getBoundingClientRect();
                const sections = document.querySelectorAll('section');
                
                // Find the section that's most visible in the viewport
                let currentSection = 1;
                let maxVisibleHeight = 0;
                
                sections.forEach((section, index) => {
                    const sectionRect = section.getBoundingClientRect();
                    const visibleHeight = Math.min(sectionRect.bottom, containerRect.bottom) - 
                                        Math.max(sectionRect.top, containerRect.top);
                    
                    if (visibleHeight > maxVisibleHeight) {
                        maxVisibleHeight = visibleHeight;
                        currentSection = index + 1;
                    }
                });
                
                document.getElementById('page-count').textContent = currentSection + ' of ' + totalPages;
                
                // Update URL without triggering page reload
                const newUrl = new URL(window.location.href);
                newUrl.searchParams.set('page', currentSection);
                window.history.replaceState({}, '', newUrl);
            }

            // Check for page parameter in URL on load
            const pageParam = getUrlParameter('page');
            if (pageParam) {
                const pageNum = parseInt(pageParam, 10);
                if (!isNaN(pageNum) && pageNum > 0) {
                    // Subtract 1 because section indices are 0-based
                    scrollToSection(pageNum - 1);
                }
            }

            // Update page count on scroll
            const container = document.querySelector('.container');
            container.addEventListener('scroll', updatePageCount);
            
            // Initial update
            updatePageCount();

            // Modal functionality
            const modal = document.querySelector('.modal');
            const modalImg = document.querySelector('.modal-content');

            // Function to open the modal with scaled image
            function openModal(imageSrc, width, height, isLayerBasedImage, isDrillLayer) {
                modal.style.display = 'block';
                document.body.classList.add('modal-open');
                modalImg.src = imageSrc;
                
                // Reset any previous styles
                modalImg.style.width = '';
                modalImg.style.height = '';
                modalImg.style.maxWidth = '';
                modalImg.style.maxHeight = '';
                modalImg.style.margin = '';
                modalImg.style.padding = '';
                modalImg.style.backgroundColor = '';
                
                // Set dimensions to fill available space
                modalImg.style.maxWidth = '100%';
                modalImg.style.maxHeight = '100%';
                modalImg.style.width = 'auto';
                modalImg.style.height = 'auto';
                modalImg.style.objectFit = 'contain';

                // Add drill-layer class if it's a drill image
                modalImg.classList.toggle('drill-layer', isDrillLayer);
            }

            // Function to close the modal
            function closeModal() {
                modal.style.display = 'none';
                document.body.classList.remove('modal-open');
                // Remove drill-layer class when closing
                modalImg.classList.remove('drill-layer');
            }

            // Add click event listeners to all images
            document.querySelectorAll('img').forEach(img => {
                img.addEventListener('click', () => {
                    const widthAttr = img.getAttribute('width');
                    const heightAttr = img.getAttribute('height');
                    const isLayerBasedImage = img.alt.startsWith('{') && !img.alt.includes('Render');
                    const isDrillLayer = img.alt === '{Drill}';
                    const width = widthAttr ? parseInt(widthAttr, 10) : null;
                    const height = heightAttr ? parseInt(heightAttr, 10) : null;
                    openModal(img.src, width, height, isLayerBasedImage, isDrillLayer);
                });
            });

            // Close the modal when clicking outside the image or on the image itself
            modal.addEventListener('click', (event) => {
                if (event.target === modal || event.target === modalImg) {
                    closeModal();
                }
            });

            // Close the modal when pressing the Escape key
            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    closeModal();
                }
            });

            // Dark mode toggle functionality
            const toggleButton = document.getElementById('dark-mode-toggle');
            const isDarkMode = ${metadata.dark_mode ? 'true' : 'false'};
            
            
            // Set initial state
            if (isDarkMode) {
                document.body.classList.add('dark-mode');
            } else {
                document.body.classList.add('light-mode');
            }
            
            // Debug: Check for stackup images on page load
            const initialStackupImages = document.querySelectorAll('img[alt="{Stackup}"]');
            initialStackupImages.forEach((img, i) => {
                
                // Directly set the data attributes if they're missing
                if (img.getAttribute('alt') === '{Stackup}' && !img.getAttribute('data-light-src')) {
                    const src = img.getAttribute('src');
                    if (src) {
                        // Check if the src already has _light or _dark suffix
                        if (src.includes('_light.png')) {
                            const darkSrc = src.replace('_light.png', '_dark.png');
                            img.setAttribute('data-light-src', src);
                            img.setAttribute('data-dark-src', darkSrc);
                        } else if (src.includes('_dark.png')) {
                            const lightSrc = src.replace('_dark.png', '_light.png');
                            img.setAttribute('data-light-src', lightSrc);
                            img.setAttribute('data-dark-src', src);
                        } else {
                            // If no suffix, add both
                            const lightSrc = src.replace(/\.png$/, '_light.png');
                            const darkSrc = src.replace(/\.png$/, '_dark.png');
                            img.setAttribute('data-light-src', lightSrc);
                            img.setAttribute('data-dark-src', darkSrc);
                        }
                    }
                }
                
                // Set the correct image source based on initial dark mode state
                const lightSrc = img.getAttribute('data-light-src');
                const darkSrc = img.getAttribute('data-dark-src');
                
                if (lightSrc && darkSrc) {
                    if (isDarkMode) {
                        // Set to dark mode image
                        img.setAttribute('src', darkSrc);
                    } else {
                        // Set to light mode image
                        img.setAttribute('src', lightSrc);
                    }
                }
            });
            
            toggleButton.addEventListener('click', () => {
                // Check if dark mode is currently active
                const isDarkMode = document.body.classList.contains('dark-mode');
                
                // Remove both classes first to ensure clean state
                document.body.classList.remove('dark-mode', 'light-mode');
                
                // Add the appropriate class based on current state
                if (isDarkMode) {
                    document.body.classList.add('light-mode');
                } else {
                    document.body.classList.add('dark-mode');
                }
                
                // Switch stackup images based on theme
                const stackupImages = document.querySelectorAll('img[alt="{Stackup}"]');
                
                stackupImages.forEach((img, i) => {
                    const lightSrc = img.getAttribute('data-light-src');
                    const darkSrc = img.getAttribute('data-dark-src');
                    const currentSrc = img.getAttribute('src');

                    // If data attributes are available, use them
                    if (lightSrc && darkSrc) {
                        if (isDarkMode) {
                            // Switching to light mode
                            img.setAttribute('src', lightSrc);
                        } else {
                            // Switching to dark mode
                            img.setAttribute('src', darkSrc);
                        }
                    } 
                    // Fallback: If data attributes are not available, try to derive them from the src
                    else if (currentSrc) {
                        if (currentSrc.includes('_light.png')) {
                            const darkSrc = currentSrc.replace('_light.png', '_dark.png');
                            if (isDarkMode) {
                                img.setAttribute('src', darkSrc);
                            }
                        } else if (currentSrc.includes('_dark.png')) {
                            const lightSrc = currentSrc.replace('_dark.png', '_light.png');
                            if (!isDarkMode) {
                                img.setAttribute('src', lightSrc);
                            }
                        }
                    }
                });
            });
        });
    </script>
</body>
</html>
    `;
    
    // Write final HTML asynchronously
    if (!quiet) logger.info(`Writing output file: ${chalk.cyan(path.basename(outputFile))}`);
    await writeFileAsync(outputFile, finalHtml);
    logger.debug(`Wrote ${finalHtml.length} characters to output file`, verbose);

    // Wait for all image processing to complete
    if (!quiet && imageProcessingPromises.length > 0) {
        const spinner = yoctoSpinner({text: ' Processing images, please wait...'}).start();
        await Promise.all(imageProcessingPromises);
        spinner.success(`All ${imageProcessingPromises.length} images processed successfully`);
    } else if (imageProcessingPromises.length > 0) {
        await Promise.all(imageProcessingPromises);
    }

    // Clean up all temporary files asynchronously
    logger.debug('Cleaning up temporary files...', verbose);
    await tempManager.cleanupAll();

    if (!quiet) {
        logger.success(`Documentation generated: ${chalk.cyan(path.basename(inputFile))} → ${chalk.cyan(path.basename(outputFile))}`);
        
        // Open the file in the default browser
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
        // Open the file even in quiet mode, but don't show messages
        try {
            await open(outputFile);
        } catch (error) {
            // Silently ignore errors in quiet mode
        }
    }
}

// CLI setup and command definitions
const program = new Command();

program
    .name('typecad-docgen')
    .description('Generate beautiful PCB documentation from Markdown and KiCad files')
    .version('1.0.1')
    .configureHelp({
        helpWidth: 100,
        sortSubcommands: true
    });

program
    .arguments('<markdown_file> <pcb_file>')
    .option('-o, --output <file>', 'Output HTML file (default: input file with .html extension)')
    .option('-v, --verbose', 'Enable verbose logging', false)
    .option('-q, --quiet', 'Suppress non-error output', false)
    .option('--no-open', 'Do not automatically open the generated HTML file in browser')
    .description('Generate beautiful PCB documentation\n\nArguments:\n  markdown_file  Input Markdown file (.md)\n  pcb_file       KiCad PCB file (.kicad_pcb)')
    .action(async (markdownFile: string, pcbFile: string, options: { output?: string; verbose?: boolean; quiet?: boolean; open?: boolean }) => {
        const { output, verbose, quiet, open: openFile } = options;
        
        // Show banner unless in quiet mode
        if (!quiet) {
            logger.banner();
        }
        
        try {
            // Resolve file paths
            const inputFile = path.resolve(markdownFile);
            const outputFile = output ? path.resolve(output) : inputFile.replace(/\.md$/, '.html');
            const pcbFilePath = path.resolve(pcbFile);
            
            // Generate documentation
            await generateDocumentation(inputFile, pcbFilePath, outputFile, { verbose, quiet, openFile });
            
        } catch (error) {
            logger.error(`${error}`);
            
            // Clean up temp files even if there's an error
            try {
                await tempManager.cleanupAll();
            } catch (cleanupError) {
                logger.error(`Failed to clean up temporary files: ${cleanupError}`);
            }
            
            process.exit(1);
        }
    });

// Add help examples
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

// Global error handling
process.on('uncaughtException', (error) => {
    logger.error(`Uncaught exception: ${error}`);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error(`Unhandled rejection at ${promise}: ${reason}`);
    process.exit(1);
});

// Parse command line arguments
program.parse();