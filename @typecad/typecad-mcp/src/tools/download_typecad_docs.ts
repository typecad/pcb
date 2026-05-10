import { MCPServer } from '../server';
import * as path from 'path';
import fs from 'node:fs';

export function registerDownloadTypeCadDocsTool(server: MCPServer) {
  server.registerTool({
    name: "download_typecad_docs",
    description: "Download the typeCAD documentation from https://typecad.net/llms-full.txt and save it to the working directory",
    inputSchema: {
      type: "object",
      properties: {
        cwd: {
          type: "string",
          description: "Current working directory where the file should be saved."
        }
      },
      required: ["cwd"]
    }
  });

  server.on('tool_call', async ({ name, args, resolve, reject }) => {
    if (name !== 'download_typecad_docs') return;
    
    try {
      const { cwd } = args;
      const url = 'https://typecad.net/llms-full.txt';
      
      console.error(`[download_typecad_docs] Downloading from: ${url}`);
      
      // Download the content
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
      }
      
      const content = await response.text();
      
      if (!content || content.trim().length === 0) {
        throw new Error('Downloaded content is empty');
      }
      
      // Save to specified absolute path
      const filePath = path.join(cwd, 'typecad_documentation.txt');
      fs.writeFileSync(filePath, content, 'utf8');
      
      const result = `Successfully downloaded typeCAD documentation (${content.length} characters) and saved to: ${filePath}`;
      
      resolve(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      reject(new Error(`Failed to download typeCAD documentation: ${errorMessage}`));
    }
  });
} 