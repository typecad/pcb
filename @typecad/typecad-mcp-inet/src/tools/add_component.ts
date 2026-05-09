import { MCPServer } from '../server';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

interface KiCadSymbolResult {
  score: number;
  library: string;
  symbol: string;
  description: string;
  fullSymbol: string; // library:symbol format
}

interface ComponentParams {
  symbol?: string;
  footprint?: string;
  componentNumber?: string;
  localFile?: string;
}

interface ValidationInfo {
  status: 'completed' | 'skipped' | 'failed';
  component_file?: string;
  datasheet_file?: string;
  result?: any;
  reason?: string;
  note?: string;
  error?: string;
}

interface AddComponentResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  status: string;
  summary: string;
  interactive_workflow: {
    source_selected: string;
    parameters_collected: ComponentParams;
    output_folder: string;
  };
  validation?: ValidationInfo;
  file_locations?: {
    component_file?: string;
    expected_location?: string;
    actual_location?: string;
    search_directory?: string;
  };
  suggestions?: string[];
  error_code?: string;
}

function validateSymbolFormat(symbol: string): { valid: boolean; error?: string; suggestions?: string[] } {
  if (!symbol) {
    return { valid: false, error: "Symbol cannot be empty" };
  }
  
  if (!symbol.includes(':')) {
    return { 
      valid: false, 
      error: "Symbol must be in format 'library:symbol'", 
      suggestions: [
        "Example: 'MCU_Microchip_ATtiny:ATtiny85-20X'",
        "Example: 'Device:R' for resistor",
        "Example: 'Device:C' for capacitor"
      ]
    };
  }
  
  const parts = symbol.split(':');
  if (parts.length !== 2) {
    return { 
      valid: false, 
      error: "Symbol format should have exactly one colon separating library and symbol name",
      suggestions: ["Format: 'library:symbol'"]
    };
  }
  
  if (!parts[0].trim() || !parts[1].trim()) {
    return { 
      valid: false, 
      error: "Both library and symbol name must be non-empty",
      suggestions: ["Example: 'MCU_Microchip_ATtiny:ATtiny85-20X'"]
    };
  }
  
  return { valid: true };
}

function validateFootprintFormat(footprint: string): { valid: boolean; error?: string; suggestions?: string[] } {
  if (!footprint) {
    return { valid: false, error: "Footprint cannot be empty" };
  }
  
  if (!footprint.includes(':')) {
    return { 
      valid: false, 
      error: "Footprint must be in format 'library:footprint'", 
      suggestions: [
        "Example: 'Package_DIP:DIP-8_W7.62mm'",
        "Example: 'Resistor_SMD:R_0603_1608Metric'",
        "Example: 'Capacitor_SMD:C_0603_1608Metric'"
      ]
    };
  }
  
  const parts = footprint.split(':');
  if (parts.length !== 2) {
    return { 
      valid: false, 
      error: "Footprint format should have exactly one colon separating library and footprint name",
      suggestions: ["Format: 'library:footprint'"]
    };
  }
  
  if (!parts[0].trim() || !parts[1].trim()) {
    return { 
      valid: false, 
      error: "Both library and footprint name must be non-empty",
      suggestions: ["Example: 'Package_DIP:DIP-8_W7.62mm'"]
    };
  }
  
  return { valid: true };
}

function validateComponentNumber(componentNumber: string): { valid: boolean; error?: string; suggestions?: string[] } {
  if (!componentNumber) {
    return { valid: false, error: "Component number cannot be empty" };
  }
  
  if (!/^C\d+$/.test(componentNumber)) {
    return { 
      valid: false, 
      error: "Component number must start with 'C' followed by digits only",
      suggestions: [
        "Example: 'C1234567'",
        "Example: 'C17'",
        "Find component numbers at lcsc.com or jlcpcb.com"
      ]
    };
  }
  
  return { valid: true };
}

export async function searchKiCadSymbols(query: string, maxResults: number = 5): Promise<KiCadSymbolResult[]> {
  try {

    const { stdout, stderr } = await execAsync(`npx @typecad/kicad-symbols "${query}" --format json --limit ${maxResults}`);
    
    // Extract JSON from output (may have extra text before/after)
    let jsonString = stdout.trim();
    
    // Find the start of the JSON array
    const arrayStart = jsonString.indexOf('[');
    if (arrayStart === -1) {

      return [];
    }
    
    // Find the end of the JSON array
    let bracketCount = 0;
    let arrayEnd = arrayStart;
    for (let i = arrayStart; i < jsonString.length; i++) {
      if (jsonString[i] === '[') bracketCount++;
      if (jsonString[i] === ']') bracketCount--;
      if (bracketCount === 0) {
        arrayEnd = i;
        break;
      }
    }
    
    jsonString = jsonString.substring(arrayStart, arrayEnd + 1);
    const results = JSON.parse(jsonString);
    
    // Transform results to our interface format
    return results.map((result: any) => {
      const id = result.id || '';
      const [library, symbol] = id.split(':');
      return {
        score: result.score || 0,
        library: library || '',
        symbol: symbol || '',
        description: result.description || '',
        fullSymbol: id
      };
    });
  } catch (error: any) {

    
    // Check if the package is not installed
    if (error.message.includes('not found') || error.message.includes('ENOENT')) {
      throw new Error('The @typecad/kicad-symbols package is not installed. Install it with: npm install -g @typecad/kicad-symbols');
    }
    
    return [];
  }
}

async function searchKiCadFootprints(query: string, maxResults: number = 5): Promise<string[]> {
  try {

    // Note: @typecad/kicad-symbols primarily focuses on symbols, but we can try to extract footprint suggestions
    // from symbol descriptions or use a pattern-based approach
    const { stdout } = await execAsync(`npx @typecad/kicad-symbols "${query}" --format json --limit ${maxResults}`);
    
    // Extract JSON from output (may have extra text before/after)
    let jsonString = stdout.trim();
    
    // Find the start of the JSON array
    const arrayStart = jsonString.indexOf('[');
    if (arrayStart === -1) {

      return [];
    }
    
    // Find the end of the JSON array
    let bracketCount = 0;
    let arrayEnd = arrayStart;
    for (let i = arrayStart; i < jsonString.length; i++) {
      if (jsonString[i] === '[') bracketCount++;
      if (jsonString[i] === ']') bracketCount--;
      if (bracketCount === 0) {
        arrayEnd = i;
        break;
      }
    }
    
    jsonString = jsonString.substring(arrayStart, arrayEnd + 1);
    const results = JSON.parse(jsonString);
    const footprints: string[] = [];
    
    // Extract potential footprint patterns from descriptions
    for (const result of results) {
      if (result.description) {
        // Extract package information from descriptions (e.g., "DIP-8", "SOIC-8", "QFN-20")
        if (result.description.includes('DIP-8')) {
          footprints.push('Package_DIP:DIP-8_W7.62mm');
        }
        if (result.description.includes('SOIC-8')) {
          footprints.push('Package_SO:SOIC-8_3.9x4.9mm_P1.27mm');
        }
        if (result.description.includes('QFN-20')) {
          footprints.push('Package_DFN_QFN:QFN-20-1EP_4x4mm_P0.5mm_EP2.5x2.5mm');
        }
        // Add more package types as needed
      }
    }
    
    return [...new Set(footprints)].slice(0, maxResults);
  } catch (error: any) {

    return [];
  }
}

function buildCommand(source: string, params: ComponentParams, outputFolder?: string, cwd?: string): string[] {

  const baseCmd = ["@typecad/add-component"];
  
  switch(source) {
    case "kicad":
      baseCmd.push("--kicad=true", `--symbol=${params.symbol}`);
      // Only add footprint if provided (auto-discovery handles the rest)
      if (params.footprint) {
        baseCmd.push(`--footprint=${params.footprint}`);
      }
      break;
    case "local":
      // For local sources, we require both symbol and footprint file paths
      if (!params.symbol || !params.footprint) {
        throw new Error("Local source requires both symbol and footprint file paths");
      }

      // If both symbol and footprint files are provided
      const symbolPath = path.isAbsolute(params.symbol) ? params.symbol : path.resolve(cwd || process.cwd(), params.symbol);
      const footprintPath = path.isAbsolute(params.footprint) ? params.footprint : path.resolve(cwd || process.cwd(), params.footprint);

      // Check if the files exist and are accessible
      if (!fs.existsSync(symbolPath)) {
        throw new Error(`Symbol file not found: ${symbolPath}`);
      }
      if (!fs.existsSync(footprintPath)) {
        throw new Error(`Footprint file not found: ${footprintPath}`);
      }

      baseCmd.push("--local=true", `--symbol=${symbolPath}`, `--footprint=${footprintPath}`);
      break;
    case "jlcpcb":
      baseCmd.push("--jlcpcb=true", `--c=${params.componentNumber}`);
      break;
  }
  
  // Default to current working directory if not specified
  const targetFolder = outputFolder || (cwd ? path.resolve(cwd) : process.cwd());
  baseCmd.push(`--folder=${targetFolder}`);
  

  return baseCmd;
}

function extractComponentNameFromOutput(stdout: string): string | null {
  // Look for the import statement pattern in the output
  const importMatch = stdout.match(/import\s*{\s*([^}]+)\s*}\s*from\s*['"`]([^'"`]+)['"`]/);
  if (importMatch) {
    return importMatch[1].trim();
  }
  
  // Fallback: look for "use it with:" pattern
  const useMatch = stdout.match(/use it with:\s*\n\s*import\s*{\s*([^}]+)\s*}/);
  if (useMatch) {
    return useMatch[1].trim();
  }
  
  return null;
}

function findComponentFilePath(componentName: string, searchDir?: string): string | null {
  const baseDir = searchDir || process.cwd();
  
  // Try different possible file names
  const possibleNames = [
    `${componentName}.ts`,
    `${componentName.replace(/[^a-zA-Z0-9]/g, '_')}.ts`,
    `${componentName.replace(/[^a-zA-Z0-9]/g, '')}.ts`,
    `${componentName.toLowerCase()}.ts`,
    `${componentName.toUpperCase()}.ts`
  ];
  
  // Search in multiple possible directories
  const searchDirs = [
    baseDir,
    path.join(baseDir, 'src'),
    path.join(baseDir, 'components'),
    path.join(baseDir, 'lib'),
    path.join(baseDir, 'typecad')
  ];
  
  for (const dir of searchDirs) {
    if (fs.existsSync(dir)) {
      for (const fileName of possibleNames) {
        const filePath = path.join(dir, fileName);
        if (fs.existsSync(filePath)) {

          return filePath;
        }
      }
    }
  }
  
  // Also try to search recursively in common directories (excluding problematic dirs)
  for (const dir of searchDirs) {
    if (fs.existsSync(dir)) {
      try {
        // Use non-recursive search first, then selectively search subdirectories
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        
        // Check files in current directory
        for (const entry of entries) {
          if (entry.isFile() && entry.name.endsWith('.ts')) {
            for (const possibleName of possibleNames) {
              if (entry.name === possibleName) {
                const fullPath = path.join(dir, entry.name);

                return fullPath;
              }
            }
          }
        }
        
        // Selectively search subdirectories (excluding problematic ones)
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const subDir = path.join(dir, entry.name);
            // Skip problematic directories that can cause hangs
            if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'build' || entry.name === 'dist') {

              continue;
            }
            
            try {
              const subFiles = fs.readdirSync(subDir, { withFileTypes: true });
              for (const file of subFiles) {
                if (file.isFile() && file.name.endsWith('.ts')) {
                  for (const possibleName of possibleNames) {
                    if (file.name === possibleName) {
                      const fullPath = path.join(subDir, file.name);

                      return fullPath;
                    }
                  }
                }
              }
            } catch (subError) {

            }
          }
        }
      } catch (e) {
        // Ignore errors during recursive search

      }
    }
  }
  

  return null;
}

function findDatasheetPath(componentName: string, searchDir?: string): string | null {
  const baseDir = searchDir || process.cwd();
  
  // Common datasheet locations and patterns
  const searchPaths = [
    path.join(baseDir, 'datasheets'),
    path.join(baseDir, 'docs'),
    path.join(baseDir, 'datasheet'),
    path.join(baseDir, 'documentation'),
    path.join(baseDir, 'pdf'),
    baseDir
  ];
  
  const searchPatterns = [
    `${componentName}.pdf`,
    `${componentName}.txt`,
    `${componentName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
    `${componentName.replace(/[^a-zA-Z0-9]/g, '_')}.txt`,
    `${componentName.replace(/[^a-zA-Z0-9]/g, '')}.pdf`,
    `${componentName.replace(/[^a-zA-Z0-9]/g, '')}.txt`,
    `${componentName.toLowerCase()}.pdf`,
    `${componentName.toLowerCase()}.txt`,
    `${componentName.toUpperCase()}.pdf`,
    `${componentName.toUpperCase()}.txt`
  ];
  
  for (const searchPath of searchPaths) {
    if (fs.existsSync(searchPath)) {
      for (const pattern of searchPatterns) {
        const filePath = path.join(searchPath, pattern);
        if (fs.existsSync(filePath)) {

          return filePath;
        }
      }
      
      // Also search recursively in the directory (excluding problematic dirs)
      try {
        const entries = fs.readdirSync(searchPath, { withFileTypes: true });
        
        // Check files in current directory
        for (const entry of entries) {
          if (entry.isFile() && (entry.name.endsWith('.pdf') || entry.name.endsWith('.txt'))) {
            for (const pattern of searchPatterns) {
              if (entry.name === pattern) {
                const fullPath = path.join(searchPath, entry.name);

                return fullPath;
              }
            }
          }
        }
        
        // Selectively search subdirectories (excluding problematic ones)
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const subDir = path.join(searchPath, entry.name);
            // Skip problematic directories that can cause hangs
            if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'build' || entry.name === 'dist') {

              continue;
            }
            
            try {
              const subFiles = fs.readdirSync(subDir, { withFileTypes: true });
              for (const file of subFiles) {
                if (file.isFile() && (file.name.endsWith('.pdf') || file.name.endsWith('.txt'))) {
                  for (const pattern of searchPatterns) {
                    if (file.name === pattern) {
                      const fullPath = path.join(subDir, file.name);

                      return fullPath;
                    }
                  }
                }
              }
            } catch (subError) {

            }
          }
        }
      } catch (e) {
        // Ignore errors during recursive search

      }
    }
  }
  

  return null;
}

export function registerAddComponentTool(server: MCPServer) {
  server.registerTool({
    name: "add_component",
    description: "Add a component to a typeCAD project using the @typecad/add-component tool. This tool creates component files with proper symbol and footprint mappings, handles file location management, and provides automatic validation. USAGE BY SOURCE: 1) KiCAD: Requires only symbol (library:symbol format) - footprint is auto-discovered. 2) JLCPCB: Requires only component_number (C1234567 format) - footprint is auto-discovered. 3) Local: Requires symbol and footprint file paths - the CLI tool will attempt to locate the rest of the needed information. FEATURES: KiCAD Symbol Search with search_query parameter, Smart Error Handling with suggestions, Automatic Validation against datasheets, Enhanced Local File Support. TIP: Use search_query first to find exact names, then call again with specific parameters.", 
    inputSchema: {
      type: "object",
      properties: {
        cwd: {
          type: "string",
          description: "Current working directory where the project files are located (must be absolute path to project root, not relative). This determines where component files will be created and helps with proper import path resolution."
        },
        output_folder: { 
          type: "string", 
          description: "Output folder path (optional, relative to cwd or absolute path). If not specified, files will be created in the project root specified by cwd." 
        },
        source: {
          type: "string",
          enum: ["kicad", "local", "jlcpcb"],
          description: "REQUIRED: Component source type. Ask user: 'Which source would you like to use: kicad, local, or jlcpcb?'"
        },
        symbol: {
          type: "string",
          description: "REQUIRED for kicad: Symbol name in format 'library:symbol'. REQUIRED for local: Path to symbol file. Ask user: 'What is the symbol name (format: library:symbol)?' Example: 'MCU_Microchip_ATtiny:ATtiny3227-M'"
        },
        footprint: {
          type: "string", 
          description: "OPTIONAL for KiCAD source: Footprint name in format 'library:footprint'. REQUIRED for local: Path to footprint file. JLCPCB sources auto-discover footprints. Example: 'Package_QFN:QFN-32-1EP_5x5mm_P0.5mm_EP3.45x3.45mm'"
        },
        component_number: {
          type: "string",
          description: "REQUIRED for jlcpcb: Component number in format 'C1234567'. Ask user: 'What is the JLCPCB component number (format: C1234567)?' Example: 'C3217148'"
        },
        skip_validation: {
          type: "boolean",
          description: "Skip automatic component validation after adding (default: false)",
          default: false
        },
        search_query: {
          type: "string",
          description: "Optional: Search for components using natural language query (e.g., 'op amp', 'microcontroller', 'led'). KiCAD searches all libraries. JLCPCB searches only basic/preferred parts - specialty components need direct component numbers."
        },
        local_file: {
          type: "string",
          description: "OPTIONAL for local source: Path to local component file. The CLI tool will attempt to locate the rest of the needed information from this file."
        },
        search_filters: {
          type: "object",
          description: "Optional filters for JLCPCB search",
          properties: {
            category: { type: "string" },
            package: { type: "string" },
            manufacturer: { type: "string" },
            stock_minimum: { type: "number" },
            basic_parts: { type: "boolean" },
            price_range: {
              type: "array",
              items: { type: "number" },
              minItems: 2,
              maxItems: 2
            }
          }
        }
      },
      required: ["source"]
    }
  });

  server.on('tool_call', async ({ name, args, resolve, reject }) => {
    if (name !== 'add_component') return;
    

    
    try {
      const { cwd, output_folder, source: providedSource, symbol: providedSymbol, 
              footprint: providedFootprint, component_number: providedComponentNumber, 
              skip_validation = false, search_query, local_file, search_filters = {} } = args;
      
      // Determine working directory and output folder
      let workingDirectory = cwd ? path.resolve(cwd) : process.cwd();
      let finalOutputFolder = output_folder;
      
      // If output_folder is relative, make it relative to the working directory
      if (finalOutputFolder && !path.isAbsolute(finalOutputFolder)) {
        finalOutputFolder = path.resolve(workingDirectory, finalOutputFolder);
      }
      
      // Handle search query first if provided

      if (search_query) {
        if (providedSource === "kicad") {
          try {

            const symbolResults = await searchKiCadSymbols(search_query, 10);
            const footprintResults = await searchKiCadFootprints(search_query, 5);
            
            const searchResult = {
              query: search_query,
              source: "kicad",
              symbols: symbolResults.map(s => ({
                symbol: s.fullSymbol,
                description: s.description,
                score: s.score
              })),
              footprints: footprintResults,
              usage_instructions: [
                "To use a symbol, copy the full symbol name (e.g., 'MCU_Microchip_ATtiny:ATtiny85-20X')",
                "To use a footprint, copy the full footprint name (e.g., 'Package_DIP:DIP-8_W7.62mm')",
                "Call the add_component tool again with the exact symbol and footprint names"
              ]
            };
            
            resolve(JSON.stringify(searchResult, null, 2));
            return;
          } catch (searchError: any) {
            reject(new Error(JSON.stringify({
              error_code: "KICAD_SEARCH_FAILED",
              message: `Failed to search KiCAD components: ${searchError.message}`,
              suggestions: [
                "Ensure @typecad/kicad-symbols is installed: npm install -g @typecad/kicad-symbols",
                "Try a different search query",
                "Check that KiCAD is installed and configured"
              ]
            }, null, 2)));
            return;
          }
        } else if (providedSource === "jlcpcb") {
          try {

            
            // Import and use the JLCPCB search function directly
            const { searchJLCPCBComponents } = await import('./search_jlcpcb_components');
            
            const filters = {
              category: search_filters.category,
              package: search_filters.package,
              manufacturer: search_filters.manufacturer,
              stock_minimum: search_filters.stock_minimum,
              basic_parts: search_filters.basic_parts,
              price_range: search_filters.price_range
            };
            
            const components = await searchJLCPCBComponents(search_query, filters, 10);
            
            const mappedComponents = components.map(c => ({
              component_number: c.component_number,
              description: c.description,
              manufacturer: c.manufacturer,
              package: c.package,
              basic_part: c.basic_part,
              stock: c.stock,
              price_breaks: c.price_breaks,
              confidence_score: c.confidence_score
            }));

            const searchResult = {
              query: search_query,
              source: "jlcpcb",
              components: mappedComponents,
              filters,
              usage_instructions: components.length > 0 ? [
                "To use a component, copy the component number (e.g., 'C1234567')",
                "Call the add_component tool again with: { source: 'jlcpcb', component_number: 'C1234567' }",
                "Basic parts have lower assembly costs at JLCPCB",
                "Check stock levels before ordering"
              ] : [
                "No components found in JLCPCB's basic/preferred parts catalog",
                "The component may still be available with a specific JLCPCB component number",
                "If you have a JLCPCB component number (format: C1234567), call:",
                "{ source: 'jlcpcb', component_number: 'C1234567' }",
                "You can find component numbers by browsing JLCPCB.com or LCSC.com directly",
                "Note: JLCPCB search only includes basic and preferred parts"
              ],
              note: components.length === 0 ? "Search limited to JLCPCB basic/preferred parts. Specialty components may require direct component numbers." : undefined
            };
            
            resolve(JSON.stringify(searchResult, null, 2));
            return;
          } catch (searchError: any) {
            reject(new Error(JSON.stringify({
              error_code: "JLCPCB_SEARCH_FAILED",
              message: `Failed to search JLCPCB components: ${searchError.message}`,
              suggestions: [
                "Ensure @typecad/jlcpcb-parts is installed: npm install -g @typecad/jlcpcb-parts",
                "Try a different search query",
                "Check internet connectivity"
              ]
            }, null, 2)));
            return;
          }
        } else if (providedSource === "local") {
          try {

            
            // Import and use the local search function directly
            const { LocalComponentIndexer } = await import('./search_local_components');
            
            const indexer = new LocalComponentIndexer(workingDirectory);
            await indexer.loadIndex();
            
            // Check if index is empty and rebuild if needed
            const stats = indexer.getStats();
            if (stats.total_components === 0) {

              await indexer.scanDirectory(workingDirectory, true, ['.ts', '.js', '.json', '.kicad_sym', '.lib', '.csv']);
              await indexer.saveIndex();
            }

            const components = indexer.search(search_query, 10);
            
            const searchResult = {
              query: search_query,
              source: "local",
              components: components,
              directory: workingDirectory,
              index_stats: indexer.getStats(),
              usage_instructions: [
                "To use a local component, copy the file path",
                "Call the add_component tool again with: { source: 'local', local_file: '/path/to/component.ts' }",
                "For TypeScript components, you can import them directly",
                "Verify symbols and footprints before use"
              ]
            };
            
            resolve(JSON.stringify(searchResult, null, 2));
            return;
          } catch (searchError: any) {
            reject(new Error(JSON.stringify({
              error_code: "LOCAL_SEARCH_FAILED",
              message: `Failed to search local components: ${searchError.message}`,
              suggestions: [
                "Check that the directory exists and is readable",
                "Try indexing components first with index_local_components",
                "Verify file permissions"
              ]
            }, null, 2)));
            return;
          }
        }
      }
      
      let source = providedSource;
      let componentParams: ComponentParams = {};
      

      // Validate source is provided
      if (!source) {
        reject(new Error(JSON.stringify({
          error_code: "MISSING_SOURCE",
          message: "Source parameter is required. Please ask the user for the component source type (kicad, local, or jlcpcb) before calling this tool.",
          suggestions: [
            "Ask user: 'Which source would you like to use: kicad, local, or jlcpcb?'",
            "kicad: Use KiCAD symbol and footprint libraries (supports search_query for component discovery)",
            "local: Use local symbol and footprint files",
            "jlcpcb: Download component from JLCPCB/LCSC database"
          ]
        }, null, 2)));
        return;
      }
      
      const validSources = ["kicad", "local", "jlcpcb"];
      if (!validSources.includes(source)) {
        reject(new Error(JSON.stringify({
          error_code: "INVALID_SOURCE",
          message: `Invalid source type. Must be one of: ${validSources.join(', ')}`,
          provided_value: source,
          suggestions: [
            "Use 'kicad' for KiCAD symbol and footprint libraries",
            "Use 'local' for local symbol and footprint files",
            "Use 'jlcpcb' for JLCPCB/LCSC component database"
          ]
        }, null, 2)));
        return;
      }
      
      // Validate source-specific parameters
      if (source === "kicad") {
        if (!providedSymbol) {
          reject(new Error(JSON.stringify({
            error_code: "MISSING_SYMBOL",
            message: `KiCAD source requires only a symbol parameter (library:symbol format). Please ask the user for the symbol name.`,
            suggestions: [
              "Ask user: 'What is the symbol name (format: library:symbol)?'",
              "TIP: Use search_query parameter to find symbols (e.g., search_query: 'microcontroller')",
              "Example: 'MCU_Microchip_ATtiny:ATtiny85-20X'",
              "Example: 'Device:R' for resistor",
              "Footprint is optional - will be auto-discovered"
            ]
          }, null, 2)));
          return;
        }
        
        const symbolValidation = validateSymbolFormat(providedSymbol);
        if (!symbolValidation.valid) {
          // For KiCAD source, provide search suggestions
          let searchSuggestions: string[] = [];
          try {
            // Extract a search term from the provided symbol if possible
            const searchTerm = providedSymbol.replace(/[^a-zA-Z0-9\s]/g, ' ').trim();
            if (searchTerm) {
              const symbolResults = await searchKiCadSymbols(searchTerm, 3);
              if (symbolResults.length > 0) {
                searchSuggestions = [
                  "Suggested KiCAD symbols based on your input:",
                  ...symbolResults.map(r => `  ${r.fullSymbol} (${r.description})`)
                ];
              }
            }
          } catch (searchError) {

          }
          
          reject(new Error(JSON.stringify({
            error_code: "INVALID_SYMBOL_FORMAT",
            message: symbolValidation.error,
            provided_value: providedSymbol,
            suggestions: [...(symbolValidation.suggestions || []), ...searchSuggestions]
          }, null, 2)));
          return;
        }
        
        // For KiCAD sources, only include footprint if provided (auto-discovery handles the rest)
        componentParams = providedFootprint ? 
          { symbol: providedSymbol, footprint: providedFootprint } : 
          { symbol: providedSymbol };
        
      } else if (source === "local") {
        // For local sources, we need both symbol and footprint file paths
        if (!providedSymbol || !providedFootprint) {
          reject(new Error(JSON.stringify({
            error_code: "MISSING_LOCAL_PARAMETERS",
            message: `Local source requires both symbol and footprint file paths.`,
            suggestions: [
              "Ask user: 'What is the path to the symbol file?'",
              "Ask user: 'What is the path to the footprint file?'",
              "TIP: Use search_query parameter to find local files (e.g., search_query: 'microcontroller')",
              "Example: './symbols/mcu.kicad_sym' for symbol file",
              "Example: './footprints/mcu.pretty' for footprint file",
              "The CLI tool will attempt to locate the rest of the needed information from these files"
            ]
          }, null, 2)));
          return;
        }
        
        // For local sources, symbol and footprint parameters are file paths, not library:symbol format
        // No format validation needed for file paths
        
        componentParams = { 
          localFile: local_file,
          symbol: providedSymbol,
          footprint: providedFootprint
        };
        
      } else if (source === "jlcpcb") {
        if (!providedComponentNumber) {
          reject(new Error(JSON.stringify({
            error_code: "MISSING_COMPONENT_NUMBER",
            message: `JLCPCB source requires only a component number parameter (C1234567 format). Please ask the user for the component number.`,
            suggestions: [
              "Ask user: 'What is the JLCPCB component number (format: C1234567)?'",
              "Example: 'C1234567'",
              "Find component numbers at lcsc.com or jlcpcb.com",
              "Footprint is auto-discovered from JLCPCB database"
            ]
          }, null, 2)));
          return;
        }
        
        const componentNumberValidation = validateComponentNumber(providedComponentNumber);
        if (!componentNumberValidation.valid) {
          reject(new Error(JSON.stringify({
            error_code: "INVALID_COMPONENT_NUMBER_FORMAT",
            message: componentNumberValidation.error,
            provided_value: providedComponentNumber,
            suggestions: componentNumberValidation.suggestions
          }, null, 2)));
          return;
        }
        
        componentParams = { componentNumber: providedComponentNumber };
      }



      // Execute command

      const commandArgs = buildCommand(source, componentParams, finalOutputFolder, workingDirectory);
      const command = "npx --yes";

      




      
      try {
        // Change to the working directory before executing the command
        const originalCwd = process.cwd();

        if (workingDirectory && workingDirectory !== originalCwd) {

          process.chdir(workingDirectory);

        }
        


        
        // On Windows, use a temporary batch file to avoid command line length and escaping issues
        let stdout: string, stderr: string;
        if (process.platform === 'win32') {

          const tempBatchFile = path.join(workingDirectory, 'temp_add_component.bat');
          const fullCommand = `${command} ${commandArgs.join(' ')}`;
          
          try {
            // Create temporary batch file

            fs.writeFileSync(tempBatchFile, `@echo off\n${fullCommand}\n`);

            
            // Execute the batch file

            const { stdout: batchStdout, stderr: batchStderr } = await execAsync(`"${tempBatchFile}"`, {
              timeout: 180000,
              windowsHide: true,
              maxBuffer: 1024 * 1024,
              cwd: workingDirectory
            });

            
            stdout = batchStdout;
            stderr = batchStderr;
            
            // Clean up batch file
            try {
              fs.unlinkSync(tempBatchFile);

            } catch (cleanupError) {

            }
          } catch (batchError: any) {
            // Clean up batch file on error
            try {
              if (fs.existsSync(tempBatchFile)) {
                fs.unlinkSync(tempBatchFile);
              }
            } catch (cleanupError) {

            }
            throw batchError;
          }
        } else {
          // On non-Windows platforms, use direct execution
          const { stdout: directStdout, stderr: directStderr } = await execAsync(`${command} ${commandArgs.join(' ')}`, { 
            timeout: 180000, 
            windowsHide: true,
            maxBuffer: 1024 * 1024 // 1MB buffer
          });
          stdout = directStdout;
          stderr = directStderr;
        }
        

        
        // Restore original working directory
        if (workingDirectory && workingDirectory !== originalCwd) {
          process.chdir(originalCwd);
        }
        
        if (stderr) {

        }
        

        if (stdout) {

        }
        
        // Verify file creation before declaring success
        const expectedComponentName = extractComponentNameFromOutput(stdout);
        const searchDir = finalOutputFolder || workingDirectory;
        const actualComponentFile = expectedComponentName ? findComponentFilePath(expectedComponentName, searchDir) : null;
        
        const result: AddComponentResult = {
          command: `${command} ${commandArgs.join(' ')}`,
          exitCode: 0,
          stdout: stdout || 'Component added successfully.',
          stderr: stderr || '',
          status: actualComponentFile ? 'success' : 'warning',
          summary: actualComponentFile ? 
            `Component added successfully using ${source} source. Component file created at: ${actualComponentFile}` :
            `Component command executed successfully using ${source} source, but component file location could not be verified. Check output for actual location.`,
          interactive_workflow: {
            source_selected: source,
            parameters_collected: componentParams,
            output_folder: finalOutputFolder || workingDirectory
          },
          file_locations: {
            expected_location: expectedComponentName ? path.join(searchDir, `${expectedComponentName}.ts`) : 'Unknown',
            actual_location: actualComponentFile || 'Not found after creation',
            search_directory: searchDir
          }
        };
        
        if (!actualComponentFile && expectedComponentName) {
          result.suggestions = [
            "Component file may have been created in a different location",
            "Check the command output for the actual file path",
            "Verify the output directory is correct",
            "Component may be created with a different filename"
          ];
        }
        
        // Auto-validate the component if not skipped
        if (!skip_validation) {
          try {

            
            // Extract component name from output
            const componentName = extractComponentNameFromOutput(stdout);
            if (componentName) {
              // Find component file path
              const searchDir = finalOutputFolder || workingDirectory;
              const componentFilePath = findComponentFilePath(componentName, searchDir);
              
              // Add file location information to result
              result.file_locations = {
                expected_location: path.join(searchDir, `${componentName}.ts`),
                actual_location: componentFilePath || 'Not found',
                search_directory: searchDir
              };
              
              if (componentFilePath) {
                if (result.file_locations) {
                  result.file_locations.component_file = componentFilePath;
                }
                // Find datasheet path
                let datasheetPath = findDatasheetPath(componentName, searchDir);
                let usedPdfToText = false;
                // If datasheet is a PDF, convert to text
                if (datasheetPath && datasheetPath.toLowerCase().endsWith('.pdf')) {
                  const txtPath = datasheetPath.replace(/\.pdf$/i, '.txt');
                  // Only convert if .txt does not already exist
                  if (!fs.existsSync(txtPath)) {

                    await new Promise((resolvePdf, rejectPdf) => {
                      server.emit('tool_call', {
                        name: 'pdf_to_text',
                        args: { 
                          pdfPath: datasheetPath, 
                          txtPath: txtPath,
                          cwd: workingDirectory 
                        },
                        resolve: resolvePdf,
                        reject: rejectPdf
                      });
                    });
                  }
                  if (fs.existsSync(txtPath)) {
                    datasheetPath = txtPath;
                    usedPdfToText = true;
                  }
                }
                // Call validate_component tool
                if (datasheetPath && fs.existsSync(datasheetPath)) {
                  const validateResult = await new Promise((validateResolve, validateReject) => {
                    server.emit('tool_call', {
                      name: 'validate_component',
                      args: {
                        component_file_path: componentFilePath,
                        datasheet_path: datasheetPath,
                        auto_fix: true
                      },
                      resolve: validateResolve,
                      reject: validateReject
                    });
                  });
                  result.validation = {
                    status: 'completed',
                    component_file: componentFilePath,
                    datasheet_file: datasheetPath,
                    result: validateResult,
                    note: usedPdfToText ? 'PDF datasheet was automatically converted to text for validation.' : undefined
                  };
                } else {
                  result.validation = {
                    status: 'skipped',
                    reason: 'No datasheet found for automatic validation',
                    component_file: componentFilePath,
                    note: 'You can manually validate the component using the validate_component tool'
                  };
                }
              } else {
                result.validation = {
                  status: 'skipped',
                  reason: 'Component file not found after creation',
                  note: 'You can manually validate the component using the validate_component tool'
                };
                
                // Add suggestions for file location issues
                result.suggestions = [
                  `Check if component file was created in: ${searchDir}`,
                  "Try specifying an explicit output_folder parameter",
                  "Verify the working directory is correct",
                  "Check command output for actual file location",
                  "Use absolute paths instead of relative paths",
                  "Ensure the directory exists and is writable",
                  "Component may have been created with a different name - check for similar files"
                ];
                result.error_code = "COMPONENT_FILE_NOT_FOUND";
              }
            } else {
              result.validation = {
                status: 'skipped',
                reason: 'Could not extract component name from output',
                note: 'You can manually validate the component using the validate_component tool'
              };
            }
          } catch (validationError: any) {
            result.validation = {
              status: 'failed',
              error: validationError.message,
              note: 'You can manually validate the component using the validate_component tool'
            };
          }
        }
        
        resolve(JSON.stringify(result, null, 2));
        
      } catch (execError: any) {



        if (execError.stdout) {

        }
        if (execError.stderr) {

        }
        
        // Restore original working directory on error
        const originalCwd = process.cwd();
        if (workingDirectory && workingDirectory !== originalCwd) {
          try {
            process.chdir(originalCwd);
          } catch (e) {

          }
        }
        
        // Check for specific local file errors
        let specificSuggestions = [
          "Verify that @typecad/add-component is installed (npm install -g @typecad/add-component)",
          "Check that the working directory exists and is writable",
          "Verify symbol and footprint names are available in KiCAD libraries",
          "For JLCPCB components, verify the component number exists",
          "Check network connectivity for JLCPCB component downloads"
        ];
        
        // Add specific suggestions for local file issues
        if (source === "local" && execError.stderr && execError.stderr.includes("ENOENT")) {
          specificSuggestions = [
            "The local symbol or footprint file could not be found by the @typecad/add-component tool",
            "Try using the KiCAD source instead: { source: 'kicad', symbol: 'library:symbol' }",
            "Ensure both symbol and footprint files are in supported formats",
            "Check that both file paths are correct and accessible",
            "The CLI tool will attempt to locate the rest of the needed information from the provided files",
            "Consider copying the files to the project root directory",
            "Try using absolute paths instead of relative paths",
            "For KiCAD symbol files, try: { source: 'kicad', symbol: 'library:symbol_name' }",
            "Use search_query parameter to find available KiCAD symbols first"
          ];
        }
        
        const result: AddComponentResult = {
          command: `${command} ${commandArgs.join(' ')}`,
          exitCode: execError.code || -1,
          stdout: execError.stdout || '',
          stderr: execError.stderr || execError.message,
          status: 'error',
          summary: `Failed to add component: ${execError.message}. Working directory: ${workingDirectory}`,
          interactive_workflow: {
            source_selected: source,
            parameters_collected: componentParams,
            output_folder: finalOutputFolder || workingDirectory
          },
          error_code: "COMMAND_EXECUTION_FAILED",
          suggestions: specificSuggestions
        };
        
        reject(new Error(JSON.stringify(result, null, 2)));
      }
    } catch (error: any) {
      reject(new Error(JSON.stringify({
        error_code: "TOOL_EXECUTION_FAILED",
        message: `Tool execution failed: ${error.message}`,
        suggestions: [
          "Check that all required parameters are provided",
          "Verify file paths and permissions",
          "Ensure @typecad/add-component is installed",
          "Check console output for additional error details"
        ]
      }, null, 2)));
    }
  });
} 