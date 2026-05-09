import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get the project root directory
const projectRoot = path.resolve(__dirname, '..');
const llmsDir = path.join(projectRoot, 'llms');
const apiDir = path.join(llmsDir, 'api');

// Function to strip HTML elements from markdown content
function stripHtmlElements(content) {
  // Remove script tags and their content
  content = content.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  
  // Remove other HTML tags but keep their text content
  content = content.replace(/<[^>]*>/g, '');
  
  // Clean up extra whitespace and empty lines
  content = content.replace(/\n\s*\n\s*\n/g, '\n\n');
  content = content.trim();
  
  return content;
}

// Function to extract the first heading from markdown content
function extractFirstHeading(content) {
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ')) {
      return trimmed.substring(2).trim();
    }
  }
  return '';
}

// Function to get a human-friendly title from filename
function getTitleFromFilename(filename) {
  // Remove .md extension
  const name = filename.replace(/\.md$/, '');
  
  // Handle different naming patterns
  if (name.startsWith('Class.')) {
    return name.substring(6); // Remove "Class." prefix
  } else if (name.startsWith('Interface.')) {
    return name.substring(10); // Remove "Interface." prefix
  } else if (name.startsWith('Variable.')) {
    return name.substring(9); // Remove "Variable." prefix
  } else if (name === 'globals') {
    return 'Globals';
  } else if (name === 'README') {
    return 'API Overview';
  }
  
  return name;
}

// Function to sort files in a logical order
function sortApiFiles(files) {
  const order = [
    'README.md',
    'passives.md',
    'globals.md',
    'Class.PCB.md',
    'Class.Schematic.md',
    'Class.Component.md',
    'Class.ComponentRegistry.md',
    'Class.Pin.md',
    'Class.Power.md',
    'Class.TrackBuilder.md',
    'Class.KiCAD.md',
    'Class.I2C.md',
    'Class.UART.md',
    'Class.USB.md',
    'Interface.IComponent.md',
    'Interface.IPinPowerInfo.md',
    'Variable.kicad_path.md',
    'Variable.kicad_cli_path.md'
  ];
  
  return files.sort((a, b) => {
    const aIndex = order.indexOf(a);
    const bIndex = order.indexOf(b);
    
    // If both files are in the order list, sort by their position
    if (aIndex !== -1 && bIndex !== -1) {
      return aIndex - bIndex;
    }
    
    // If only one is in the order list, prioritize it
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    
    // Otherwise, sort alphabetically
    return a.localeCompare(b);
  });
}

// Main function
function main() {
  console.log('Starting API documentation merge...');
  console.log(`API directory: ${apiDir}`);
  console.log(`Output file: ${path.join(llmsDir, 'llms-full.txt')}`);
  
  // Check if API directory exists
  if (!fs.existsSync(apiDir)) {
    console.error(`API directory not found: ${apiDir}`);
    return;
  }
  
  // Read all .md files from the API directory
  const apiFiles = fs.readdirSync(apiDir)
    .filter(file => file.endsWith('.md'))
    .filter(file => file !== 'README.md'); // Exclude README.md as it's already in llms-full.txt
  
  // Also include passives.md from the llms directory
  const passivesFile = 'passives.md';
  const passivesPath = path.join(llmsDir, passivesFile);
  const files = [...apiFiles];
  
  if (fs.existsSync(passivesPath)) {
    files.push(passivesFile);
  }
  
  if (files.length === 0) {
    console.log('No markdown files found in API directory.');
    return;
  }
  
  // Sort files in logical order
  const sortedFiles = sortApiFiles(files);
  
  console.log(`Found ${sortedFiles.length} API files to merge.`);
  
  // Read the existing llms-full.txt content
  const llmsFullPath = path.join(llmsDir, 'llms-full.txt');
  let existingContent = '';
  
  if (fs.existsSync(llmsFullPath)) {
    existingContent = fs.readFileSync(llmsFullPath, 'utf8');
    console.log('Found existing llms-full.txt, will append API documentation.');
  } else {
    console.log('No existing llms-full.txt found, creating new file.');
  }
  
  // Start building the merged content
  let mergedContent = existingContent;
  
  // Add API section header if we have existing content
  if (existingContent && !existingContent.includes('## API Reference')) {
    mergedContent += '\n\n---\n\n## API Reference\n\n';
  } else if (!existingContent) {
    mergedContent = '# typeCAD - Complete Documentation with API Reference\n\n';
  }
  
  // Process each API file
  for (const filename of sortedFiles) {
    // Determine the correct file path
    let filePath;
    if (filename === 'passives.md') {
      filePath = path.join(llmsDir, filename);
    } else {
      filePath = path.join(apiDir, filename);
    }
    
    try {
      // Read the file content
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Strip HTML elements
      const strippedContent = stripHtmlElements(content);
      
      // Get title from filename
      const title = getTitleFromFilename(filename);
      
      // Extract first heading for description
      const firstHeading = extractFirstHeading(strippedContent);
      
      // Remove the first heading to avoid duplication
      const lines = strippedContent.split('\n');
      let contentWithoutFirstHeading = strippedContent;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('# ')) {
          // Remove this line and any following empty lines
          lines.splice(i, 1);
          while (i < lines.length && lines[i].trim() === '') {
            lines.splice(i, 1);
          }
          contentWithoutFirstHeading = lines.join('\n');
          break;
        }
      }
      
      // Add the API documentation to the merged content
      mergedContent += `\n\n---\n\n## ${title}\n\n`;
      if (firstHeading && firstHeading !== title) {
        mergedContent += `*${firstHeading}*\n\n`;
      }
      mergedContent += contentWithoutFirstHeading;
      
      console.log(`✓ Merged: ${filename} -> ${title}`);
      
    } catch (error) {
      console.error(`✗ Error processing ${filename}:`, error.message);
    }
  }
  
  // Write the merged content to llms-full.txt
  fs.writeFileSync(llmsFullPath, mergedContent, 'utf8');
  
  console.log('\nAPI documentation merge completed!');
  console.log(`Updated: ${llmsFullPath}`);
}

// Run the script
main(); 