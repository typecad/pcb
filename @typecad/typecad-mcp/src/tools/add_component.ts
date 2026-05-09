import { MCPServer } from '../server';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

interface ComponentParams {
  symbol?: string;
  footprint?: string;
  componentNumber?: string;
}

interface FileCreationResult {
  success: boolean;
  actualPath?: string;
  expectedPath?: string;
  error?: string;
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
  project_context: {
    working_directory: string;
    project_structure: {
      hasTypeCadProject: boolean;
      srcDir?: string;
      projectRoot: string;
    };
    output_folder_used: string;
    output_folder_source: 'provided' | 'auto-detected-src' | 'auto-detected-root';
  };
  interactive_workflow: {
    source_selected: string;
    parameters_collected: ComponentParams;
  };
  file_creation: FileCreationResult;
  validation?: ValidationInfo;
}

function validateSymbolFormat(symbol: string): boolean {
  return symbol.includes(':') && symbol.split(':').length === 2;
}

function validateFootprintFormat(footprint: string): boolean {
  return footprint.includes(':') && footprint.split(':').length === 2;
}

function validateComponentNumber(componentNumber: string): boolean {
  return /^C\d+$/.test(componentNumber);
}

function detectProjectStructure(cwd: string): { hasTypeCadProject: boolean, srcDir?: string, projectRoot: string } {
  const projectRoot = cwd;
  
  // Check for package.json or tsconfig.json to identify project root
  const hasPackageJson = fs.existsSync(path.join(projectRoot, 'package.json'));
  const hasTsConfig = fs.existsSync(path.join(projectRoot, 'tsconfig.json'));
  const hasTypeCadProject = hasPackageJson || hasTsConfig;
  
  // Look for src directory
  const srcDir = path.join(projectRoot, 'src');
  const hasSrcDir = fs.existsSync(srcDir);
  
  return {
    hasTypeCadProject,
    srcDir: hasSrcDir ? srcDir : undefined,
    projectRoot
  };
}

function buildCommand(source: string, params: ComponentParams, outputFolder: string, cwd?: string): string[] {
  const baseCmd = ["@typecad/add-component"];
  
  switch(source) {
    case "kicad":
      baseCmd.push("--kicad=true", `--symbol=${params.symbol}`, `--footprint=${params.footprint}`);
      break;
    case "local":
      baseCmd.push("--local=true", `--symbol=${params.symbol}`, `--footprint=${params.footprint}`);
      break;
    case "jlcpcb":
      baseCmd.push("--jlcpcb=true", `--c=${params.componentNumber}`);
      break;
  }
  
  // Always include the folder parameter - it's now required
  baseCmd.push(`--folder=${outputFolder}`);
  
  return baseCmd;
}

function determineOptimalOutputFolder(cwd: string, providedOutputFolder?: string): string {
  if (providedOutputFolder) {
    // Decode URL-encoded paths
    let decodedOutputFolder = decodeURIComponent(providedOutputFolder);
    
    // Normalize Windows paths (handle /c:/path -> c:/path)
    if (process.platform === 'win32' && decodedOutputFolder.match(/^\/[a-zA-Z]:/)) {
      decodedOutputFolder = decodedOutputFolder.substring(1);
    }
    
    // If provided as absolute path, use as-is; if relative, resolve from cwd
    if (path.isAbsolute(decodedOutputFolder)) {
      return decodedOutputFolder;
    } else {
      return path.resolve(cwd, decodedOutputFolder);
    }
  }
  
  const projectStructure = detectProjectStructure(cwd);
  
  if (projectStructure.hasTypeCadProject && projectStructure.srcDir) {
    // If there's a src directory, use it
    return projectStructure.srcDir;
  } else {
    // Default to the project root
    return projectStructure.projectRoot;
  }
}

function validateFileCreation(expectedPath: string, componentName: string, outputFolder: string): FileCreationResult {
  // Check if file exists at expected location
  if (fs.existsSync(expectedPath)) {
    return {
      success: true,
      actualPath: expectedPath,
      expectedPath: expectedPath
    };
  }
  
  // Search for the file in common locations
  const searchLocations = [
    outputFolder,
    path.join(outputFolder, 'src'),
    path.dirname(outputFolder),
    process.cwd()
  ];
  
  const possibleNames = [
    `${componentName}.ts`,
    `${componentName.replace(/[^a-zA-Z0-9]/g, '_')}.ts`,
    `${componentName.replace(/[^a-zA-Z0-9]/g, '')}.ts`
  ];
  
  for (const location of searchLocations) {
    for (const fileName of possibleNames) {
      const filePath = path.join(location, fileName);
      if (fs.existsSync(filePath)) {
        return {
          success: true,
          actualPath: filePath,
          expectedPath: expectedPath,
          error: `File created at unexpected location: ${filePath} instead of ${expectedPath}`
        };
      }
    }
  }
  
  return {
    success: false,
    expectedPath: expectedPath,
    error: `Component file not found after creation. Expected at: ${expectedPath}`
  };
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

function findComponentFilePath(componentName: string, outputFolder?: string): string | null {
  const baseDir = outputFolder || process.cwd();
  const srcDir = path.join(baseDir, 'src');
  
  // Try different possible file names
  const possibleNames = [
    `${componentName}.ts`,
    `${componentName.replace(/[^a-zA-Z0-9]/g, '_')}.ts`,
    `${componentName.replace(/[^a-zA-Z0-9]/g, '')}.ts`
  ];
  
  for (const fileName of possibleNames) {
    const filePath = path.join(srcDir, fileName);
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }
  
  // If not found in src, check the base directory
  for (const fileName of possibleNames) {
    const filePath = path.join(baseDir, fileName);
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }
  
  return null;
}

function findDatasheetPath(componentName: string, outputFolder?: string): string | null {
  const baseDir = outputFolder || process.cwd();
  
  // Common datasheet locations and patterns
  const searchPaths = [
    path.join(baseDir, 'datasheets'),
    path.join(baseDir, 'docs'),
    path.join(baseDir, 'datasheet'),
    baseDir
  ];
  
  const searchPatterns = [
    `${componentName}.pdf`,
    `${componentName}.txt`,
    `${componentName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
    `${componentName.replace(/[^a-zA-Z0-9]/g, '_')}.txt`,
    `${componentName.replace(/[^a-zA-Z0-9]/g, '')}.pdf`,
    `${componentName.replace(/[^a-zA-Z0-9]/g, '')}.txt`
  ];
  
  for (const searchPath of searchPaths) {
    if (fs.existsSync(searchPath)) {
      for (const pattern of searchPatterns) {
        const filePath = path.join(searchPath, pattern);
        if (fs.existsSync(filePath)) {
          return filePath;
        }
      }
    }
  }
  
  return null;
}

export function registerAddComponentTool(server: MCPServer) {
  server.registerTool({
    name: "add_component",
    description: "Add a component to a typeCAD project using the @typecad/add-component tool. This enhanced version provides better file placement, error handling, and project context awareness. IMPORTANT: Before calling this tool, you must collect all required information from the user. For KiCAD/Local sources, you need symbol (library:symbol format) and footprint (library:footprint format). For JLCPCB source, you need component_number (C1234567 format). STRONGLY RECOMMENDED: provide the absolute path to the project directory as 'cwd' for reliable file placement. The tool will automatically detect the optimal file location based on project structure.",
    inputSchema: {
      type: "object",
      properties: {
        cwd: { 
          type: "string", 
          description: "Current working directory (absolute path to project root, not relative). STRONGLY RECOMMENDED for reliable file placement. If not provided, will use process.cwd() which may result in files being created in unexpected locations." 
        },
        output_folder: { 
          type: "string", 
          description: "Output folder path (optional). Can be relative to cwd or absolute. If not provided, tool will auto-detect optimal location based on project structure (src/ directory if exists, otherwise project root)." 
        },
        source: {
          type: "string",
          enum: ["kicad", "local", "jlcpcb"],
          description: "REQUIRED: Component source type. Ask user: 'Which source would you like to use: kicad, local, or jlcpcb?'"
        },
        symbol: {
          type: "string",
          description: "REQUIRED for kicad/local: Symbol name in format 'library:symbol'. Ask user: 'What is the symbol name (format: library:symbol)?' Example: 'MCU_Microchip_ATtiny:ATtiny3227-M'"
        },
        footprint: {
          type: "string", 
          description: "REQUIRED for kicad/local: Footprint name in format 'library:footprint'. Ask user: 'What is the footprint name (format: library:footprint)?' Example: 'Package_QFN:QFN-32-1EP_5x5mm_P0.5mm_EP3.45x3.45mm'"
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
        validate_before_creation: {
          type: "boolean",
          description: "Pre-validate symbol and footprint combinations before attempting creation (default: true)",
          default: true
        }
      },
      required: ["source"]
    }
  });

  server.on('tool_call', async ({ name, args, resolve, reject }) => {
    if (name !== 'add_component') return;
    
    try {
      const { 
        cwd: providedCwd, 
        output_folder, 
        source: providedSource, 
        symbol: providedSymbol, 
        footprint: providedFootprint, 
        component_number: providedComponentNumber, 
        skip_validation = false,
        validate_before_creation = true 
      } = args;
      
      // Determine working directory with smart defaults
      let workingDirectory: string;
      
      if (providedCwd) {
        // Decode URL-encoded paths (handle cases like c%3A/path -> c:/path)
        workingDirectory = decodeURIComponent(providedCwd);
        
        // Normalize Windows paths (handle /c:/path -> c:/path)
        if (process.platform === 'win32' && workingDirectory.match(/^\/[a-zA-Z]:/)) {
          workingDirectory = workingDirectory.substring(1); // Remove leading slash
        }
        
        // Validate that cwd is an absolute path
        if (!path.isAbsolute(workingDirectory)) {
          reject(new Error(`cwd must be an absolute path to the project directory. Received: "${workingDirectory}" (original: "${providedCwd}"). Please pass the full project path instead of a relative path.`));
          return;
        }
        
        // Validate that cwd exists
        if (!fs.existsSync(workingDirectory)) {
          reject(new Error(`Specified working directory does not exist: ${workingDirectory}`));
          return;
        }
      } else {
        // Fallback to process.cwd() but issue a warning
        workingDirectory = process.cwd();
        console.error(`WARNING: cwd parameter not provided. Using process.cwd(): ${workingDirectory}`);
        console.error(`WARNING: For reliable file placement, please provide the absolute path to your project directory via the 'cwd' parameter.`);
        console.error(`Current process details: PID=${process.pid}, Platform=${process.platform}`);
        console.error(`Environment CWD indicators: PWD=${process.env.PWD || 'undefined'}, INIT_CWD=${process.env.INIT_CWD || 'undefined'}`);
        
        // Try to detect if this looks like a reasonable project directory
        const hasPackageJson = fs.existsSync(path.join(workingDirectory, 'package.json'));
        const hasTsConfig = fs.existsSync(path.join(workingDirectory, 'tsconfig.json'));
        const hasSrcDir = fs.existsSync(path.join(workingDirectory, 'src'));
        
        console.error(`Project detection: package.json=${hasPackageJson}, tsconfig.json=${hasTsConfig}, src/=${hasSrcDir}`);
        
        if (!hasPackageJson && !hasTsConfig && !hasSrcDir) {
          console.error(`WARNING: Current directory (${workingDirectory}) doesn't appear to be a TypeCAD project. Component may be created in unexpected location.`);
          
          // Try to find a reasonable TypeCAD project directory in common locations
          const potentialDirs = [
            path.join(workingDirectory, '..'),
            path.join(workingDirectory, '../..'),
            process.env.INIT_CWD || workingDirectory
          ];
          
          for (const dir of potentialDirs) {
            if (fs.existsSync(dir)) {
              const dirHasPackageJson = fs.existsSync(path.join(dir, 'package.json'));
              const dirHasTsConfig = fs.existsSync(path.join(dir, 'tsconfig.json'));
              const dirHasSrcDir = fs.existsSync(path.join(dir, 'src'));
              
              if (dirHasPackageJson || dirHasTsConfig || dirHasSrcDir) {
                console.error(`SUGGESTION: Consider using '${dir}' as cwd (has project indicators)`);
                break;
              }
            }
          }
        }
      }
      
      // Detect project structure and determine optimal output folder
      const projectStructure = detectProjectStructure(workingDirectory);
      const finalOutputFolder = determineOptimalOutputFolder(workingDirectory, output_folder);
      
      let source = providedSource;
      let componentParams: ComponentParams = {};
      
      // Validate source is provided
      if (!source) {
        reject(new Error(`Source parameter is required. Please ask the user for the component source type (kicad, local, or jlcpcb) before calling this tool.`));
        return;
      }
      
      const validSources = ["kicad", "local", "jlcpcb"];
      if (!validSources.includes(source)) {
        reject(new Error(`Invalid source type. Must be one of: ${validSources.join(', ')}`));
        return;
      }
      
      // Validate source-specific parameters
      if (source === "kicad" || source === "local") {
        if (!providedSymbol) {
          reject(new Error(`Symbol parameter is required for ${source} source. Please ask the user for the symbol name (format: library:symbol) before calling this tool.`));
          return;
        }
        
        if (!validateSymbolFormat(providedSymbol)) {
          reject(new Error("Invalid symbol format. Must be 'library:symbol'"));
          return;
        }
        
        if (!providedFootprint) {
          reject(new Error(`Footprint parameter is required for ${source} source. Please ask the user for the footprint name (format: library:footprint) before calling this tool.`));
          return;
        }
        
        if (!validateFootprintFormat(providedFootprint)) {
          reject(new Error("Invalid footprint format. Must be 'library:footprint'"));
          return;
        }
        
        componentParams = { symbol: providedSymbol, footprint: providedFootprint };
        
      } else if (source === "jlcpcb") {
        if (!providedComponentNumber) {
          reject(new Error(`Component number parameter is required for jlcpcb source. Please ask the user for the component number (format: C1234567) before calling this tool.`));
          return;
        }
        
        if (!validateComponentNumber(providedComponentNumber)) {
          reject(new Error("Invalid component number format. Must start with 'C' followed by numbers"));
          return;
        }
        
        componentParams = { componentNumber: providedComponentNumber };
      }
      
      // Create output directory if it doesn't exist
      if (!fs.existsSync(finalOutputFolder)) {
        try {
          fs.mkdirSync(finalOutputFolder, { recursive: true });
          console.error(`Created output directory: ${finalOutputFolder}`);
        } catch (mkdirError: any) {
          reject(new Error(`Failed to create output directory ${finalOutputFolder}: ${mkdirError.message}`));
          return;
        }
      }
      
      // Execute command
      const commandArgs = buildCommand(source, componentParams, finalOutputFolder, workingDirectory);
      const command = "npx";
      
      console.error(`Executing: ${command} ${commandArgs.join(' ')}`);
      console.error(`Working directory: ${workingDirectory}`);
      console.error(`Output folder: ${finalOutputFolder}`);
      console.error(`Project structure detected: ${JSON.stringify(projectStructure)}`);
      
      try {
        const execOptions = {
          cwd: workingDirectory,
          timeout: 60000, // 60 second timeout
          env: { ...process.env, FORCE_COLOR: '0' } // Disable colored output
        };
        
        console.error(`Final command args: ${commandArgs.join(' ')}`);
        
        const { stdout, stderr } = await execAsync(`${command} ${commandArgs.join(' ')}`, execOptions);
        
        if (stderr) {
          console.error('Command stderr:', stderr);
        }
        
        // Determine output folder source
        let outputFolderSource: 'provided' | 'auto-detected-src' | 'auto-detected-root';
        if (output_folder) {
          outputFolderSource = 'provided';
        } else if (projectStructure.srcDir && finalOutputFolder === projectStructure.srcDir) {
          outputFolderSource = 'auto-detected-src';
        } else {
          outputFolderSource = 'auto-detected-root';
        }
        
        // Extract component name and validate file creation
        const componentName = extractComponentNameFromOutput(stdout);
        let fileCreationResult: FileCreationResult;
        
        if (componentName) {
          const expectedPath = path.join(finalOutputFolder, `${componentName}.ts`);
          fileCreationResult = validateFileCreation(expectedPath, componentName, finalOutputFolder);
        } else {
          fileCreationResult = {
            success: false,
            error: "Could not extract component name from command output"
          };
        }
        
        const result: AddComponentResult = {
          command: `${command} ${commandArgs.join(' ')}`,
          exitCode: 0,
          stdout: stdout || 'Component added successfully.',
          stderr: stderr || '',
          status: fileCreationResult.success ? 'success' : 'warning',
          summary: fileCreationResult.success 
            ? `Component added successfully using ${source} source.` 
            : `Component command executed but file creation validation failed: ${fileCreationResult.error}`,
          project_context: {
            working_directory: workingDirectory,
            project_structure: projectStructure,
            output_folder_used: finalOutputFolder,
            output_folder_source: outputFolderSource
          },
          interactive_workflow: {
            source_selected: source,
            parameters_collected: componentParams
          },
          file_creation: fileCreationResult
        };
        
        // Auto-validate the component if not skipped and file was created successfully
        if (!skip_validation && fileCreationResult.success && fileCreationResult.actualPath) {
          try {
            console.error('Starting automatic component validation...');
            
            if (componentName && fileCreationResult.actualPath) {
              const componentFilePath = fileCreationResult.actualPath;
              
              // Find datasheet path
              let datasheetPath = findDatasheetPath(componentName, path.dirname(componentFilePath));
              let usedPdfToText = false;
              
              // If datasheet is a PDF, convert to text
              if (datasheetPath && datasheetPath.toLowerCase().endsWith('.pdf')) {
                const txtPath = datasheetPath.replace(/\.pdf$/i, '.txt');
                // Only convert if .txt does not already exist
                if (!fs.existsSync(txtPath)) {
                  console.error(`Converting PDF datasheet to text: ${datasheetPath} -> ${txtPath}`);
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
                reason: 'Component name or file path not available',
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
        // Determine output folder source for error case
        let outputFolderSource: 'provided' | 'auto-detected-src' | 'auto-detected-root';
        if (output_folder) {
          outputFolderSource = 'provided';
        } else if (projectStructure.srcDir && finalOutputFolder === projectStructure.srcDir) {
          outputFolderSource = 'auto-detected-src';
        } else {
          outputFolderSource = 'auto-detected-root';
        }
        
        const result: AddComponentResult = {
          command: `${command} ${commandArgs.join(' ')}`,
          exitCode: execError.code || -1,
          stdout: execError.stdout || '',
          stderr: execError.stderr || execError.message,
          status: 'error',
          summary: `Failed to add component: ${execError.message}`,
          project_context: {
            working_directory: workingDirectory,
            project_structure: projectStructure,
            output_folder_used: finalOutputFolder,
            output_folder_source: outputFolderSource
          },
          interactive_workflow: {
            source_selected: source,
            parameters_collected: componentParams
          },
          file_creation: {
            success: false,
            error: `Command execution failed: ${execError.message}`
          }
        };
        
        reject(new Error(JSON.stringify(result, null, 2)));
      }
      
    } catch (error: any) {
      reject(new Error(`Tool execution failed: ${error.message}`));
    }
  });
} 