<script lang="ts">
  import Youtube from "svelte-youtube-embed";
</script>

# Getting Started with typeCAD

Welcome to typeCAD! This guide will help you get started with our hardware design platform.

## What is typeCAD?

typeCAD is a modern hardware design platform that brings the power of TypeScript to electronic design. It allows you to:

- Create modular, reusable hardware designs
- Version control your hardware designs using git
- Generate production-ready outputs for manufacturing
- Collaborate with other designers using familiar development tools

## Quick Start
<Youtube id="FXCOt-fHv8k" />


1. **Install Node.js**
- Download and install [Node.js](https://nodejs.org/) (LTS version recommended)
- Verify installation by running `node --version` in your terminal

2. **Create Your First Project**
   ```bash
   npx --package=@typecad/typecad create-typecad
   ```
3. **Start Designing**
- Open the project in VS Code
- Begin creating your hardware design using TypeScript
- `build` your code to generate outputs

4. **Layout in KiCAD**
  - Open the `kicad_pcb` file in the `./build` folder
  - Your components and connections will be there
  - If you make changes in typeCAD, you can see them by clicking `File > Revert`. 


## Next Steps
- Start with making a simple [voltage divider circuit](/examples/voltage-divider)
- Read [Connections](/docs/connections) to understand how to connect components
- Watch the [tutorial](https://www.youtube.com/playlist?list=PLzTWHKWJmn-ZdJCpKFHzbfI75WpUhXyTu) videos
- Check out our [Documentation](/docs) for detailed guides
- If you run into issues, see [Troubleshooting](/docs/troubleshooting)
- Explore [Examples](/examples) to see typeCAD in action
- Join our [Reddit community](https://www.reddit.com/r/typecad/) for support and discussions

## Quick Reference
**Connecting components**: Use `typecad.net(pin1, pin2)` - pins do NOT have a `.connect()` method  
**Adding components**: Always run `npx add-component` from the `hw/` directory  
**Pin access**: Use `component.pin(1)` for passives, `component.VCC` for ICs
