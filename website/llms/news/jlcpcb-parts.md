---
title: JLCPCB Parts
description: An easy way to search for basic and preferred components from JLCPCB's catalog
date: '2025-7-22'
categories:
  - tools
  - command-line
  - jlcpcb
  - parts
published: true
cover: https://unsplash.com/photos/bByhWydZLW0/download?ixid=M3wxMjA3fDB8MXxzZWFyY2h8MjB8fGxpYnJhcnl8ZW58MHwwfHx8MTc1MzE5NjEyNnww&force=true&w=640
---

# JLCPCB Parts

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

### Global Installation

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

[Read the full documentation here](https://www.npmjs.com/package/@typecad/jlcpcb-parts)