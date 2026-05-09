"use strict";
/**
 * S-Expression parser for KiCad symbol files (.kicad_sym)
 * Parses the nested s-expression format used by KiCad symbol libraries
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SExpressionParser = void 0;
/**
 * S-Expression parser for KiCad symbol files
 */
var SExpressionParser = /** @class */ (function () {
    function SExpressionParser() {
        this.position = 0;
        this.content = '';
    }
    /**
     * Parse a KiCad symbol file content into symbol definitions
     * @param content - The file content as a string
     * @returns Array of symbol definitions found in the file
     */
    SExpressionParser.prototype.parseSymbolFile = function (content) {
        this.content = content;
        this.position = 0;
        var rootExpression = this.parseExpression();
        if (!rootExpression || rootExpression.type !== 'list') {
            throw new Error('Invalid KiCad symbol file: Root element must be a list');
        }
        // Check if this is a kicad_symbol_lib
        if (!rootExpression.children || rootExpression.children.length === 0) {
            throw new Error('Invalid KiCad symbol file: Empty root element');
        }
        var firstChild = rootExpression.children[0];
        if (firstChild.type !== 'atom' || firstChild.value !== 'kicad_symbol_lib') {
            throw new Error('Invalid KiCad symbol file: Expected kicad_symbol_lib');
        }
        // Extract all symbol definitions
        var symbols = [];
        for (var _i = 0, _a = rootExpression.children; _i < _a.length; _i++) {
            var child = _a[_i];
            if (child.type === 'list' && child.children && child.children.length > 0) {
                var firstToken = child.children[0];
                if (firstToken.type === 'atom' && firstToken.value === 'symbol') {
                    var symbolDef = this.parseSymbolDefinition(child);
                    if (symbolDef) {
                        symbols.push(symbolDef);
                    }
                }
            }
        }
        return symbols;
    };
    /**
     * Parse a single s-expression from the current position
     * @returns Parsed s-expression or null if end of input
     */
    SExpressionParser.prototype.parseExpression = function () {
        this.skipWhitespace();
        if (this.position >= this.content.length) {
            return null;
        }
        var char = this.content[this.position];
        if (char === '(') {
            return this.parseList();
        }
        else if (char === ')') {
            return null; // End of list
        }
        else {
            return this.parseAtom();
        }
    };
    /**
     * Parse a list s-expression (starts with '(')
     * @returns Parsed list expression
     */
    SExpressionParser.prototype.parseList = function () {
        this.position++; // Skip opening '('
        var children = [];
        while (this.position < this.content.length) {
            this.skipWhitespace();
            if (this.position >= this.content.length) {
                throw new Error('Unexpected end of input: missing closing parenthesis');
            }
            if (this.content[this.position] === ')') {
                this.position++; // Skip closing ')'
                break;
            }
            var child = this.parseExpression();
            if (child) {
                children.push(child);
            }
        }
        return {
            type: 'list',
            children: children
        };
    };
    /**
     * Parse an atom s-expression (string or quoted string)
     * @returns Parsed atom expression
     */
    SExpressionParser.prototype.parseAtom = function () {
        this.skipWhitespace();
        if (this.content[this.position] === '"') {
            return this.parseQuotedString();
        }
        else {
            return this.parseUnquotedAtom();
        }
    };
    /**
     * Parse a quoted string atom
     * @returns Parsed quoted string
     */
    SExpressionParser.prototype.parseQuotedString = function () {
        this.position++; // Skip opening quote
        var value = '';
        while (this.position < this.content.length) {
            var char = this.content[this.position];
            if (char === '"') {
                this.position++; // Skip closing quote
                break;
            }
            else if (char === '\\' && this.position + 1 < this.content.length) {
                // Handle escape sequences
                this.position++;
                var nextChar = this.content[this.position];
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
            }
            else {
                value += char;
                this.position++;
            }
        }
        return {
            type: 'atom',
            value: value
        };
    };
    /**
     * Parse an unquoted atom
     * @returns Parsed unquoted atom
     */
    SExpressionParser.prototype.parseUnquotedAtom = function () {
        var value = '';
        while (this.position < this.content.length) {
            var char = this.content[this.position];
            if (char === '(' || char === ')' || this.isWhitespace(char)) {
                break;
            }
            value += char;
            this.position++;
        }
        return {
            type: 'atom',
            value: value
        };
    };
    /**
     * Parse a symbol definition from an s-expression
     * @param symbolExpr - The symbol s-expression
     * @returns Parsed symbol definition or null if invalid
     */
    SExpressionParser.prototype.parseSymbolDefinition = function (symbolExpr) {
        if (symbolExpr.type !== 'list' || !symbolExpr.children || symbolExpr.children.length < 2) {
            return null;
        }
        // Second element should be the symbol name
        var nameExpr = symbolExpr.children[1];
        if (nameExpr.type !== 'atom' || !nameExpr.value) {
            return null;
        }
        var symbolName = nameExpr.value;
        var properties = [];
        var description;
        var keywords;
        // Parse all child expressions to find properties
        for (var i = 2; i < symbolExpr.children.length; i++) {
            var child = symbolExpr.children[i];
            if (child.type === 'list' && child.children && child.children.length > 0) {
                var firstToken = child.children[0];
                if (firstToken.type === 'atom' && firstToken.value === 'property') {
                    var property = this.parseProperty(child);
                    if (property) {
                        properties.push(property);
                        // Extract description and keywords for easy access
                        if (property.name === 'Description') {
                            description = property.value;
                        }
                        else if (property.name === 'ki_keywords') {
                            keywords = property.value;
                        }
                    }
                }
            }
        }
        return {
            name: symbolName,
            properties: properties,
            description: description,
            keywords: keywords
        };
    };
    /**
     * Parse a property from an s-expression
     * @param propertyExpr - The property s-expression
     * @returns Parsed property or null if invalid
     */
    SExpressionParser.prototype.parseProperty = function (propertyExpr) {
        if (propertyExpr.type !== 'list' || !propertyExpr.children || propertyExpr.children.length < 3) {
            return null;
        }
        // First element is 'property'
        // Second element is property name
        // Third element is property value
        var nameExpr = propertyExpr.children[1];
        var valueExpr = propertyExpr.children[2];
        if (nameExpr.type !== 'atom' || !nameExpr.value ||
            valueExpr.type !== 'atom' || !valueExpr.value) {
            return null;
        }
        var property = {
            name: nameExpr.value,
            value: valueExpr.value
        };
        // Parse additional property attributes if present
        for (var i = 3; i < propertyExpr.children.length; i++) {
            var child = propertyExpr.children[i];
            if (child.type === 'list' && child.children && child.children.length > 0) {
                var firstToken = child.children[0];
                if (firstToken.type === 'atom' && firstToken.value === 'effects') {
                    // Property effects can include font size, hide flag, etc.
                    // For now, we'll just note that effects exist
                    property.effects = {};
                }
            }
        }
        return property;
    };
    /**
     * Skip whitespace characters and comments
     */
    SExpressionParser.prototype.skipWhitespace = function () {
        while (this.position < this.content.length) {
            var char = this.content[this.position];
            if (this.isWhitespace(char)) {
                this.position++;
            }
            else if (char === ';') {
                // Skip comment line
                while (this.position < this.content.length && this.content[this.position] !== '\n') {
                    this.position++;
                }
            }
            else {
                break;
            }
        }
    };
    /**
     * Check if character is whitespace
     * @param char - Character to check
     * @returns True if whitespace
     */
    SExpressionParser.prototype.isWhitespace = function (char) {
        return char === ' ' || char === '\t' || char === '\n' || char === '\r';
    };
    return SExpressionParser;
}());
exports.SExpressionParser = SExpressionParser;
