import { MCPServer } from '../server';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

interface LocalComponentIndex {
  file_path: string;
  component_name: string;
  symbol_library?: string;
  footprint_library?: string;
  description?: string;
  pins?: string[];
  last_modified: Date;
  file_format: "kicad" | "eagle" | "json" | "csv" | "typescript";
  size_bytes: number;
}

interface LocalComponentResult {
  file_path: string;
  component_name: string;
  description?: string;
  file_format: string;
  last_modified: string;
  confidence_score: number;
  preview?: string;
}

export class LocalComponentIndexer {
  private indexPath: string;
  private index: LocalComponentIndex[] = [];

  constructor(baseDirectory: string) {
    this.indexPath = path.join(baseDirectory, '.typecad_component_index.json');
  }

  async loadIndex(): Promise<void> {
    try {
      if (fs.existsSync(this.indexPath)) {
        const indexData = await readFile(this.indexPath, 'utf-8');
        this.index = JSON.parse(indexData);
      }
    } catch (error) {
      console.error('Failed to load component index:', error);
      this.index = [];
    }
  }

  async saveIndex(): Promise<void> {
    try {
      await writeFile(this.indexPath, JSON.stringify(this.index, null, 2));
    } catch (error) {
      console.error('Failed to save component index:', error);
    }
  }

  async scanDirectory(directory: string, recursive: boolean = true, fileTypes: string[] = ['.ts', '.js', '.json', '.kicad_sym', '.lib', '.csv']): Promise<void> {
    try {
      const entries = await readdir(directory, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);
        
        if (entry.isDirectory() && recursive) {
          // Skip node_modules and other common directories
          if (!['node_modules', '.git', '.vscode', 'dist', 'build'].includes(entry.name)) {
            await this.scanDirectory(fullPath, recursive, fileTypes);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (fileTypes.includes(ext)) {
            await this.indexFile(fullPath);
          }
        }
      }
    } catch (error) {
      console.error(`Failed to scan directory ${directory}:`, error);
    }
  }

  async indexFile(filePath: string): Promise<void> {
    try {
      const stats = await stat(filePath);
      const ext = path.extname(filePath).toLowerCase();
      
      // Remove existing entry for this file
      this.index = this.index.filter(item => item.file_path !== filePath);
      
      const indexEntry: LocalComponentIndex = {
        file_path: filePath,
        component_name: path.basename(filePath, ext),
        last_modified: stats.mtime,
        file_format: this.getFileFormat(ext),
        size_bytes: stats.size
      };

      // Extract component information based on file type
      const content = await readFile(filePath, 'utf-8');
      
      if (ext === '.ts' || ext === '.js') {
        this.parseTypeScriptComponent(content, indexEntry);
      } else if (ext === '.json') {
        this.parseJsonComponent(content, indexEntry);
      } else if (ext === '.kicad_sym') {
        this.parseKiCadSymbol(content, indexEntry);
      } else if (ext === '.lib') {
        this.parseEagleLibrary(content, indexEntry);
      } else if (ext === '.csv') {
        this.parseCsvComponent(content, indexEntry);
      }

      this.index.push(indexEntry);
    } catch (error) {
      console.error(`Failed to index file ${filePath}:`, error);
    }
  }

  private getFileFormat(ext: string): "kicad" | "eagle" | "json" | "csv" | "typescript" {
    switch (ext) {
      case '.ts': case '.js': return 'typescript';
      case '.json': return 'json';
      case '.kicad_sym': return 'kicad';
      case '.lib': return 'eagle';
      case '.csv': return 'csv';
      default: return 'json';
    }
  }

  private parseTypeScriptComponent(content: string, entry: LocalComponentIndex): void {
    // Extract class name and description from TypeScript component
    const classMatch = content.match(/export\s+class\s+(\w+)/);
    if (classMatch) {
      entry.component_name = classMatch[1];
    }

    // Extract description from comments
    const descMatch = content.match(/\/\*\*[\s\S]*?\*\/|\/\/\s*(.+)/);
    if (descMatch) {
      entry.description = descMatch[1] || descMatch[0].replace(/\/\*|\*\/|\*/g, '').trim();
    }

    // Extract pin information
    const pinMatches = content.match(/(\w+)\s*=\s*new\s+Pin\(/g);
    if (pinMatches) {
      entry.pins = pinMatches.map(match => match.split('=')[0].trim());
    }
  }

  private parseJsonComponent(content: string, entry: LocalComponentIndex): void {
    try {
      const data = JSON.parse(content);
      entry.component_name = data.name || data.component_name || entry.component_name;
      entry.description = data.description || data.desc;
      entry.pins = data.pins ? Object.keys(data.pins) : [];
    } catch (error) {
      console.error('Failed to parse JSON component:', error);
    }
  }

  private parseKiCadSymbol(content: string, entry: LocalComponentIndex): void {
    // Extract symbol name and properties from KiCad symbol file
    const symbolMatch = content.match(/\(symbol\s+"([^"]+)"/);
    if (symbolMatch) {
      entry.component_name = symbolMatch[1];
    }

    const descMatch = content.match(/\(property\s+"Description"\s+"([^"]+)"/);
    if (descMatch) {
      entry.description = descMatch[1];
    }
  }

  private parseEagleLibrary(content: string, entry: LocalComponentIndex): void {
    // Basic Eagle library parsing
    const deviceMatch = content.match(/<device\s+name="([^"]+)"/);
    if (deviceMatch) {
      entry.component_name = deviceMatch[1];
    }
  }

  private parseCsvComponent(content: string, entry: LocalComponentIndex): void {
    // Parse CSV component definition (KiPart style)
    const lines = content.split('\n');
    if (lines.length > 1) {
      const headers = lines[0].split(',');
      const nameIndex = headers.findIndex(h => h.toLowerCase().includes('name') || h.toLowerCase().includes('part'));
      if (nameIndex >= 0 && lines[1]) {
        const values = lines[1].split(',');
        entry.component_name = values[nameIndex] || entry.component_name;
      }
    }
  }

  search(query: string, maxResults: number = 10): LocalComponentResult[] {
    const queryLower = query.toLowerCase();
    const results: LocalComponentResult[] = [];

    for (const item of this.index) {
      let score = 0;

      // Exact match gets highest score
      if (item.component_name.toLowerCase() === queryLower) {
        score += 100;
      }
      // Partial name match
      else if (item.component_name.toLowerCase().includes(queryLower)) {
        score += 75;
      }
      
      // Description match
      if (item.description && item.description.toLowerCase().includes(queryLower)) {
        score += 50;
      }
      
      // Pin name match
      if (item.pins && item.pins.some(pin => pin.toLowerCase().includes(queryLower))) {
        score += 25;
      }

      // File path match
      if (item.file_path.toLowerCase().includes(queryLower)) {
        score += 10;
      }

      if (score > 0) {
        results.push({
          file_path: item.file_path,
          component_name: item.component_name,
          description: item.description,
          file_format: item.file_format,
          last_modified: item.last_modified.toISOString(),
          confidence_score: score
        });
      }
    }

    // Sort by score and return top results
    return results
      .sort((a, b) => b.confidence_score - a.confidence_score)
      .slice(0, maxResults);
  }

  getStats() {
    const stats = {
      total_components: this.index.length,
      by_format: {} as Record<string, number>,
      last_updated: new Date().toISOString(),
      index_path: this.indexPath
    };

    for (const item of this.index) {
      stats.by_format[item.file_format] = (stats.by_format[item.file_format] || 0) + 1;
    }

    return stats;
  }
}

export function registerSearchLocalComponentsTool(server: MCPServer) {
  server.registerTool({
    name: "search_local_components",
    description: "Search local component files in a directory. Searches TypeScript components, JSON definitions, KiCad symbols, Eagle libraries, and CSV files. Returns file paths and component information for matching results.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query - component name, description, or pin name"
        },
        directory: {
          type: "string",
          description: "Directory to search (default: current working directory)"
        },
        file_types: {
          type: "array",
          description: "File extensions to search (default: ['.ts', '.js', '.json', '.kicad_sym', '.lib', '.csv'])",
          items: { type: "string" }
        },
        recursive: {
          type: "boolean",
          description: "Search subdirectories recursively (default: true)",
          default: true
        },
        max_results: {
          type: "number",
          description: "Maximum number of results to return (default: 10)",
          default: 10
        },
        rebuild_index: {
          type: "boolean",
          description: "Force rebuild of component index (default: false)",
          default: false
        }
      },
      required: ["query"]
    }
  });

  server.on('tool_call', async ({ name, args, resolve, reject }) => {
    if (name !== 'search_local_components') return;
    
    try {
      const { 
        query, 
        directory = process.cwd(), 
        file_types = ['.ts', '.js', '.json', '.kicad_sym', '.lib', '.csv'],
        recursive = true,
        max_results = 10,
        rebuild_index = false
      } = args;

      const indexer = new LocalComponentIndexer(directory);
      
      // Load existing index or rebuild if requested
      if (!rebuild_index) {
        await indexer.loadIndex();
      }
      
      // Check if index is empty or rebuild requested
      const stats = indexer.getStats();
      if (stats.total_components === 0 || rebuild_index) {
        console.error('Building component index...');
        await indexer.scanDirectory(directory, recursive, file_types);
        await indexer.saveIndex();
      }

      const results = indexer.search(query, max_results);
      
      const searchResult = {
        query,
        directory,
        total_results: results.length,
        index_stats: indexer.getStats(),
        components: results,
        usage_instructions: [
          "To use a local component, copy the file path",
          "Call add_component tool with: { source: 'local', local_file: '/path/to/component.ts' }",
          "For TypeScript components, you can import them directly",
          "Use 'index_local_components' tool to rebuild the search index"
        ]
      };
      
      resolve(JSON.stringify(searchResult, null, 2));
      
    } catch (error: any) {
      reject(new Error(JSON.stringify({
        error_code: "LOCAL_SEARCH_FAILED",
        message: `Failed to search local components: ${error.message}`,
        suggestions: [
          "Check that the directory path exists",
          "Ensure you have read permissions for the directory",
          "Try rebuilding the index with rebuild_index: true",
          "Verify file types are correct"
        ]
      }, null, 2)));
    }
  });
}

export function registerIndexLocalComponentsTool(server: MCPServer) {
  server.registerTool({
    name: "index_local_components",
    description: "Build or rebuild an index of local component files for faster searching. Scans directories for TypeScript components, JSON definitions, KiCad symbols, Eagle libraries, and CSV files.",
    inputSchema: {
      type: "object",
      properties: {
        directory: {
          type: "string",
          description: "Directory to scan and index (required)"
        },
        recursive: {
          type: "boolean",
          description: "Scan subdirectories recursively (default: true)",
          default: true
        },
        file_types: {
          type: "array",
          description: "File extensions to index (default: ['.ts', '.js', '.json', '.kicad_sym', '.lib', '.csv'])",
          items: { type: "string" }
        },
        force_reindex: {
          type: "boolean",
          description: "Rebuild index even if it already exists (default: false)",
          default: false
        }
      },
      required: ["directory"]
    }
  });

  server.on('tool_call', async ({ name, args, resolve, reject }) => {
    if (name !== 'index_local_components') return;
    
    try {
      const { 
        directory, 
        recursive = true,
        file_types = ['.ts', '.js', '.json', '.kicad_sym', '.lib', '.csv'],
        force_reindex = false
      } = args;

      if (!fs.existsSync(directory)) {
        reject(new Error(JSON.stringify({
          error_code: "DIRECTORY_NOT_FOUND",
          message: `Directory does not exist: ${directory}`,
          suggestions: [
            "Check the directory path is correct",
            "Use an absolute path",
            "Ensure you have read permissions"
          ]
        }, null, 2)));
        return;
      }

      const indexer = new LocalComponentIndexer(directory);
      
      // Load existing index to check if rebuild is needed
      if (!force_reindex) {
        await indexer.loadIndex();
        const stats = indexer.getStats();
        if (stats.total_components > 0) {
          resolve(JSON.stringify({
            message: "Index already exists. Use force_reindex: true to rebuild.",
            stats,
            suggestion: "Use search_local_components to search existing index"
          }, null, 2));
          return;
        }
      }

      console.error(`Indexing components in ${directory}...`);
      const startTime = Date.now();
      
      await indexer.scanDirectory(directory, recursive, file_types);
      await indexer.saveIndex();
      
      const endTime = Date.now();
      const stats = indexer.getStats();
      
      const result = {
        message: "Component index created successfully",
        directory,
        scan_time_ms: endTime - startTime,
        stats,
        next_steps: [
          "Use search_local_components to search for components",
          "Index will be automatically updated when files change",
          "Run this tool again with force_reindex: true to rebuild"
        ]
      };
      
      resolve(JSON.stringify(result, null, 2));
      
    } catch (error: any) {
      reject(new Error(JSON.stringify({
        error_code: "INDEXING_FAILED",
        message: `Failed to index local components: ${error.message}`,
        suggestions: [
          "Check directory permissions",
          "Ensure sufficient disk space",
          "Verify file types are valid",
          "Try with a smaller directory first"
        ]
      }, null, 2)));
    }
  });
}
