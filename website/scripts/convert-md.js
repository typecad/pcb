import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get the project root directory
const projectRoot = path.resolve(__dirname, '..');
const srcDir = path.join(projectRoot, 'src');
const llmsDir = path.join(projectRoot, 'llms');
const srcRoutesDir = path.join(projectRoot, 'src', 'routes');

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

// Function to recursively find all .md files
function findMdFiles(dir, baseDir = dir) {
  const files = [];
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      files.push(...findMdFiles(fullPath, baseDir));
    } else if (item.endsWith('.md')) {
      // Get relative path from base directory
      const relativePath = path.relative(baseDir, fullPath);
      files.push({ fullPath, relativePath });
    }
  }
  
  return files;
}

// Function to convert source path to destination path
function getDestPath(srcPath, relativePath) {
  // Split the path to get directory and filename
  const pathParts = relativePath.split(path.sep);

  // If the file is at least two levels deep (e.g., docs/board_layout/+page.md)
  if (pathParts.length >= 3 && pathParts[pathParts.length - 1] === '+page.md') {
    // e.g., ['docs', 'board_layout', '+page.md'] => llms/docs/board_layout.md
    const topLevel = pathParts[0];
    const folder = pathParts[1];
    return path.join(llmsDir, topLevel, folder + '.md');
  }

  // If the file is at least two levels deep and is not '+page.md', use the folder name
  if (pathParts.length >= 3) {
    const topLevel = pathParts[0];
    const folder = pathParts[1];
    return path.join(llmsDir, topLevel, folder + '.md');
  }

  // If the file is at the top level (e.g., docs/+page.md)
  if (pathParts.length === 2 && pathParts[1] === '+page.md') {
    const topLevel = pathParts[0];
    return path.join(llmsDir, topLevel + '.md');
  }

  // Otherwise, just use the cleaned path under llms
  return path.join(llmsDir, ...pathParts);
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

// Function to convert a single markdown file
function convertMarkdownFile(srcPath, destPath) {
  try {
    // Read the source file
    const content = fs.readFileSync(srcPath, 'utf8');
    
    // Strip HTML elements
    const strippedContent = stripHtmlElements(content);
    
    // Ensure the destination directory exists
    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    
    // Write the stripped content to the destination
    fs.writeFileSync(destPath, strippedContent, 'utf8');
    
    console.log(`✓ Converted: ${srcPath} -> ${destPath}`);
    
    // Return the first heading for use in llms.txt
    return extractFirstHeading(strippedContent);
  } catch (error) {
    console.error(`✗ Error converting ${srcPath}:`, error.message);
    return '';
  }
}

// Helper to create a human-friendly title from a filename
function toTitle(filename) {
  return filename
    .replace(/[-_]/g, ' ')
    .replace(/\.md$/, '')
    .replace(/\b\w/g, c => c.toUpperCase());
}

// Helper to create a better title from the full path
function getTitleFromPath(relativePath, destPath) {
  const pathParts = relativePath.split(path.sep);
  
  // For files like docs/package/code/+page.md, use "Package Code"
  if (pathParts.length >= 3 && pathParts[pathParts.length - 1] === '+page.md') {
    const section = pathParts[0]; // docs, examples, etc.
    const folder = pathParts[1]; // package, board_layout, etc.
    const subfolder = pathParts[2]; // code, overview, etc.
    
    if (pathParts.length >= 4) {
      // Has subfolder, use "Folder Subfolder" format
      return `${toTitle(folder)} ${toTitle(subfolder)}`;
    } else {
      // No subfolder, just use folder name
      return toTitle(folder);
    }
  }
  
  // For other files, use the filename
  return toTitle(path.basename(destPath));
}

// Main function
function main() {
  console.log('Starting markdown conversion...');
  console.log(`Source directory: ${srcRoutesDir}`);
  console.log(`Destination directory: ${llmsDir}`);
  
  // Find all .md files in src/routes directory
  const mdFiles = findMdFiles(srcRoutesDir);
  
  if (mdFiles.length === 0) {
    console.log('No markdown files found in src/routes directory.');
    return;
  }
  
  console.log(`Found ${mdFiles.length} markdown files to convert.`);
  
  // Track converted files for llms.txt (use Set to avoid duplicates)
  const converted = new Map(); // destPath -> { link, title, description }
  
  // Convert each file
  for (const { fullPath, relativePath } of mdFiles) {
    const destPath = getDestPath(fullPath, relativePath);
    const description = convertMarkdownFile(fullPath, destPath);
    
    // Only add if we haven't seen this destination path before
    if (!converted.has(destPath)) {
      // Get relative path from llms/ directory
      const relPath = path.relative(llmsDir, destPath).replace(/\\/g, '/');
      // Title from path
      const title = getTitleFromPath(relativePath, destPath);
      converted.set(destPath, { link: relPath, title, description });
    }
  }
  
  // Write llms.txt
  const llmsTxtPath = path.join(llmsDir, 'llms.txt');
  let llmsTxt = '# typeCAD\n\n> Project description goes here\n\n## Documentation\n\n';
  
  // Sort by link for consistent ordering
  const sortedEntries = Array.from(converted.values()).sort((a, b) => a.link.localeCompare(b.link));
  
  for (const { link, title, description } of sortedEntries) {
    if (description) {
      llmsTxt += `- [${title}](${link}): ${description}\n`;
    } else {
      llmsTxt += `- [${title}](${link})\n`;
    }
  }
  fs.writeFileSync(llmsTxtPath, llmsTxt, 'utf8');

  // Write llms-full.txt with all content merged
  const llmsFullPath = path.join(llmsDir, 'llms-full.txt');
  let llmsFull = '# typeCAD - Complete Documentation\n\n';
  
  for (const { link, title, description } of sortedEntries) {
    const filePath = path.join(llmsDir, link);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Remove the first # heading to avoid duplication
      const lines = content.split('\n');
      let contentWithoutFirstHeading = content;
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
      
      llmsFull += `\n\n---\n\n## ${title}\n\n`;
      if (description) {
        llmsFull += `*${description}*\n\n`;
      }
      llmsFull += contentWithoutFirstHeading;
    }
  }
  fs.writeFileSync(llmsFullPath, llmsFull, 'utf8');

  console.log('Conversion completed!');
}

// Run the script
main(); 