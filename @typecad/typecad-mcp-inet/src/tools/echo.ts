import { MCPServer } from '../server';

export function registerEchoTool(server: MCPServer) {
  server.registerTool({
    name: "echo",
    description: "Echo back the input text",
    inputSchema: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "Text to echo back"
        }
      },
      required: ["text"]
    }
  });

  server.on('tool_call', async ({ name, args, resolve, reject }) => {
    if (name !== 'echo') return;
    try {
      resolve(`Echo: ${args.text}`);
    } catch (error) {
      reject(error);
    }
  });
} 