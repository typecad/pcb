export interface MCPRequest {
    jsonrpc: "2.0";
    id: string | number;
    method: string;
    params?: any;
  }
  
  export interface MCPResponse {
    jsonrpc: "2.0";
    id: string | number;
    result?: any;
    error?: MCPError;
  }
  
  export interface MCPError {
    code: number;
    message: string;
    data?: any;
  }
  
  export interface Tool {
    name: string;
    description: string;
    inputSchema: {
      type: "object";
      properties: Record<string, any>;
      required?: string[];
    };
  }
  
  export interface Resource {
    uri: string;
    name: string;
    description?: string;
    mimeType?: string;
  }
  
  export interface ServerCapabilities {
    tools?: {
      listChanged?: boolean;
    };
    resources?: {
      subscribe?: boolean;
      listChanged?: boolean;
    };
    prompts?: {
      listChanged?: boolean;
    };
  }