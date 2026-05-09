import fetch from 'node-fetch';

interface MCPRequest {
  jsonrpc: string;
  id: string | number;
  method: string;
  params?: any;
}

interface MCPResponse {
  jsonrpc: string;
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export class WebMCPClient {
  private baseUrl: string;
  private requestId: number = 1;

  constructor(baseUrl: string = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }

  private async sendRequest(method: string, params?: any): Promise<any> {
    const request: MCPRequest = {
      jsonrpc: "2.0",
      id: this.requestId++,
      method,
      params
    };

    try {
      const response = await fetch(`${this.baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const mcpResponse: MCPResponse = await response.json() as MCPResponse;

      if (mcpResponse.error) {
        throw new Error(`MCP Error ${mcpResponse.error.code}: ${mcpResponse.error.message}`);
      }

      return mcpResponse.result;
    } catch (error) {
      console.error('Request failed:', error);
      throw error;
    }
  }

  // Initialize the MCP session
  async initialize(): Promise<any> {
    return this.sendRequest('initialize', {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "web-mcp-client",
        version: "1.0.0"
      }
    });
  }

  // List available tools
  async listTools(): Promise<any> {
    return this.sendRequest('tools/list');
  }

  // Call a tool
  async callTool(name: string, args: any = {}): Promise<any> {
    return this.sendRequest('tools/call', {
      name,
      arguments: args
    });
  }

  // List available resources
  async listResources(): Promise<any> {
    return this.sendRequest('resources/list');
  }

  // Read a resource
  async readResource(uri: string): Promise<any> {
    return this.sendRequest('resources/read', { uri });
  }

  // Health check (direct HTTP endpoint)
  async healthCheck(): Promise<any> {
    const response = await fetch(`${this.baseUrl}/health`);
    return response.json();
  }

  // Get tools info (direct HTTP endpoint)
  async getToolsInfo(): Promise<any> {
    const response = await fetch(`${this.baseUrl}/tools`);
    return response.json();
  }
}

// Example usage
async function example() {
  const client = new WebMCPClient('http://localhost:3000');

  try {
    // Health check
    console.log('Health check:', await client.healthCheck());

    // Initialize MCP session
    console.log('Initialize:', await client.initialize());

    // List tools
    console.log('Available tools:', await client.listTools());

    // Test echo tool
    const echoResult = await client.callTool('mcp_typecad_mcp_echo', { text: 'Hello from web client!' });
    console.log('Echo result:', echoResult);

    // Get tools info via direct endpoint
    console.log('Tools info:', await client.getToolsInfo());

  } catch (error) {
    console.error('Example failed:', error);
  }
}

// Run example if this file is executed directly
if (require.main === module) {
  example();
}