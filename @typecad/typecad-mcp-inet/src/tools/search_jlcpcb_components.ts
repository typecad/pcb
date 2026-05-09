import { MCPServer } from '../server';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface JLCPCBFilters {
  category?: string;
  package?: string;
  manufacturer?: string;
  price_range?: [number, number];
  stock_minimum?: number;
  basic_parts?: boolean;
}

interface JLCPCBResult {
  component_number: string;
  description: string;
  manufacturer: string;
  package: string;
  basic_part: boolean;
  stock: number;
  price_breaks: Array<{
    quantity: number;
    price: number;
  }>;
  datasheet_url?: string;
  confidence_score: number;
}

export async function searchJLCPCBComponents(query: string, filters?: JLCPCBFilters, maxResults: number = 10): Promise<JLCPCBResult[]> {
  try {
    console.error(`Searching JLCPCB components for: "${query}"`);
    
    // Build command with correct parameters for @typecad/jlcpcb-parts
    const baseCmd = ['@typecad/jlcpcb-parts'];
    
    // Add format and limit options first
    baseCmd.push('--format', 'json');
    baseCmd.push('--limit', maxResults.toString());
    
    // Add the search query at the end
    baseCmd.push(query);
    
    // Note: The jlcpcb-parts tool may not support all these filters
    // These are aspirational and may need to be handled by post-filtering
    // if (filters?.category) baseCmd.push(`--category="${filters.category}"`);
    // if (filters?.package) baseCmd.push(`--package="${filters.package}"`);
    // if (filters?.manufacturer) baseCmd.push(`--manufacturer="${filters.manufacturer}"`);
    // if (filters?.stock_minimum) baseCmd.push(`--stock-min=${filters.stock_minimum}`);
    // if (filters?.basic_parts) baseCmd.push('--basic-only');
    // if (filters?.price_range) {
    //   baseCmd.push(`--price-min=${filters.price_range[0]}`);
    //   baseCmd.push(`--price-max=${filters.price_range[1]}`);
    // }
    
    const { stdout, stderr } = await execAsync(`npx ${baseCmd.join(' ')}`);
    
    // Extract JSON from output (similar to KiCAD approach)
    let jsonString = stdout.trim();
    
    // Find the start of the JSON array
    const arrayStart = jsonString.indexOf('[');
    if (arrayStart === -1) {
      console.error('No JSON array found in JLCPCB search output. Length:', stdout.length, 'First 200 chars:', stdout.substring(0, 200));
      return [];
    }
    
    // Find the end of the JSON array
    let bracketCount = 0;
    let arrayEnd = arrayStart;
    for (let i = arrayStart; i < jsonString.length; i++) {
      if (jsonString[i] === '[') bracketCount++;
      if (jsonString[i] === ']') bracketCount--;
      if (bracketCount === 0) {
        arrayEnd = i;
        break;
      }
    }
    
    jsonString = jsonString.substring(arrayStart, arrayEnd + 1);
    const results = JSON.parse(jsonString);
    
    // Transform results to our interface format
    let transformedResults = results.map((result: any) => ({
      component_number: result.lcsc || result.component_number || result.lcsc_part || '',
      description: result.description || result.desc || '',
      manufacturer: result.manufacturer || result.mfr || '',
      package: result.package || result.pkg || '',
      basic_part: result.basic_part || result.basic || false,
      stock: parseInt(result.stock || result.inventory || '0', 10),
      price_breaks: result.price_breaks || result.prices || [],
      datasheet_url: result.datasheet_url || result.datasheet,
      confidence_score: result.score || result.confidence || 0
    }));

    // Apply client-side filtering since the tool may not support all filters
    if (filters) {
      if (filters.manufacturer) {
        const manufacturerLower = filters.manufacturer.toLowerCase();
        transformedResults = transformedResults.filter((r: JLCPCBResult) => 
          r.manufacturer.toLowerCase().includes(manufacturerLower)
        );
      }
      
      if (filters.package) {
        const packageLower = filters.package.toLowerCase();
        transformedResults = transformedResults.filter((r: JLCPCBResult) => 
          r.package.toLowerCase().includes(packageLower)
        );
      }
      
      if (filters.stock_minimum) {
        transformedResults = transformedResults.filter((r: JLCPCBResult) => 
          r.stock >= (filters.stock_minimum || 0)
        );
      }
      
      // Note: category and basic_parts filtering would need additional data
      // that may not be available in the current API response
    }

    return transformedResults;
    
  } catch (error: any) {
    console.error('Error searching JLCPCB components:', error.message);
    
    // Check if the package is not installed
    if (error.message.includes('not found') || error.message.includes('ENOENT')) {
      throw new Error('The @typecad/jlcpcb-parts package is not installed. Install it with: npm install -g @typecad/jlcpcb-parts');
    }
    
    return [];
  }
}

export function registerSearchJLCPCBComponentsTool(server: MCPServer) {
  server.registerTool({
    name: "search_jlcpcb_components",
    description: "Search JLCPCB/LCSC basic and preferred parts catalog using natural language queries. Limited to common components in JLCPCB's basic/preferred parts. For specialty components, users need specific JLCPCB component numbers (C1234567 format) from JLCPCB.com.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query - can be part description, manufacturer part number, or component type (e.g., 'STM32F103', 'op amp', 'resistor 10k')"
        },
        category: {
          type: "string",
          description: "Component category filter (e.g., 'Microcontrollers', 'Analog ICs', 'Resistors')"
        },
        package: {
          type: "string", 
          description: "Package type filter (e.g., 'LQFP-64', 'SOIC-8', '0603')"
        },
        manufacturer: {
          type: "string",
          description: "Manufacturer filter (e.g., 'STMicroelectronics', 'Texas Instruments')"
        },
        stock_minimum: {
          type: "number",
          description: "Minimum stock quantity required"
        },
        basic_parts: {
          type: "boolean",
          description: "Filter to basic parts only (lower cost assembly)"
        },
        price_range: {
          type: "array",
          description: "Price range filter [min, max] in USD",
          items: { type: "number" },
          minItems: 2,
          maxItems: 2
        },
        max_results: {
          type: "number",
          description: "Maximum number of results to return (default: 10)",
          default: 10
        }
      },
      required: ["query"]
    }
  });

  server.on('tool_call', async ({ name, args, resolve, reject }) => {
    if (name !== 'search_jlcpcb_components') return;
    
    try {
      const { 
        query, 
        category, 
        package: packageType, 
        manufacturer, 
        stock_minimum, 
        basic_parts, 
        price_range, 
        max_results = 10 
      } = args;
      
      const filters: JLCPCBFilters = {};
      if (category) filters.category = category;
      if (packageType) filters.package = packageType;
      if (manufacturer) filters.manufacturer = manufacturer;
      if (stock_minimum) filters.stock_minimum = stock_minimum;
      if (basic_parts !== undefined) filters.basic_parts = basic_parts;
      if (price_range && Array.isArray(price_range) && price_range.length === 2) {
        filters.price_range = [price_range[0], price_range[1]];
      }
      
      const results = await searchJLCPCBComponents(query, filters, max_results);
      
      const searchResult = {
        query,
        filters,
        total_results: results.length,
        components: results.map(r => ({
          component_number: r.component_number,
          description: r.description,
          manufacturer: r.manufacturer,
          package: r.package,
          basic_part: r.basic_part,
          stock: r.stock,
          price_breaks: r.price_breaks,
          datasheet_url: r.datasheet_url,
          confidence_score: r.confidence_score
        })),
        usage_instructions: results.length > 0 ? [
          "To use a component, copy the component number (e.g., 'C1234567')",
          "Call add_component tool with: { source: 'jlcpcb', component_number: 'C1234567' }",
          "Basic parts have lower assembly costs at JLCPCB",
          "Check stock levels before ordering - components may go out of stock"
        ] : [
          "No components found in JLCPCB's basic/preferred parts catalog",
          "The component may still be available with a specific JLCPCB component number",
          "If you have a JLCPCB component number (format: C1234567), use:",
          "{ source: 'jlcpcb', component_number: 'C1234567' }",
          "Find component numbers by browsing JLCPCB.com or LCSC.com directly",
          "Note: This search only includes JLCPCB basic and preferred parts"
        ],
        note: results.length === 0 ? "Search limited to JLCPCB basic/preferred parts catalog. Specialty components require direct component numbers from JLCPCB.com" : undefined
      };
      
      resolve(JSON.stringify(searchResult, null, 2));
      
    } catch (error: any) {
      reject(new Error(JSON.stringify({
        error_code: "JLCPCB_SEARCH_FAILED",
        message: `Failed to search JLCPCB components: ${error.message}`,
        suggestions: [
          "Ensure @typecad/jlcpcb-parts is installed: npm install -g @typecad/jlcpcb-parts",
          "Try a different search query",
          "Check internet connectivity",
          "Verify JLCPCB/LCSC website is accessible"
        ]
      }, null, 2)));
    }
  });
}
