import { MCPServer } from '../server';
import fetch from 'node-fetch';
import * as path from 'path';
import fs from 'node:fs';

export function registerDownloadTypeCadDocsTool(server: MCPServer) {
  server.registerTool({
    name: "download_typecad_docs",
    description: "Download the typeCAD documentation from https://typecad.net/llms-full.txt and save it to the specified directory. Requires an absolute path because the MCP server runs in the Kiro application context, not the user's project directory.",
    inputSchema: {
      type: "object",
      properties: {
        cwd: {
          type: "string",
          description: "Target directory where the file should be saved (absolute path required). Must be an existing, writable directory. This parameter is required because the MCP server runs in a different context than the user's project."
        }
      },
      required: ["cwd"]
    }
  });

  server.on('tool_call', async ({ name, args, resolve, reject }) => {
    if (name !== 'download_typecad_docs') return;
    
    try {
      const { cwd } = args;
      const requestedPath = cwd;
      
      // cwd is required - validate the provided directory
      if (!cwd) {
        reject(new Error(`Target directory (cwd) is required. The MCP server cannot determine your project directory automatically.`));
        return;
      }
      
      // Use the provided path as-is (should be absolute)
      const targetDirectory = cwd;
      
      if (!fs.existsSync(targetDirectory)) {
        reject(new Error(`Specified directory does not exist: ${targetDirectory}`));
        return;
      }
      
      const stats = fs.statSync(targetDirectory);
      if (!stats.isDirectory()) {
        reject(new Error(`Specified path is not a directory: ${targetDirectory}`));
        return;
      }
      
      // Check write permissions by attempting to create a temporary file
      try {
        const testFile = path.join(targetDirectory, '.write_test_' + Date.now());
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
      } catch (permError) {
        reject(new Error(`No write permission to directory: ${targetDirectory}`));
        return;
      }
      
      console.error(`[download_typecad_docs] Using target directory: ${targetDirectory}`);
      
      const url = 'https://typecad.net/llms-full.txt';
      
      console.error(`[download_typecad_docs] Starting download from: ${url}`);
      console.error(`[download_typecad_docs] Target directory: ${targetDirectory}`);
      
      // Download the content
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
      }
      
      console.error(`[download_typecad_docs] Download successful, processing content...`);
      
      const content = await response.text();
      
      if (!content || content.trim().length === 0) {
        throw new Error('Downloaded content is empty');
      }
      
      // Save to target directory
      const actualPath = path.join(targetDirectory, 'typecad_documentation.txt');
      
      console.error(`[download_typecad_docs] Saving ${content.length} characters to: ${actualPath}`);
      
      fs.writeFileSync(actualPath, content, 'utf8');
      
      // Return detailed response with both requested and actual paths
      const result = {
        success: true,
        message: `Successfully downloaded typeCAD documentation (${content.length} characters)`,
        requestedPath: requestedPath || 'not specified',
        actualPath: actualPath,
        fileSize: content.length
      };
      
      resolve(JSON.stringify(result, null, 2));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Provide more user-friendly error messages
      if (errorMessage.includes('ENOENT')) {
        reject(new Error(`Directory or file path error: ${errorMessage}. Please check that the directory exists and is accessible.`));
      } else if (errorMessage.includes('EACCES')) {
        reject(new Error(`Permission denied: ${errorMessage}. Please check that you have write permissions to the directory.`));
      } else {
        reject(new Error(`Failed to download typeCAD documentation: ${errorMessage}`));
      }
    }
  });
} 