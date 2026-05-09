import express, { Request, Response } from 'express';
import cors from 'cors';
import { MCPServer } from './server';
import { MCPRequest } from './types';

export class HttpTransport {
  private server: MCPServer;
  private app: express.Application;
  private port: number;

  constructor(server: MCPServer, port: number = 3000) {
    this.server = server;
    this.port = port;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // Enable CORS for all routes
    this.app.use(cors({
      origin: true, // Allow all origins in development
      credentials: true,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization']
    }));

    // Parse JSON bodies
    this.app.use(express.json({ limit: '10mb' }));
    
    // Serve static files from public directory
    this.app.use(express.static('public'));
    
    // Add request logging
    this.app.use((req, res, next) => {
      console.log(`[HttpTransport] ${req.method} ${req.path}`);
      next();
    });
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // MCP endpoint - handles all MCP requests
    this.app.post('/mcp', async (req: Request, res: Response) => {
      try {
        const request: MCPRequest = req.body;
        
        // Validate basic MCP request structure
        if (!request || request.jsonrpc !== "2.0" || !request.method) {
          return res.status(400).json({
            jsonrpc: "2.0",
            id: request?.id ?? null,
            error: { code: -32600, message: "Invalid Request" }
          });
        }

        console.log(`[HttpTransport] Processing MCP request: ${request.method}`);
        
        // Handle the request
        const response = await this.server.handleRequest(request);
        
        // Send response
        res.json(response);
        
      } catch (error: any) {
        console.error('[HttpTransport] Error processing request:', error);
        
        const errorResponse = {
          jsonrpc: "2.0",
          id: req.body?.id ?? null,
          error: {
            code: error?.code ?? -32603,
            message: error?.message ?? "Internal error"
          }
        };
        
        res.status(500).json(errorResponse);
      }
    });

    // Serve basic info about available tools
    this.app.get('/tools', (req: Request, res: Response) => {
      const tools = this.server.listTools();
      res.json({
        tools: tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema
        }))
      });
    });

    // Serve basic info about available resources
    this.app.get('/resources', (req: Request, res: Response) => {
      const resources = this.server.listResources();
      res.json({
        resources: resources.map(resource => ({
          uri: resource.uri,
          name: resource.name,
          description: resource.description,
          mimeType: resource.mimeType
        }))
      });
    });

    // 404 handler
    this.app.use((req: Request, res: Response) => {
      res.status(404).json({ error: 'Not found' });
    });
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.app.listen(this.port, () => {
        console.log(`[HttpTransport] MCP Server running on http://localhost:${this.port}`);
        console.log(`[HttpTransport] Health check: http://localhost:${this.port}/health`);
        console.log(`[HttpTransport] MCP endpoint: http://localhost:${this.port}/mcp`);
        console.log(`[HttpTransport] Tools info: http://localhost:${this.port}/tools`);
        resolve();
      });
    });
  }
}