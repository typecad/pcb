import { MCPServer } from '../server';

interface UniversalFilters {
  category?: string;
  package?: string;
  manufacturer?: string;
  price_range?: [number, number];
  stock_minimum?: number;
  basic_parts?: boolean;
}

interface UnifiedSearchResult {
  source: "kicad" | "jlcpcb" | "local";
  component_id: string;
  description: string;
  package_info?: string;
  availability?: "available" | "limited" | "unavailable" | "unknown";
  estimated_cost?: number;
  confidence_score: number;
  metadata?: {
    manufacturer?: string;
    stock?: number;
    basic_part?: boolean;
    file_path?: string;
    last_modified?: string;
  };
}

export function registerSearchAllComponentsTool(server: MCPServer) {
  server.registerTool({
    name: "search_all_components",
    description: "Search for components across all available sources (KiCAD libraries, JLCPCB database, and local files). Returns unified results ranked by relevance and availability.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query - component name, description, part number, or specifications"
        },
        sources: {
          type: "array",
          description: "Sources to search (default: all sources)",
          items: {
            type: "string",
            enum: ["kicad", "jlcpcb", "local"]
          },
          default: ["kicad", "jlcpcb", "local"]
        },
        max_results_per_source: {
          type: "number",
          description: "Maximum results per source (default: 5)",
          default: 5
        },
        filters: {
          type: "object",
          description: "Universal filters applied to all sources",
          properties: {
            category: { type: "string" },
            package: { type: "string" },
            manufacturer: { type: "string" },
            price_range: {
              type: "array",
              items: { type: "number" },
              minItems: 2,
              maxItems: 2
            },
            stock_minimum: { type: "number" },
            basic_parts: { type: "boolean" }
          }
        },
        local_directory: {
          type: "string",
          description: "Directory to search for local components (default: current working directory)"
        },
        sort_by: {
          type: "string",
          enum: ["relevance", "availability", "cost", "source"],
          description: "Sort results by specified criteria (default: relevance)",
          default: "relevance"
        }
      },
      required: ["query"]
    }
  });

  server.on('tool_call', async ({ name, args, resolve, reject }) => {
    if (name !== 'search_all_components') return;
    
    try {
      const { 
        query, 
        sources = ["kicad", "jlcpcb", "local"],
        max_results_per_source = 5,
        filters = {},
        local_directory = process.cwd(),
        sort_by = "relevance"
      } = args;

      const allResults: UnifiedSearchResult[] = [];
      const searchPromises: Promise<void>[] = [];

      // Search KiCAD if requested
      if (sources.includes("kicad")) {
        searchPromises.push(
          new Promise(async (resolveSearch) => {
            try {
              // Import KiCAD search functions directly
              const { searchKiCadSymbols } = await import('./add_component');
              const symbolResults = await searchKiCadSymbols(query, max_results_per_source);
              
              for (const symbol of symbolResults) {
                allResults.push({
                  source: "kicad",
                  component_id: symbol.fullSymbol,
                  description: symbol.description || '',
                  package_info: "From KiCAD libraries",
                  availability: "available",
                  confidence_score: symbol.score || 0,
                  metadata: {}
                });
              }
            } catch (error) {
              console.error('KiCAD search failed:', error);
            }
            resolveSearch();
          })
        );
      }

      // Search JLCPCB if requested
      if (sources.includes("jlcpcb")) {
        searchPromises.push(
          new Promise(async (resolveSearch) => {
            try {
              // Import JLCPCB search function directly
              const { searchJLCPCBComponents } = await import('./search_jlcpcb_components');
              const jlcpcbFilters = {
                category: filters.category,
                package: filters.package,
                manufacturer: filters.manufacturer,
                stock_minimum: filters.stock_minimum,
                basic_parts: filters.basic_parts,
                price_range: filters.price_range
              };
              
              const components = await searchJLCPCBComponents(query, jlcpcbFilters, max_results_per_source);
              
              for (const component of components) {
                const availability = component.stock > (filters.stock_minimum || 0) ? 
                  (component.stock > 1000 ? "available" : "limited") : "unavailable";
                
                const estimatedCost = component.price_breaks && component.price_breaks.length > 0 ?
                  component.price_breaks[0].price : undefined;

                allResults.push({
                  source: "jlcpcb",
                  component_id: component.component_number,
                  description: component.description || '',
                  package_info: component.package || '',
                  availability,
                  estimated_cost: estimatedCost,
                  confidence_score: component.confidence_score || 0,
                  metadata: {
                    manufacturer: component.manufacturer,
                    stock: component.stock,
                    basic_part: component.basic_part
                  }
                });
              }
            } catch (error) {
              console.error('JLCPCB search failed:', error);
            }
            resolveSearch();
          })
        );
      }

      // Search local files if requested
      if (sources.includes("local")) {
        searchPromises.push(
          new Promise(async (resolveSearch) => {
            try {
              // Import local search function directly
              const { LocalComponentIndexer } = await import('./search_local_components');
              const indexer = new LocalComponentIndexer(local_directory);
              await indexer.loadIndex();
              
              // Check if index is empty and rebuild if needed
              const stats = indexer.getStats();
              if (stats.total_components === 0) {
                await indexer.scanDirectory(local_directory, true, ['.ts', '.js', '.json', '.kicad_sym', '.lib', '.csv']);
                await indexer.saveIndex();
              }

              const components = indexer.search(query, max_results_per_source);
              
              for (const component of components) {
                allResults.push({
                  source: "local",
                  component_id: component.file_path,
                  description: component.description || component.component_name,
                  package_info: `Local ${component.file_format} file`,
                  availability: "available",
                  estimated_cost: 0, // Local files are free
                  confidence_score: component.confidence_score || 0,
                  metadata: {
                    file_path: component.file_path,
                    last_modified: component.last_modified
                  }
                });
              }
            } catch (error) {
              console.error('Local search failed:', error);
            }
            resolveSearch();
          })
        );
      }

      // Wait for all searches to complete
      await Promise.all(searchPromises);

      // Sort results based on criteria
      let sortedResults = [...allResults];
      switch (sort_by) {
        case "relevance":
          sortedResults.sort((a, b) => b.confidence_score - a.confidence_score);
          break;
        case "availability":
          const availabilityOrder = { "available": 3, "limited": 2, "unavailable": 1, "unknown": 0 };
          sortedResults.sort((a, b) => 
            (availabilityOrder[b.availability || "unknown"] || 0) - 
            (availabilityOrder[a.availability || "unknown"] || 0)
          );
          break;
        case "cost":
          sortedResults.sort((a, b) => (a.estimated_cost || 999) - (b.estimated_cost || 999));
          break;
        case "source":
          const sourceOrder = { "local": 3, "kicad": 2, "jlcpcb": 1 };
          sortedResults.sort((a, b) => (sourceOrder[b.source] || 0) - (sourceOrder[a.source] || 0));
          break;
      }

      // Group results by source for better presentation
      const resultsBySource = {
        kicad: sortedResults.filter(r => r.source === "kicad"),
        jlcpcb: sortedResults.filter(r => r.source === "jlcpcb"),
        local: sortedResults.filter(r => r.source === "local")
      };

      const searchResult = {
        query,
        sources_searched: sources,
        filters,
        sort_by,
        total_results: sortedResults.length,
        results_by_source: {
          kicad: resultsBySource.kicad.length,
          jlcpcb: resultsBySource.jlcpcb.length,
          local: resultsBySource.local.length
        },
        unified_results: sortedResults,
        grouped_results: resultsBySource,
        usage_instructions: [
          "Results are sorted by: " + sort_by,
          "For KiCAD components: use add_component with source='kicad' and the symbol name",
          "For JLCPCB components: use add_component with source='jlcpcb' and component_number",
          "For local components: use add_component with source='local' and local_file path",
          "Check availability before using - JLCPCB stock levels can change",
          "Local components have zero cost but may need custom footprints"
        ],
        recommendations: generateRecommendations(sortedResults, filters)
      };
      
      resolve(JSON.stringify(searchResult, null, 2));
      
    } catch (error: any) {
      reject(new Error(JSON.stringify({
        error_code: "UNIFIED_SEARCH_FAILED",
        message: `Failed to search across component sources: ${error.message}`,
        suggestions: [
          "Check that individual search tools are working",
          "Verify directory paths and permissions",
          "Try searching individual sources separately",
          "Ensure required packages are installed"
        ]
      }, null, 2)));
    }
  });
}

function generateRecommendations(results: UnifiedSearchResult[], filters: UniversalFilters): string[] {
  const recommendations: string[] = [];
  
  const kicadResults = results.filter(r => r.source === "kicad");
  const jlcpcbResults = results.filter(r => r.source === "jlcpcb");
  const localResults = results.filter(r => r.source === "local");
  
  if (kicadResults.length > 0) {
    recommendations.push(`Found ${kicadResults.length} KiCAD library components - these are well-tested and widely supported`);
  }
  
  if (jlcpcbResults.length > 0) {
    const basicParts = jlcpcbResults.filter(r => r.metadata?.basic_part);
    const availableParts = jlcpcbResults.filter(r => r.availability === "available");
    
    if (basicParts.length > 0) {
      recommendations.push(`Found ${basicParts.length} JLCPCB basic parts - these have lower assembly costs`);
    }
    
    if (availableParts.length > 0) {
      recommendations.push(`${availableParts.length} JLCPCB components are in stock and ready for assembly`);
    }
  }
  
  if (localResults.length > 0) {
    recommendations.push(`Found ${localResults.length} local components - verify symbols and footprints before use`);
  }
  
  if (filters.basic_parts && jlcpcbResults.length === 0) {
    recommendations.push("Consider removing basic_parts filter to see more JLCPCB options");
  }
  
  if (results.length === 0) {
    recommendations.push("No components found - try broader search terms or check spelling");
  }
  
  return recommendations;
}
