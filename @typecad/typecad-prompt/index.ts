#!/usr/bin/env tsx
import { getDocument } from 'pdfjs-dist';
import fs from 'fs';
import yoctoSpinner from 'yocto-spinner';
import { fileSelector } from 'inquirer-file-selector';
import path from 'path';
import { select } from '@inquirer/prompts';
import { fileURLToPath } from 'url';
import https from 'https';

async function pdfToText(data: Buffer): Promise<string> {
    const doc = await getDocument({ data: new Uint8Array(data), useSystemFonts: true }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        pages.push(content.items.map((item: any) => item.str).join(' '));
    }
    return pages.join('\n');
}

// Get the directory where this script is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths to template files in the package
const PACKAGE_PROMPT_PATH = path.join(__dirname, 'rd_prompt.txt');
const COMPONENT_PROMPT_PATH = path.join(__dirname, 'component_prompt.txt');
const LLMS_FULL_URL = 'https://typecad.net/llms-full.txt';

process.on('uncaughtException', (error) => {
    if (error instanceof Error && error.message.includes('force closed')) {
    } else {
        // Rethrow unknown errors
        throw error;
    }
});

async function processPdf(pdfPath: string): Promise<string> {
    const spinner = yoctoSpinner({ text: ' Parsing text...' }).start();
    const pdf = await fs.promises.readFile(pdfPath);
    const text = await pdfToText(pdf);
    spinner.success(' finished converting pdf to text');
    return text;
}

async function downloadLlmsFull(): Promise<string> {
    const spinner = yoctoSpinner({ text: ' Downloading typeCAD documentation...' }).start();
    
    return new Promise((resolve, reject) => {
        https.get(LLMS_FULL_URL, (res) => {
            if (res.statusCode !== 200) {
                spinner.error(' failed');
                reject(new Error(`Failed to download: ${res.statusCode}`));
                return;
            }

            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                spinner.success(' finished downloading documentation');
                resolve(data);
            });
        }).on('error', (err) => {
            spinner.error(' failed');
            reject(err);
        });
    });
}

async function createProjectBundle(datasheetPath: string, schematicPath: string, datasheetText: string): Promise<void> {
    // Use the datasheet filename (without extension) as the bundle name
    const bundleName = path.basename(datasheetPath).replace(/\.(pdf|txt)$/, '');
    const bundleDir = bundleName;

    // Create bundle directory
    await fs.promises.mkdir(bundleDir, { recursive: true });

    // Copy datasheet file (use .txt version if original was PDF)
    const datasheetBundleFilename = datasheetPath.endsWith('.pdf')
        ? path.basename(datasheetPath).replace('.pdf', '.txt')
        : path.basename(datasheetPath);
    if (datasheetPath.endsWith('.pdf')) {
        await fs.promises.writeFile(path.join(bundleDir, datasheetBundleFilename), datasheetText);
    } else {
        await fs.promises.copyFile(datasheetPath, path.join(bundleDir, datasheetBundleFilename));
    }

    // Copy schematic image file
    await fs.promises.copyFile(schematicPath, path.join(bundleDir, path.basename(schematicPath)));

    // Download and save llms-full.txt from the website
    const llmsFullContent = await downloadLlmsFull();
    await fs.promises.writeFile(path.join(bundleDir, 'llms-full.txt'), llmsFullContent);

    // Copy the updated prompt file
    const promptFiles = await fs.promises.readdir('.');
    const latestPrompt = promptFiles
        .filter(file => file.startsWith('prompt-') && file.endsWith('.txt'))
        .sort()
        .pop();

    if (latestPrompt) {
        await fs.promises.copyFile(latestPrompt, path.join(bundleDir, 'prompt.txt'));
    }

    console.log(`Project bundle created successfully in directory: ${bundleDir}`);
}

async function updatePromptTemplate(datasheetPath: string, schematicPath: string): Promise<string> {
    const promptContent = await fs.promises.readFile(PACKAGE_PROMPT_PATH, 'utf-8');

    // Extract base filenames
    const datasheetFilename = path.basename(datasheetPath);
    const schematicFilename = path.basename(schematicPath);

    // Ensure datasheet filename uses .txt extension if original was PDF
    const datasheetPlaceholderFilename = datasheetFilename.endsWith('.pdf')
        ? datasheetFilename.replace('.pdf', '.txt')
        : datasheetFilename;

    const updatedContent = promptContent
        .replace('{{{datasheet}}}', datasheetPlaceholderFilename)
        .replace('{{{schematic}}}', schematicFilename);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const newPromptPath = `prompt-${timestamp}.txt`;
    await fs.promises.writeFile(newPromptPath, updatedContent);
    return newPromptPath;
}

async function updateComponentPromptTemplate(datasheetPath: string): Promise<string> {
    const promptContent = await fs.promises.readFile(COMPONENT_PROMPT_PATH, 'utf-8');

    // Extract base filename
    const datasheetFilename = path.basename(datasheetPath);

    // Ensure datasheet filename uses .txt extension if original was PDF
    const datasheetPlaceholderFilename = datasheetFilename.endsWith('.pdf')
        ? datasheetFilename.replace('.pdf', '.txt')
        : datasheetFilename;

    const updatedContent = promptContent
        .replace('{{{datasheet}}}', datasheetPlaceholderFilename);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const newPromptPath = `component-prompt-${timestamp}.txt`;
    await fs.promises.writeFile(newPromptPath, updatedContent);
    return newPromptPath;
}

async function handleReferenceDesign(): Promise<void> {
    try {
        // Select datasheet file
        console.log('Please select the datasheet file:');
        const datasheetPath = await fileSelector({
            message: 'Datasheet?',
            filter: (file: { name: string }) => file.name.endsWith('.pdf') || file.name.endsWith('.txt')
        });

        // Process datasheet if it's a PDF
        let datasheetText = '';
        if (datasheetPath.endsWith('.pdf')) {
            datasheetText = await processPdf(datasheetPath);
        }

        // Select schematic image
        console.log('Please select the schematic image:');
        const schematicPath = (await fileSelector({
            message: 'Schematic image?',
            filter: (file: { isDirectory: boolean; name: string }) => file.isDirectory || file.name.endsWith('.png') || file.name.endsWith('.jpg') || file.name.endsWith('.jpeg')
        })).path;

        // Update prompt template and get the temporary file path
        const tempPromptPath = await updatePromptTemplate(datasheetPath, schematicPath);

        // Create project bundle
        await createProjectBundle(datasheetPath, schematicPath, datasheetText);

        // Delete the temporary prompt file
        await fs.promises.unlink(tempPromptPath);

    } catch (error) {
        if (error instanceof Error && error.message.includes('force closed')) {
            process.exit(0);
        }
        console.error('An error occurred:', error);
        process.exit(1);
    }
}

async function handleComponent(): Promise<void> {
    try {
        // Select datasheet file
        console.log('Please select the datasheet file:');
        const datasheetPath = (await fileSelector({
            message: 'Datasheet?',
            filter: (file: { isDirectory: boolean; name: string }) => file.isDirectory || file.name.endsWith('.pdf') || file.name.endsWith('.txt')
        })).path;

        // Process datasheet if it's a PDF
        let datasheetText = '';
        if (datasheetPath.endsWith('.pdf')) {
            datasheetText = await processPdf(datasheetPath);
        }

        // Use the datasheet filename (without extension) as the bundle name
        const bundleName = path.basename(datasheetPath).replace(/\.(pdf|txt)$/, '');
        const bundleDir = `${bundleName}-component`;

        // Create bundle directory
        await fs.promises.mkdir(bundleDir, { recursive: true });

        // Copy datasheet file (use .txt version if original was PDF)
        const datasheetBundleFilename = datasheetPath.endsWith('.pdf')
            ? path.basename(datasheetPath).replace('.pdf', '.txt')
            : path.basename(datasheetPath);
        if (datasheetPath.endsWith('.pdf')) {
            await fs.promises.writeFile(path.join(bundleDir, datasheetBundleFilename), datasheetText);
        } else {
            await fs.promises.copyFile(datasheetPath, path.join(bundleDir, datasheetBundleFilename));
        }

        // Download and save llms-full.txt from the website
        const llmsFullContent = await downloadLlmsFull();
        await fs.promises.writeFile(path.join(bundleDir, 'llms-full.txt'), llmsFullContent);

        // Update component prompt template and get the temporary file path
        const tempPromptPath = await updateComponentPromptTemplate(datasheetPath);

        // Copy the updated prompt file
        await fs.promises.copyFile(tempPromptPath, path.join(bundleDir, 'prompt.txt'));

        // Delete the temporary prompt file
        await fs.promises.unlink(tempPromptPath);

        console.log(`Component bundle created successfully in directory: ${bundleDir}`);
    } catch (error) {
        if (error instanceof Error && error.message.includes('force closed')) {
            process.exit(0);
        }
        console.error('An error occurred:', error);
        process.exit(1);
    }
}

async function handleDatasheet(): Promise<void> {
    try {
        // Select datasheet file
        console.log('Please select the datasheet file:');
        const datasheetPath = (await fileSelector({
            message: 'Datasheet?',
            filter: (file: { isDirectory: boolean; name: string }) => file.isDirectory || file.name.endsWith('.pdf')
        })).path;

        // Process datasheet into text
        const datasheetText = await processPdf(datasheetPath);

        // Save the text to a file with the same name but .txt extension
        const outputPath = datasheetPath.replace('.pdf', '.txt');
        await fs.promises.writeFile(outputPath, datasheetText);
        console.log(`Datasheet text saved to: ${outputPath}`);
    } catch (error) {
        if (error instanceof Error && error.message.includes('force closed')) {
            process.exit(0);
        }
        console.error('An error occurred:', error);
        process.exit(1);
    }
}

(async () => {
    const promptType = await select({
        message: 'What would you like to do?',
        choices: [
            {
                name: '📦 Reference Design to typeCAD Package',
                value: 'reference',
                description: 'Generate a prompt for a reference design with datasheet and schematic'
            },
            {
                name: '🧩 Datasheet to typeCAD Component',
                value: 'component',
                description: 'Turn a datasheet into a typeCAD component'
            },
            {
                name: '✏️  Datasheet to Text',
                value: 'datasheet',
                description: 'Parse a PDF datasheet into a text file'
            }
        ]
    });

    switch (promptType) {
        case 'reference':
            await handleReferenceDesign();
            break;
        case 'component':
            await handleComponent();
            break;
        case 'datasheet':
            await handleDatasheet();
            break;
        default:
            console.error('Invalid prompt type selected');
            process.exit(1);
    }
})();