# @typecad/jlcpcb-parts

Intelligent fuzzy search for JLCPCB basic and preferred electrical components with CLI interface. Automatically manages a local database of JLCPCB parts and provides natural language search with smart parameter matching.

### Dependencies

This package uses [CDFER/jlcpcb-parts-database](https://github.com/CDFER/jlcpcb-parts-database) which provides a daily CSV download of all basic and preferred parts. That project depends on [yaqwsx/jlcparts](https://github.com/yaqwsx/jlcparts). Please consider supporting them.

## Features

- **Intelligent Fuzzy Search** — Find components using natural language descriptions
- **Automatic Database Management** — Downloads and caches JLCPCB components database
- **Fast CLI Interface** — Quick command-line searches with formatted output
- **Smart Parameter Parsing** — Recognizes electrical values, packages, tolerances, and more
- **Scored Results** — Ranked results with match explanations
- **Auto-Updates** — Keeps component database fresh (24-hour cache)
- **Multiple Output Formats** — Detailed, compact, table, or JSON display options
- **typeCAD/pcb Integration** — Add components directly to your typeCAD/pcb project from search results

## Installation

### Global Installation (Recommended)

```bash
npm install -g @typecad/jlcpcb-parts
```

After global installation, the `jlcpcb-search` command is available everywhere:

```bash
jlcpcb-search "10k resistor 0603"
```

### Local Installation

```bash
npm install @typecad/jlcpcb-parts
```

## Quick Start

```bash
# Search for a 10kΩ resistor in 0603 package
jlcpcb-search "10k resistor 0603"

# Search for a 100µF capacitor rated for 16V
jlcpcb-search "100uF capacitor 16V"

# JSON format for scripting
jlcpcb-search "10k resistor" --format json

# Table format, sorted by manufacturer, show 10 results
jlcpcb-search "ceramic capacitor 0402" --sort manufacturer --limit 10
```

## CLI Reference

```
jlcpcb-search [options] <search query>

Options:
  -h, --help                Display help message
  -v, --version             Display version information
  -f, --format <format>     Output format: detailed, compact, table, or json (default: detailed)
  -s, --sort <field>        Sort by: score, lcsc, manufacturer, or package (default: score)
  -l, --limit <number>      Limit number of results (default: 5)
```

If no search query is provided, the tool prompts for one interactively (unless `--format json` is used, in which case it returns an error immediately).

## Search Examples

The tool understands natural language descriptions and parses electrical parameters:

```bash
# Resistors
jlcpcb-search "10k resistor 0603"
jlcpcb-search "1M ohm 1% 0805"
jlcpcb-search "220 ohm thick film"

# Capacitors
jlcpcb-search "100nF 50V X7R 0603"
jlcpcb-search "10uF 16V tantalum"

# Inductors
jlcpcb-search "10uH inductor 0805"
jlcpcb-search "100nH ferrite bead"

# ICs and active components
jlcpcb-search "LM358 op amp"
jlcpcb-search "STM32F103 microcontroller"
jlcpcb-search "AMS1117 voltage regulator"

# Connectors and mechanical
jlcpcb-search "USB"
jlcpcb-search "2.54mm header male"
jlcpcb-search "tactile switch 6x6"
```

The query parser recognizes Unicode electronics characters such as Ω, µ, ±, and °.

## Output Formats

### Detailed (Default)

```
Found 3 matching components:

1. #C25804 - 10kΩ ±1% 0603 Thick Film Resistor
   Manufacturer: UNI-ROYAL(Uniroyal Elec)
   Part Number: 0603WAF1002T5E
   Package: 0603
   Details: Exact resistance match (100 pts), Package match (80 pts)

Top match: #C25804 - 10kΩ ±1% 0603 Thick Film Resistor (Score: 95)
```

### Compact

```bash
jlcpcb-search "10k resistor" --format compact
```

```
1. #C25804 - 10kΩ ±1% 0603 Thick Film Resis... - 0603 - 95.0
2. #C25879 - 10kΩ ±5% 0805 Thick Film Resis... - 0805 - 87.5
```

### Table

```bash
jlcpcb-search "capacitor 0603" --format table
```

```
#   LCSC     Manufacturer     Part Number      Package Score  Description
--- -------- ---------------- ---------------- ------- ------ -----------
1   #C14663  Samsung Electro  CL10B104KB8N...  0603    92.0   100nF 50V X7R...
2   #C1608   Samsung Electro  CL10A105KB8N...  0603    89.5   1µF 25V X5R...
```

### JSON

Machine-readable JSON output for programmatic integration. All non-JSON output (progress indicators, status messages) is suppressed.

```bash
jlcpcb-search "10k resistor 0603" --format json
```

```json
[{"lcsc":"25804","manufacturer":"UNI-ROYAL(Uniroyal Elec)","partNumber":"0603WAF1002T5E","description":"10kΩ ±1% 0603 Thick Film Resistor","package":"0603","score":95.0,"matchSummary":"Exact resistance match (100 pts), Package match (80 pts)"}]
```

When no results are found, returns `[]`. Errors are output as JSON objects:

```json
{"error":true,"message":"No search query provided","code":"MISSING_QUERY"}
```

Error codes include `MISSING_QUERY`, `INVALID_QUERY`, `TIMEOUT_ERROR`, `NETWORK_ERROR`, `FILE_SYSTEM_ERROR`, `PARSING_ERROR`, and `SYSTEM_ERROR`.

## typeCAD/pcb Integration

After displaying results, the CLI prompts to add a component to your typeCAD/pcb project:

```
Do you want to add a component from these results? (y/N) y
Enter the number of the result (1-5): 1
Running typecad-pcb add component for C25804...
```

## How It Works

### Database Management

1. **First Run** — Downloads the JLCPCB components CSV file (~3MB) to a shared cache directory in the OS temp folder
2. **Caching** — Stores the database with a timestamp for cache validation
3. **Auto-Update** — Re-downloads if the cache is older than 24 hours
4. **Offline Mode** — Falls back to cached data when the network is unavailable

### Parameter Parsing

The search engine recognizes and parses:

- **Electrical Values** — `10k`, `100nF`, `1µH`, `3.3V`
- **Units** — All standard electrical units with SI prefixes
- **Packages** — `0603`, `0805`, `SOT-23`, `SOIC-8`, etc.
- **Tolerances** — `±1%`, `±5%`, `+/-10%`
- **Component Types** — `X7R`, `NP0`, `MLCC`, `SMD`, `THT`
- **Keywords** — Manufacturer names, part families, descriptions

### Scoring

Components are scored on multiple factors:

| Factor | Points |
|--------|--------|
| Exact parameter match | 100 |
| Close parameter match | 50–90 |
| Exact package match | 80 |
| Similar package match | 40 |
| Component type match | 70 |
| Keyword relevance | 20–50 |
| Category match | 30 |

## Programmatic Usage

```typescript
import {
  Application,
  DataManager,
  ElectricalParameterParser,
  ComponentFuzzyScorer,
  ComponentSearchEngine,
} from "@typecad/jlcpcb-parts";

// Use the high-level Application class
const app = new Application(
  'https://cdfer.github.io/jlcpcb-parts-database/jlcpcb-components-basic-preferred.csv',
  'jlcpcb-components-basic-preferred.csv',
  '.',
  24,
  'jlcpcb-search'
);
await app.run(process.argv);

// Or build a custom search engine
const dataManager = new DataManager();
const parser = new ElectricalParameterParser();
const scorer = new ComponentFuzzyScorer();
const searchEngine = new ComponentSearchEngine(
  dataManager,
  parser,
  scorer,
  5,      // resultLimit
  10000,  // searchTimeout (ms)
  3600000 // cacheExpiration (ms)
);

const results = await searchEngine.search("10k resistor 0603");
```

## Cache Management

By default, cached files are stored in a shared OS temp directory so the database is shared across all projects. To force a refresh, delete the timestamp file in the cache directory, or simply wait for the 24-hour expiration.

The `DataManager` constructor accepts options for custom cache directories and expiration times:

```typescript
new DataManager(
  url,           // CSV download URL
  filename,      // local CSV filename
  cacheDir,      // cache directory (used when useSharedCache is false)
  expirationHrs, // cache expiration in hours
  useSharedCache // true = OS temp dir, false = cacheDir
);
```

## License

Apache-2.0
