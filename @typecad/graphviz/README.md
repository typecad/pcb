# typeCAD Graphviz
View connections in your typeCAD project. 

## Getting Started

### Prerequisites

- a working [typeCAD](https://typecad.net) project
- [Graphviz Interactive Preview](https://marketplace.visualstudio.com/items?itemName=tintinweb.graphviz-interactive-preview)

### Installation
Run the following command in your project directory, where your typeCAD package.json file is located:

```npm i @typecad/graphviz```

## Usage

```ts
import { PCB, Schematic } from '@typecad/typecad';
import { graphviz } from '@typecad/graphviz';

let typecad = new Schematic('project');

typecad.create();
graphviz(typecad.Schematic);
```

### Options
#### Themes
There are 3 themes available:
- `light`
- `dark`
- `nord`

```ts
graphviz(typecad.Schematic, { theme: 'nord' });
```

#### Ignored Prefixes
By default, components with the following reference designator prefixes are ignored: `'R', 'C', 'L', 'D', 'SW', 'SJ'`. This default behavior leaves just the major components, this can be changed:

```ts
graphviz(typecad.Schematic, { theme: 'light', ignoredPrefixes: new Set(['SW', 'SJ']) });
```

#### All Connections
By default, only connections that are named (`typecad.named('en').net(...);`) are graphed. This behavior can be changed:

```ts
graphviz(typecad.Schematic, {theme: 'dark', ignoredPrefixes: new Set(['SW', 'SJ']), ignoreNetNames: false });
```
### View
Open the `project_net_connectivity.dot` file. Ensure the plugin linked above is installed and use that to view the graph. 

In the graph preview window, there are some options, choosing `Bidirectional` will show the most applicable information when clicking on the graph components. Visually, `Dot` and `FDP` are probably the most useful.