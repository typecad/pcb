import { spawn } from 'child_process';

class MCPClient {
  private process: any;
  private requestId = 1;

  constructor(serverPath: string) {
    this.process = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.process.stdout.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line.trim()) {
          try {
            const response = JSON.parse(line);
            console.log('Server response:', JSON.stringify(response, null, 2));
          } catch (error) {
            console.error('Failed to parse response:', line);
          }
        }
      }
    });

    this.process.stderr.on('data', (data: Buffer) => {
      console.error('Server stderr:', data.toString());
    });
  }

  async sendRequest(method: string, params?: any): Promise<void> {
    const request = {
      jsonrpc: "2.0",
      id: this.requestId++,
      method,
      params
    };

    this.process.stdin.write(JSON.stringify(request) + '\n');
  }

  async close(): Promise<void> {
    this.process.kill();
  }
}

// Example usage
async function main() {
  const client = new MCPClient('./dist/index.js');

  // Initialize
  await client.sendRequest('initialize', {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "test-client", version: "1.0.0" }
  });

  // List tools
  await client.sendRequest('tools/list');

  // Call a tool
  await client.sendRequest('tools/call', {
    name: 'echo',
    arguments: { text: 'Hello, MCP!' }
  });

  // List resources
  await client.sendRequest('resources/list');

  // Read a resource
  await client.sendRequest('resources/read', {
    uri: 'file://example.txt'
  });

  setTimeout(() => {
    client.close();
  }, 1000);
}

if (require.main === module) {
  main().catch(console.error);
}