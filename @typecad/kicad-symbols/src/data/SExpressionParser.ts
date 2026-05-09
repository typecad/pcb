/**
 * S-Expression parser for KiCad symbol files (.kicad_sym)
 * Parses the nested s-expression format used by KiCad symbol libraries
 */

/**
 * Represents a parsed s-expression token
 */
export interface SExpression {
  type: 'atom' | 'list';
  value?: string;
  children?: SExpression[];
}

/**
 * Represents a parsed KiCad symbol property
 */
export interface SymbolProperty {
  name: string;
  value: string;
  effects?: {
    font?: {
      size?: number;
    };
    hide?: boolean;
  };
}

/**
 * Represents a complete KiCad symbol definition
 */
export interface SymbolDefinition {
  name: string;
  properties: SymbolProperty[];
  description?: string;
  keywords?: string;
  library?: string;
}

/**
 * S-Expression parser for KiCad symbol files
 */
export class SExpressionParser {
  private position: number = 0;
  private content: string = '';

  /**
   * Parse a KiCad symbol file content into symbol definitions
   * @param content - The file content as a string
   * @returns Array of symbol definitions found in the file
   */
  parseSymbolFile(content: string): SymbolDefinition[] {
    this.content = content;
    this.position = 0;
    
    const rootExpression = this.parseExpression();
    if (!rootExpression || rootExpression.type !== 'list') {
      throw new Error('Invalid KiCad symbol file: Root element must be a list');
    }

    // Check if this is a kicad_symbol_lib
    if (!rootExpression.children || rootExpression.children.length === 0) {
      throw new Error('Invalid KiCad symbol file: Empty root element');
    }

    const firstChild = rootExpression.children[0];
    if (firstChild.type !== 'atom' || firstChild.value !== 'kicad_symbol_lib') {
      throw new Error('Invalid KiCad symbol file: Expected kicad_symbol_lib');
    }

    // Extract all symbol definitions
    const symbols: SymbolDefinition[] = [];
    for (const child of rootExpression.children) {
      if (child.type === 'list' && child.children && child.children.length > 0) {
        const firstToken = child.children[0];
        if (firstToken.type === 'atom' && firstToken.value === 'symbol') {
          const symbolDef = this.parseSymbolDefinition(child);
          if (symbolDef) {
            symbols.push(symbolDef);
          }
        }
      }
    }

    return symbols;
  }

  /**
   * Parse a single s-expression from the current position
   * @returns Parsed s-expression or null if end of input
   */
  private parseExpression(): SExpression | null {
    this.skipWhitespace();
    
    if (this.position >= this.content.length) {
      return null;
    }

    const char = this.content[this.position];
    
    if (char === '(') {
      return this.parseList();
    } else if (char === ')') {
      return null; // End of list
    } else {
      return this.parseAtom();
    }
  }

  /**
   * Parse a list s-expression (starts with '(')
   * @returns Parsed list expression
   */
  private parseList(): SExpression {
    this.position++; // Skip opening '('
    const children: SExpression[] = [];
    
    while (this.position < this.content.length) {
      this.skipWhitespace();
      
      if (this.position >= this.content.length) {
        throw new Error('Unexpected end of input: missing closing parenthesis');
      }
      
      if (this.content[this.position] === ')') {
        this.position++; // Skip closing ')'
        break;
      }
      
      const child = this.parseExpression();
      if (child) {
        children.push(child);
      }
    }
    
    return {
      type: 'list',
      children
    };
  }

  /**
   * Parse an atom s-expression (string or quoted string)
   * @returns Parsed atom expression
   */
  private parseAtom(): SExpression {
    this.skipWhitespace();
    
    if (this.content[this.position] === '"') {
      return this.parseQuotedString();
    } else {
      return this.parseUnquotedAtom();
    }
  }

  /**
   * Parse a quoted string atom
   * @returns Parsed quoted string
   */
  private parseQuotedString(): SExpression {
    this.position++; // Skip opening quote
    let value = '';
    
    while (this.position < this.content.length) {
      const char = this.content[this.position];
      
      if (char === '"') {
        this.position++; // Skip closing quote
        break;
      } else if (char === '\\' && this.position + 1 < this.content.length) {
        // Handle escape sequences
        this.position++;
        const nextChar = this.content[this.position];
        switch (nextChar) {
          case 'n':
            value += '\n';
            break;
          case 't':
            value += '\t';
            break;
          case 'r':
            value += '\r';
            break;
          case '\\':
            value += '\\';
            break;
          case '"':
            value += '"';
            break;
          default:
            value += nextChar;
        }
        this.position++;
      } else {
        value += char;
        this.position++;
      }
    }
    
    return {
      type: 'atom',
      value
    };
  }

  /**
   * Parse an unquoted atom
   * @returns Parsed unquoted atom
   */
  private parseUnquotedAtom(): SExpression {
    let value = '';
    
    while (this.position < this.content.length) {
      const char = this.content[this.position];
      
      if (char === '(' || char === ')' || this.isWhitespace(char)) {
        break;
      }
      
      value += char;
      this.position++;
    }
    
    return {
      type: 'atom',
      value
    };
  }

  /**
   * Parse a symbol definition from an s-expression
   * @param symbolExpr - The symbol s-expression
   * @returns Parsed symbol definition or null if invalid
   */
  private parseSymbolDefinition(symbolExpr: SExpression): SymbolDefinition | null {
    if (symbolExpr.type !== 'list' || !symbolExpr.children || symbolExpr.children.length < 2) {
      return null;
    }

    // Second element should be the symbol name
    const nameExpr = symbolExpr.children[1];
    if (nameExpr.type !== 'atom' || !nameExpr.value) {
      return null;
    }

    const symbolName = nameExpr.value;
    const properties: SymbolProperty[] = [];
    let description: string | undefined;
    let keywords: string | undefined;

    // Parse all child expressions to find properties
    for (let i = 2; i < symbolExpr.children.length; i++) {
      const child = symbolExpr.children[i];
      if (child.type === 'list' && child.children && child.children.length > 0) {
        const firstToken = child.children[0];
        
        if (firstToken.type === 'atom' && firstToken.value === 'property') {
          const property = this.parseProperty(child);
          if (property) {
            properties.push(property);
            
            // Extract description and keywords for easy access
            if (property.name === 'Description') {
              description = property.value;
            } else if (property.name === 'ki_keywords') {
              keywords = property.value;
            }
          }
        }
      }
    }

    return {
      name: symbolName,
      properties,
      description,
      keywords
    };
  }

  /**
   * Parse a property from an s-expression
   * @param propertyExpr - The property s-expression
   * @returns Parsed property or null if invalid
   */
  private parseProperty(propertyExpr: SExpression): SymbolProperty | null {
    if (propertyExpr.type !== 'list' || !propertyExpr.children || propertyExpr.children.length < 3) {
      return null;
    }

    // First element is 'property'
    // Second element is property name
    // Third element is property value
    const nameExpr = propertyExpr.children[1];
    const valueExpr = propertyExpr.children[2];

    if (nameExpr.type !== 'atom' || !nameExpr.value ||
        valueExpr.type !== 'atom' || !valueExpr.value) {
      return null;
    }

    const property: SymbolProperty = {
      name: nameExpr.value,
      value: valueExpr.value
    };

    // Parse additional property attributes if present
    for (let i = 3; i < propertyExpr.children.length; i++) {
      const child = propertyExpr.children[i];
      if (child.type === 'list' && child.children && child.children.length > 0) {
        const firstToken = child.children[0];
        if (firstToken.type === 'atom' && firstToken.value === 'effects') {
          // Property effects can include font size, hide flag, etc.
          // For now, we'll just note that effects exist
          property.effects = {};
        }
      }
    }

    return property;
  }

  /**
   * Skip whitespace characters and comments
   */
  private skipWhitespace(): void {
    while (this.position < this.content.length) {
      const char = this.content[this.position];
      
      if (this.isWhitespace(char)) {
        this.position++;
      } else if (char === ';') {
        // Skip comment line
        while (this.position < this.content.length && this.content[this.position] !== '\n') {
          this.position++;
        }
      } else {
        break;
      }
    }
  }

  /**
   * Check if character is whitespace
   * @param char - Character to check
   * @returns True if whitespace
   */
  private isWhitespace(char: string): boolean {
    return char === ' ' || char === '\t' || char === '\n' || char === '\r';
  }
}