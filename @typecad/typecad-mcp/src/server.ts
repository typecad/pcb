import { EventEmitter } from 'events';
import { MCPRequest, MCPResponse, MCPError, Tool, Resource, ServerCapabilities } from './types';

export class MCPServer extends EventEmitter {
  private tools: Map<string, Tool> = new Map();
  private resources: Map<string, Resource> = new Map();
  private capabilities: ServerCapabilities = {};

  constructor() {
    super();
    // Increase max listeners to prevent memory leak warnings
    this.setMaxListeners(50);
    this.setupDefaultCapabilities();
  }

  private setupDefaultCapabilities(): void {
    this.capabilities = {
      tools: { listChanged: true },
      resources: { subscribe: false, listChanged: true },
      prompts: { listChanged: true }
    };
  }

  // Tool management
  registerTool(tool: Tool): void {
    this.tools.set(tool.name, tool);
    this.emit('tools/list_changed');
  }

  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  listTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  // Resource management
  registerResource(resource: Resource): void {
    this.resources.set(resource.uri, resource);
    this.emit('resources/list_changed');
  }

  getResource(uri: string): Resource | undefined {
    return this.resources.get(uri);
  }

  listResources(): Resource[] {
    return Array.from(this.resources.values());
  }

  // Request handling
  async handleRequest(request: MCPRequest): Promise<MCPResponse> {
    try {
      const result = await this.processRequest(request);
      return {
        jsonrpc: "2.0",
        id: request.id,
        result
      };
    } catch (error) {
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: this.formatError(error)
      };
    }
  }

  private async processRequest(request: MCPRequest): Promise<any> {
    switch (request.method) {
      case 'initialize':
        return this.handleInitialize(request.params);
      
      case 'notifications/initialized':
        // Handle the initialized notification - no response needed
        return null;
      
      case 'tools/list':
        return { tools: this.listTools() };
      
      case 'tools/call':
        return this.handleToolCall(request.params);
      
      case 'resources/list':
        return { resources: this.listResources() };
      
      case 'resources/read':
        return this.handleResourceRead(request.params);
      
      case 'prompts/list':
        return { prompts: [] };
      
      default:
        throw new Error(`Unknown method: ${request.method}`);
    }
  }

  private handleInitialize(params: any): any {
    return {
      protocolVersion: "2024-11-05",
      capabilities: this.capabilities,
      serverInfo: {
        name: "basic-mcp-server",
        version: "1.0.0"
      }
    };
  }

  private async handleToolCall(params: any): Promise<any> {
    const { name, arguments: args } = params;
    const tool = this.getTool(name);
    
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }

    // Emit event for tool execution
    try {
      const result = await new Promise((resolve, reject) => {
        this.emit('tool_call', { name, args, resolve, reject });
      });
      return { content: [{ type: "text", text: result }] };
    } catch (err: any) {
      throw new Error(`Failed to execute tool: ${name} - ${err.message || err}`);
    }
  }

  private async handleResourceRead(params: any): Promise<any> {
    const { uri } = params;
    const resource = this.getResource(uri);
    
    if (!resource) {
      throw new Error(`Resource not found: ${uri}`);
    }

    // Emit event for resource reading
    try {
      const content = await new Promise((resolve, reject) => {
        this.emit('resource_read', { uri, resolve, reject });
      });
      return { 
        contents: [{ 
          uri, 
          mimeType: resource.mimeType || "text/plain", 
          text: content 
        }] 
      };
    } catch (err: any) {
      throw new Error(`Failed to read resource: ${uri} - ${err.message || err}`);
    }
  }

  private formatError(error: any): MCPError {
    // Log the error for debugging
    console.error('[MCPServer] Error:', error);
    return {
      code: -32603,
      message: error.message || "Internal error",
      data: error.stack
    };
  }
}