import { stdin, stdout } from 'process';
import { MCPServer } from './server';

export class StdioTransport {
  private server: MCPServer;
  private buffer: string = '';

  constructor(server: MCPServer) {
    this.server = server;
  }

  start(): void {
    console.error('[StdioTransport] Server started');
    stdin.setEncoding('utf8');
    stdin.on('data', (chunk) => {
      this.buffer += chunk;
      this.processBuffer();
    });

    stdin.on('end', () => {
      process.exit(0);
    });
  }

  private processBuffer(): void {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        this.handleMessage(line);
      }
    }
  }

  private async handleMessage(message: string): Promise<void> {
    // Log incoming message
    console.error('[StdioTransport] Incoming:', message);
    let request: any;
    try {
      request = JSON.parse(message);
    } catch (error) {
      // Invalid JSON
      const errorResponse = {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error" }
      };
      this.send(errorResponse);
      // Log outgoing response
      console.error('[StdioTransport] Outgoing:', JSON.stringify(errorResponse));
      return;
    }

    if (!request || request.jsonrpc !== "2.0" || !request.method) {
      const errorResponse = {
        jsonrpc: "2.0",
        id: request?.id ?? null,
        error: { code: -32600, message: "Invalid Request" }
      };
      this.send(errorResponse);
      // Log outgoing response
      console.error('[StdioTransport] Outgoing:', JSON.stringify(errorResponse));
      return;
    }

    // If this is a notification (no id), do not send a response
    if (typeof request.id === "undefined") {
      try {
        // Handle notifications without expecting a response
        if (request.method === 'notifications/initialized') {
          // Just acknowledge the initialization notification
          console.error('[StdioTransport] Client initialized');
          return;
        }
        // For other notifications, still try to process them
        await this.server.handleRequest(request);
      } catch (error) {
        // Log error but do not send a response for notifications
        console.error('[StdioTransport] Notification error:', error);
      }
      return;
    }

    try {
      const response = await this.server.handleRequest(request);
      this.send(response);
      // Log outgoing response
      console.error('[StdioTransport] Outgoing:', JSON.stringify(response));
    } catch (error: any) {
      const errorResponse = {
        jsonrpc: "2.0",
        id: request.id ?? null,
        error: {
          code: error?.code ?? -32603,
          message: error?.message ?? "Internal error"
        }
      };
      this.send(errorResponse);
      // Log outgoing response
      console.error('[StdioTransport] Outgoing:', JSON.stringify(errorResponse));
    }
  }

  private send(data: any): void {
    stdout.write(JSON.stringify(data) + '\n');
  }
}