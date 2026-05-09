# @typecad/jlcpcb-parts

Intelligent fuzzy search for JLCPCB basic and preferred electrical components with CLI interface. This TypeScript-based npm package provides smart component search capabilities by automatically managing a local database of JLCPCB parts and offering natural language search with intelligent parameter matching.

### Dependencies

This package uses [CDFER/jlcpcb-parts-database](https://github.com/CDFER/jlcpcb-parts-database) which provides a daily CSV download of all basic and preferred parts. That project depends on [yaqwsx/jlcparts](https://github.com/yaqwsx/jlcparts). Please consider supporting them.

## Features

- 🔍 **Intelligent Fuzzy Search**: Find components using natural language descriptions
- 📦 **Automatic Database Management**: Downloads and caches JLCPCB components database
- ⚡ **Fast CLI Interface**: Quick command-line searches with formatted output
- 🎯 **Smart Parameter Parsing**: Recognizes electrical values, packages, tolerances, and more
- 📊 **Scored Results**: Get ranked results with match explanations
- 🔄 **Auto-Updates**: Keeps component database fresh (24-hour cache)
- 🎨 **Multiple Output Formats**: Detailed, compact, table, or JSON display options
- 🔧 **Programmatic Integration**: JSON output for scripting and automation

## Installation

### Global Installation (Recommended)

```bash
npm install -g @typecad/jlcpcb-parts
```

After global installation, you can use the `jlcpcb-search` command from anywhere:

```bash
jlcpcb-search "10k resistor 0603"
```

### Local Installation

```bash
npm install @typecad/jlcpcb-parts
```

## Quick Start

### Basic Search

```bash
# Search for a 10kΩ resistor in 0603 package
jlcpcb-search "10k resistor 0603"

# Search for a 100µF capacitor rated for 16V
jlcpcb-search "100uF capacitor 16V"

# Search for buttons
jlcpcb-search "SPST button"
```

### Advanced Usage

```bash
# Use table format for compact display
jlcpcb-search "LM358 op amp" --format table

# Sort by manufacturer and show 1 result
jlcpcb-search "ceramic capacitor 0402" --sort manufacturer --limit 1

# Compact format for quick overview
jlcpcb-search "LED red 0603" --format compact

# JSON format for programmatic use
jlcpcb-search "10k resistor" --format json
```

## Usage

### Command Line Interface

```
jlcpcb-search [options] <search query>

Options:
  -h, --help                Display help message
  -v, --version             Display version information
  -f, --format <format>     Output format: detailed, compact, table, or json (default: detailed)
  -s, --sort <field>        Sort by: score, lcsc, manufacturer, or package (default: score)
  -l, --limit <number>      Limit number of results (default: 5)
```

### Search Query Examples

The tool understands natural language descriptions and can parse various electrical parameters:

#### Resistors

```bash
jlcpcb-search "10k resistor 0603"           # 10kΩ resistor in 0603 package
jlcpcb-search "1M ohm 1% 0805"              # 1MΩ resistor with 1% tolerance
jlcpcb-search "220 ohm thick film"          # 220Ω thick film resistor
```

#### Capacitors

```bash
jlcpcb-search "100nF 50V X7R 0603"          # 100nF ceramic capacitor
jlcpcb-search "10uF 16V tantalum"           # 10µF tantalum capacitor
jlcpcb-search "1mF electrolytic 25V"        # 1mF electrolytic capacitor
```

#### Inductors

```bash
jlcpcb-search "10uH inductor 0805"          # 10µH inductor
jlcpcb-search "100nH ferrite bead"          # 100nH ferrite bead
```

#### ICs and Active Components

```bash
jlcpcb-search "LM358 op amp"                # LM358 operational amplifier
jlcpcb-search "STM32F103 microcontroller"   # STM32F103 microcontroller
jlcpcb-search "AMS1117 voltage regulator"   # AMS1117 voltage regulator
```

#### Connectors and Mechanical

```bash
jlcpcb-search "USB"                         # IC
jlcpcb-search "2.54mm header male"          # 2.54mm pin headers
jlcpcb-search "tactile switch 6x6"          # Tactile switches
```

### Output Formats

#### Detailed Format (Default)

Shows complete component information with match explanations:

```
Found 3 matching components:

1. C25804 - 10kΩ ±1% 0603 Thick Film Resistor
   Manufacturer: UNI-ROYAL(Uniroyal Elec)
   Part Number: 0603WAF1002T5E
   Package: 0603
   Match Score: 95.0
   Match Details: Exact resistance match (100 pts), Package match (80 pts), Tolerance match (70 pts)
```

#### Compact Format

One-line summary per component:

```bash
jlcpcb-search "10k resistor" --format compact
```

```
1. C25804 - 10kΩ ±1% 0603 Thick Film Resistor... - 0603 - 95.0
2. C25879 - 10kΩ ±5% 0805 Thick Film Resistor... - 0805 - 87.5
```

#### Table Format

Structured table view:

```bash
jlcpcb-search "capacitor 0603" --format table
```

```
#   LCSC     Manufacturer     Part Number      Package Score  Description
--- -------- ---------------- ---------------- ------- ------ -----------
1   C14663   Samsung Electro  CL10B104KB8N...  0603    92.0   100nF 50V X7R...
2   C1608    Samsung Electro  CL10A105KB8N...  0603    89.5   1µF 25V X5R...
```

#### JSON Format

Machine-readable JSON output for programmatic integration:

```bash
jlcpcb-search "10k resistor 0603" --format json
```

```json
[
  {
    "lcsc": "25804",
    "manufacturer": "UNI-ROYAL(Uniroyal Elec)",
    "partNumber": "0603WAF1002T5E",
    "description": "10kΩ ±1% 0603 Thick Film Resistor",
    "package": "0603",
    "score": 95.0,
    "matchSummary": "Exact resistance match (100 pts), Package match (80 pts)"
  },
  {
    "lcsc": "25879",
    "manufacturer": "UNI-ROYAL(Uniroyal Elec)",
    "partNumber": "0805WAF1002T5E",
    "description": "10kΩ ±5% 0805 Thick Film Resistor",
    "package": "0805",
    "score": 87.5,
    "matchSummary": "Exact resistance match (100 pts), Package match (40 pts)"
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

### Automatic Database Management

The tool automatically manages the JLCPCB components database:

1. **First Run**: Downloads the complete JLCPCB components CSV file (~3MB)
2. **Caching**: Stores the database locally with a timestamp
3. **Auto-Update**: Downloads the CSV again if it is more than 24 hours old
4. **Offline Mode**: Works with cached data when network is unavailable

### Intelligent Parameter Parsing

The search engine recognizes and parses:

- **Electrical Values**: `10k`, `100nF`, `1µH`, `3.3V`
- **Units**: Supports all standard electrical units with prefixes
- **Packages**: `0603`, `0805`, `SOT-23`, `SOIC-8`, etc.
- **Tolerances**: `±1%`, `±5%`, `+/-10%`
- **Component Types**: `X7R`, `NP0`, `MLCC`, `SMD`, `THT`
- **Keywords**: Manufacturer names, part families, descriptions

### Fuzzy Scoring Algorithm

Components are scored based on multiple factors:

- **Exact Matches**: 100 points per parameter
- **Close Matches**: 50-90 points for similar values
- **Package Matches**: 80 points for exact, 40 for similar
- **Type Matches**: 70 points for component type
- **Keyword Matches**: 20-50 points for description relevance
- **Category**: 30 points for matching component category

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
  DataManager,
  ElectricalParameterParser,
  ComponentFuzzyScorer,
  ComponentSearchEngine,
} from "@typecad/jlcpcb-parts";

// Create your own search engine instance
const dataManager = new DataManager();
const parser = new ElectricalParameterParser();
const scorer = new ComponentFuzzyScorer();
const searchEngine = new ComponentSearchEngine(dataManager, parser, scorer);

// Perform searches
const results = await searchEngine.search("10k resistor 0603");
console.log(results);
```

## Configuration

### Environment Variables

- `JLCPCB_CSV_URL`: Custom URL for the JLCPCB CSV file
- `JLCPCB_CACHE_DIR`: Directory to store cached files (default: current directory)
- `JLCPCB_CACHE_HOURS`: Cache expiration time in hours (default: 24)

### Cache Management

The tool stores cache files in your current directory:

- `jlcpcb-components-basic-preferred.csv`: Component database
- `.jlcpcb-cache-timestamp`: Cache timestamp file
- `.logs/`: Search and error logs

To force a database refresh, delete the timestamp file:

```bash
rm .jlcpcb-cache-timestamp
```

## Troubleshooting

### Common Issues

#### No Results Found

```
No components found matching your search criteria.
Suggestions:
- Try using more general terms (e.g., "capacitor" instead of "ceramic capacitor")
- Check your spelling and try alternative terms
- Remove specific parameters that might be too restrictive
- Try searching for a different package size or value
```

**Solutions:**

- Use broader search terms
- Check spelling of component values and types
- Try alternative package sizes (0603 vs 0805)
- Search for component families instead of specific part numbers

#### Network/Download Issues

```
Error: Failed to download component database
```

**Solutions:**

- Check your internet connection
- Verify firewall settings allow HTTPS connections
- Try again later (server might be temporarily unavailable)
- Use cached data if available

#### Permission Errors

```
Error: Permission denied writing cache files
```

**Solutions:**

- Run from a directory where you have write permissions
- Check file system permissions
- Try running with elevated privileges (if appropriate)

### Debug Mode

Enable verbose logging by setting the log level:

```bash
# Set environment variable for debug logging
export JLCPCB_LOG_LEVEL=DEBUG
jlcpcb-search "10k resistor"
```

### Getting Help

- Use `jlcpcb-search --help` for command-line help
- Review log files in `.logs/` directory for detailed error information

## Related Projects

- [TypeCAD](https://typecad.net) - use TypeScript to create PCBs in KiCAD
- [JLCPCB Parts Database](https://github.com/cdfer/jlcpcb-parts-database) - Source of component data

## Support

- [Buy me a coffee](https://www.buymeacoffee.com/typecad)

---

Made by [typeCAD](https://typecad.net)
