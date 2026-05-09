import { MCPServer } from '../server';

export function registerCreateProjectTool(server: MCPServer) {
  server.registerTool({
    name: "create_project",
    description: "Create a new typeCAD project using npx @typecad/create-typecad. Options: name (required), pio (optional, default false), git (optional, default true), board (optional), packages (optional string array)",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Project name (required)"
        },
        pio: {
          type: "boolean",
          description: "Create PlatformIO project (default: false)",
          default: false
        },
        git: {
          type: "boolean",
          description: "Initialize git repository (default: true)",
          default: true
        },
        board: {
          type: "string",
          description: "PlatformIO board (required if pio=true, default: esp32dev)",
          default: "esp32dev"
        },
        packages: {
          type: "array",
          items: { type: "string" },
          description: "List of optional packages"
        }
      },
      required: ["name"]
    }
  });

  server.on('tool_call', async ({ name, args, resolve, reject }) => {
    if (name !== 'create_project') return;
    try {
      const { name: projectName, pio = false, git = true, board, packages } = args;
      if (!projectName || typeof projectName !== 'string') {
        reject(new Error('Missing or invalid name'));
        return;
      }
      let cmd = `npx @typecad/create-typecad --name=${projectName} --pio=${pio} --git=${git}`;
      if (pio && board) {
        cmd += ` --board=${board}`;
      }
      if (Array.isArray(packages) && packages.length > 0) {
        cmd += ` --packages=${packages.join(',')}`;
      }
      const { exec } = await import('child_process');
      exec(cmd, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Failed to create project: ${stderr || error.message}`));
        } else {
          resolve(stdout || 'Project created successfully.');
        }
      });
    } catch (error) {
      reject(error);
    }
  });
} 