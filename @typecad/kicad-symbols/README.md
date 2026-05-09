# @typecad/kicad-symbols

Intelligent fuzzy search for KiCad schematic symbols with CLI interface. This TypeScript-based npm package provides smart symbol search capabilities by processing local KiCad symbol files and offering natural language search with intelligent parameter matching.


## Features

- 🔍 **Intelligent Fuzzy Search**: Find KiCad symbols using natural language descriptions
- 📁 **Local File Processing**: Processes KiCad symbol files directly from your installation
- ⚡ **Fast CLI Interface**: Quick command-line searches with formatted output
- 🎯 **Smart Symbol Matching**: Recognizes library names, symbol names, and descriptions
- 📊 **Scored Results**: Get ranked results with match explanations
- 🔄 **Automatic Caching**: Caches processed symbols for fast subsequent searches
- 🎨 **Multiple Output Formats**: Detailed, compact, table, or JSON display options
- 🔧 **Programmatic Integration**: JSON output for scripting and automation
- 💬 **Interactive Mode**: Prompt for search queries when none provided via command line

## Installation

### Global Installation (Recommended)

```bash
npm install -g @typecad/kicad-symbols
```

After global installation, you can use the `kicad-symbols` command from anywhere:

```bash
kicad-symbols "op amp"
```

## Quick Start

### Basic Search

```bash
# Search for operational amplifier symbols
kicad-symbols "op amp"

# Search for microcontroller symbols
kicad-symbols "microcontroller"

# Search for connector symbols
kicad-symbols "connector"
```

### Interactive Mode

If you run the program without any search query, it will prompt you to enter one interactively:

```bash
# Start the program without arguments
kicad-symbols

# The program will display:
# kicad-symbols - KiCad Symbols Search Tool
# No search query provided. Please enter a search term:
# Examples: "capacitor", "LM358", "4xxx:14528", "op amp"
# Press Ctrl+C to exit
# 
# Search query: 
```

### Advanced Usage

```bash
# Use table format for compact display
kicad-symbols "LM358" --format table

# Sort by library and show 1 result
kicad-symbols "transistor" --sort id --limit 1

# Compact format for quick overview
kicad-symbols "LED" --format compact

# JSON format for programmatic use
kicad-symbols "capacitor" --format json
```

## Usage

### Command Line Interface

```
kicad-symbols [options] [<search query>]

Options:
  -h, --help                Display help message
  -v, --version             Display version information
  -f, --format <format>     Output format: detailed, compact, table, or json (default: detailed)
  -s, --sort <field>        Sort by: score, id, manufacturer, or package (default: score)
  -l, --limit <number>      Limit number of results (default: 5)

Note: If no search query is provided, the program will prompt you to enter one interactively.
```

### Search Query Examples

The tool understands natural language descriptions and can find KiCad symbols by name, library, or description:

#### Analog Components

```bash
kicad-symbols "op amp"                       # Operational amplifier symbols
kicad-symbols "LM358"                        # Specific op amp part
kicad-symbols "comparator"                   # Comparator symbols
```

#### Digital Logic

```bash
kicad-symbols "74HC00"                       # Logic gate symbols
kicad-symbols "flip flop"                    # Flip-flop symbols
kicad-symbols "counter"                      # Counter IC symbols
```

#### Microcontrollers

```bash
kicad-symbols "STM32"                        # STM32 microcontroller symbols
kicad-symbols "Arduino"                      # Arduino-related symbols
kicad-symbols "PIC"                          # PIC microcontroller symbols
```

#### Power Management

```bash
kicad-symbols "voltage regulator"            # Voltage regulator symbols
kicad-symbols "LDO"                          # Low dropout regulator symbols
kicad-symbols "switching regulator"          # Switching regulator symbols
```

#### Connectors and Interface

```bash
kicad-symbols "USB"                          # USB connector symbols
kicad-symbols "header"                       # Pin header symbols
kicad-symbols "terminal block"               # Terminal block symbols
```

### Output Formats

#### Detailed Format (Default)

Shows complete symbol information with match explanations:

```
Found 3 matching symbols:

1. Amplifier_Operational:LM358 - Dual Low-Power Operational Amplifier
   Part Number: LM358
   Match Score: 95.0
   Match Details: Exact symbol match (100 pts), Library match (80 pts), Description match (70 pts)
```

#### Compact Format

One-line summary per symbol:

```bash
kicad-symbols "op amp" --format compact
```

```
1. Amplifier_Operational:LM358 - Dual Low-Power Operational Amplifier... - 95.0
2. Amplifier_Operational:LM324 - Quad Low-Power Operational Amplifier... - 87.5
```

#### Table Format

Structured table view:

```bash
kicad-symbols "transistor" --format table
```

```
#   Symbol                    Score  Description
--- ------------------------- ------ -----------
1   Transistor_BJT:BC547      92.0   NPN Bipolar Junction Transistor
2   Transistor_FET:2N7000     89.5   N-Channel Enhancement Mode MOSFET
```

#### JSON Format

Machine-readable JSON output for programmatic integration:

```bash
kicad-symbols "op amp" --format json
```

```json
[
  {
    "symbol": "Amplifier_Operational:LM358",
    "description": "Dual Low-Power Operational Amplifier",
    "score": 95.0,
    "matchSummary": "Exact symbol match (100 pts), Library match (80 pts)"
  },
  {
    "symbol": "Amplifier_Operational:LM324",
    "description": "Quad Low-Power Operational Amplifier",
    "score": 87.5,
    "matchSummary": "Symbol match (90 pts), Library match (80 pts)"
  }
]
```

**JSON Format Features:**

- **Clean Output**: No formatting, colors, or progress indicators
- **Machine-Readable**: Valid JSON for easy parsing by scripts and applications
- **Complete Data**: All component information included in structured format
- **Empty Results**: Returns empty array `[]` when no components found
- **Error Handling**: Errors output as JSON objects with error information

**JSON Error Response Format:**

```json
{
  "error": true,
  "message": "No search query provided",
  "code": "MISSING_QUERY"
}
```

## How It Works

### Local File Processing

The tool processes KiCad symbol files from your local installation:

1. **Symbol Discovery**: Automatically locates KiCad symbol libraries on your system
2. **File Processing**: Parses `.kicad_sym` files to extract symbol information
3. **Caching**: Stores processed symbols locally for fast subsequent searches
4. **Auto-Update**: Re-processes files when symbol libraries are updated

### Intelligent Symbol Matching

The search engine recognizes and matches:

- **Symbol Names**: Exact and partial matches for symbol names
- **Library Names**: Matches against KiCad library categories
- **Descriptions**: Searches within symbol descriptions and functionality
- **Part Numbers**: Recognizes specific IC part numbers and families
- **Component Types**: Matches component categories and types
- **Keywords**: Searches for relevant technical terms and descriptions

### Fuzzy Scoring Algorithm

Symbols are scored based on multiple factors:

- **Exact Symbol Matches**: 100 points for exact symbol name
- **Library Matches**: 80 points for matching library category
- **Description Matches**: 70 points for description relevance
- **Partial Matches**: 50-90 points for partial symbol/library matches
- **Keyword Matches**: 20-50 points for keyword relevance
- **Category**: 30 points for matching symbol category

### Interactive Mode Behavior

When no search query is provided via command line arguments, the program enters interactive mode:

- **User-Friendly Prompt**: Displays a clear, colored prompt with helpful examples
- **Graceful Exit**: If you press Enter without typing anything, the program exits cleanly
- **Cancel Support**: Press Ctrl+C to exit the program at any time
- **Same Functionality**: All search features work exactly the same as command-line mode
- **JSON Compatibility**: Interactive mode respects JSON format settings for programmatic use

### JSON Mode Behavior

When using the JSON format (`--format json`), the tool operates in a special mode optimized for programmatic use:

- **Clean Output**: No progress indicators, status messages, or colored text
- **Pure JSON**: Only valid JSON is output to stdout
- **Error Handling**: Errors are formatted as JSON objects with error information
- **Exit Codes**: Proper exit codes are maintained for error detection
- **Performance**: Slightly faster execution due to reduced formatting overhead

## Programmatic Usage

You can also use the package programmatically in your Node.js applications:

```typescript
import {
  Application,
  ComponentSearchEngine,
  DataManager,
  ElectricalParameterParser,
  EnhancedScoringSystem,
  runApplication,
} from "@typecad/kicad-symbols";

// Use the convenience function
await runApplication(process.argv, {
  cacheExpirationHours: 12,
});

// Or create your own application instance
const app = new Application(
  "kicad-symbols-cache.json", // cache file (ignored when using shared cache)
  "./cache", // cache directory (ignored when using shared cache)
  24, // cache expiration hours
  "my-kicad-search", // program name
  true // use shared temp directory for cache (default: true)
);

await app.run(process.argv);
```

## Configuration

### Environment Variables

- `KICAD_CACHE_DIR`: Directory to store cached files (default: current directory)
- `KICAD_CACHE_HOURS`: Cache check interval in hours (default: 24)

### Cache Management

The tool stores cache files in a shared temporary directory to improve performance and allow multiple instances to share the same cache:

- `kicad-symbols-cache.json`: Processed symbol database cache
- `.kicad-cache-timestamp`: Cache metadata file
- `.kicad-last-updated-date`: Remote data update tracking

Cache files are stored in: `{system-temp-directory}/kicad-symbols-cache/`

To force a database refresh, you can either:
1. Wait for the cache to expire (24 hours by default)
2. Delete the cache directory manually
3. Use the application with a shorter cache expiration time

## Troubleshooting

### Common Issues

#### No Results Found

```
No symbols found matching your search criteria.
Suggestions:
- Try using more general terms (e.g., "amplifier" instead of "operational amplifier")
- Check your spelling and try alternative terms
- Remove specific parameters that might be too restrictive
- Try searching for symbol families instead of specific part numbers
```

**Solutions:**

- Use broader search terms
- Check spelling of symbol names and types
- Try alternative symbol categories or libraries
- Search for component families instead of specific part numbers

#### KiCad Not Found

```
Error: No local KiCad symbols found. Please ensure KiCad symbols are installed.
```

**Solutions:**

- Install KiCad on your system
- Ensure KiCad symbol libraries are installed
- Check that KiCad is properly configured
- Verify symbol library paths are accessible

#### Permission Errors

```
Error: Permission denied writing cache files
```

**Solutions:**

- Run from a directory where you have write permissions
- Check file system permissions
- Try running with elevated privileges (if appropriate)

### Getting Help

- Use `kicad-symbols --help` for command-line help
- Run `kicad-symbols` without arguments to enter interactive mode for exploratory searches

## Related Projects

- [typeCAD](https://typecad.net) - use TypeScript to create PCBs in KiCAD
- [KiCad](https://www.kicad.org/) - Open source electronics design automation suite

## Support

- [Buy me a coffee](https://www.buymeacoffee.com/typecad)
- 💡 [Request features](https://github.com/typecad/kicad-symbols/issues)

---

Made by [typeCAD](https://typecad.net)
