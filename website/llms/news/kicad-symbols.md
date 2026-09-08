---
title: KiCAD Symbol Search
description: Fuzzy search for KiCad schematic symbols with CLI interface
date: "2025-8-6"
categories:
  - tools
  - command-line
  - kicad
  - symbol
  - search
published: true
cover: https://unsplash.com/photos/g3-tXWPGBLc/download?ixid=M3wxMjA3fDB8MXxzZWFyY2h8MTB8fHN5bWJvbHN8ZW58MHwwfHx8MTc1NDQ4OTUxNHww&force=true&w=640
---
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

> **Note:** kicad-symbols is now bundled with `@typecad/pcb`. Install typecad to get the `kicad-symbols` CLI.

```bash
npm install @typecad/pcb
```

After installation, you can use the `kicad-symbols` command via npx:

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

## Integrate in your typeCAD project
Open your project's `package.json` and add the following line to the `scripts` section:

```
"KiCAD Symbol Search 🔍": "kicad-symbols"
```