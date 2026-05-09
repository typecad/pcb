---
title: Hardware Design with AI
description: Use AI to create reference designs from a datasheet
date: '2025-4-8'
categories:
  - tools
  - command-line
  - git
  - wiring
  - code-as-schematic
published: true
cover: https://unsplash.com/photos/XJuogr6jhv8/download?ixid=M3wxMjA3fDB8MXxzZWFyY2h8Mnx8YWklMjBoYXJkd2FyZXxlbnwwfHx8fDE3NDQ1NjU1ODZ8MA&force=true&w=640
---

# Hardware Design with AI

**typeCAD-prompt** is a specialized tool designed to integrate **typeCAD** with AI coding models, enabling users to generate detailed prompts for transforming IC reference designs into typeCAD packages. Leverage AI capabilities, such as those provided by Gemini 2.5, to help with the hardware design process.

### Key Features  
- **Automated Component Analysis**: The tool identifies components from schematics and cross-references datasheets to ensure accurate selection.  
 
- **Interactive Refinement**: Users can interact with the AI to confirm component details, adjust configurations, and resolve ambiguities during the design process.  

### Workflow Overview  
1. **Input Preparation**: Provide an IC datasheet (PDF or plaintext) and a schematic image. The tool generates a structured prompt for the AI model.  
2. **Prompt Execution**: Use an AI platform like Cursor to execute the prompt. The AI analyzes the schematic, references the datasheet, and creates a typeCAD package.  

### Installation and Usage  
Install **typeCAD-prompt** globally using the following command:  

```bash
npm i -g @typecad/typecad-prompt
```

Read more about using it [here](https://www.npmjs.com/package/@typecad/typecad-prompt).