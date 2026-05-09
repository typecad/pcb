/**
 * Base class for all TypeCAD wiring errors
 */
export class TypeCadWiringError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'TypeCadWiringError';
      
      // This line is needed to properly capture the stack trace in TypeScript
      Object.setPrototypeOf(this, TypeCadWiringError.prototype);
    }
  }
  
  /**
   * Error thrown when a connector-related operation fails
   */
  export class ConnectorError extends TypeCadWiringError {
    connectorName: string;
  
    constructor(message: string, connectorName: string) {
      super(`Connector '${connectorName}': ${message}`);
      this.name = 'ConnectorError';
      this.connectorName = connectorName;
      
      Object.setPrototypeOf(this, ConnectorError.prototype);
    }
  }
  
  /**
   * Error thrown when a pin-related operation fails
   */
  export class PinError extends TypeCadWiringError {
    connectorName: string;
    pinNumber: number;
  
    constructor(message: string, connectorName: string, pinNumber: number) {
      super(`Pin ${pinNumber} on connector '${connectorName}': ${message}`);
      this.name = 'PinError';
      this.connectorName = connectorName;
      this.pinNumber = pinNumber;
      
      Object.setPrototypeOf(this, PinError.prototype);
    }
  }
  
  /**
   * Error thrown when a cable-related operation fails
   */
  export class CableError extends TypeCadWiringError {
    cableName: string;
  
    constructor(message: string, cableName: string) {
      super(`Cable '${cableName}': ${message}`);
      this.name = 'CableError';
      this.cableName = cableName;
      
      Object.setPrototypeOf(this, CableError.prototype);
    }
  }
  
  /**
   * Error thrown when an operation related to a net in a cable fails
   */
  export class NetError extends TypeCadWiringError {
    cableName: string;
    netIndex?: number;
  
    constructor(message: string, cableName: string, netIndex?: number) {
      const indexInfo = netIndex !== undefined ? ` (net #${netIndex + 1})` : '';
      super(`Cable '${cableName}'${indexInfo}: ${message}`);
      this.name = 'NetError';
      this.cableName = cableName;
      this.netIndex = netIndex;
      
      Object.setPrototypeOf(this, NetError.prototype);
    }
  }
  
  /**
   * Error thrown when a wiring diagram generation or file operation fails
   */
  export class DiagramError extends TypeCadWiringError {
    fileName?: string;
  
    constructor(message: string, fileName?: string) {
      const fileInfo = fileName ? ` for file '${fileName}'` : '';
      super(`Diagram generation error${fileInfo}: ${message}`);
      this.name = 'DiagramError';
      this.fileName = fileName;
      
      Object.setPrototypeOf(this, DiagramError.prototype);
    }
  }
  
  /**
   * Error thrown when a Bill of Materials (BOM) generation fails
   */
  export class BomError extends TypeCadWiringError {
    fileName?: string;
  
    constructor(message: string, fileName?: string) {
      const fileInfo = fileName ? ` for file '${fileName}'` : '';
      super(`BOM generation error${fileInfo}: ${message}`);
      this.name = 'BomError';
      this.fileName = fileName;
      
      Object.setPrototypeOf(this, BomError.prototype);
    }
  }
  
  /**
   * Error thrown when a validation fails
   */
  export class ValidationError extends TypeCadWiringError {
    constructor(message: string) {
      super(`Validation error: ${message}`);
      this.name = 'ValidationError';
      
      Object.setPrototypeOf(this, ValidationError.prototype);
    }
  }