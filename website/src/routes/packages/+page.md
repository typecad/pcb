<script lang="ts">
	import SvelteSeo from 'svelte-seo';
	const title: string = '📦 Packages | typeCAD.net';
	const url: string = 'https://typecad.net/packages';
	const description: string = 'typeCAD Packages';
	const image = '';
	const images = '';

	import { buttonVariants } from "$lib/components/ui/button";
	import { AtSign } from 'lucide-svelte';
  	import Icon from '@iconify/svelte';

</script>

# <Icon style="display:inline" inline icon="fluent-emoji-flat:package" /> Packages

## Reference Designs

|                                                                     |                                                                                                                                     |
| :-----------------------------------------------------------------: | ----------------------------------------------------------------------------------------------------------------------------------- |
|   [rd-ESP32S3](https://www.npmjs.com/package/@typecad/rd_esp32s3)   | reference design for the ESP32-S3-MINI-1-N8. A module that provides 2.4 GHz b/g/n WiFi and BLE 5 connectivity, MCU, and PCB antenna |
| [rd-ISL9120IR](https://www.npmjs.com/package/@typecad/rd_isl9120ir) | reference design for the ISL9120IR. A Compact High Efficiency Low Power Buck-Boost Regulator                                        |
|   [rd-bq24210](https://www.npmjs.com/package/@typecad/rd-bq24210)   | reference design for the bq24210 800-mA, Single-Input, Single-Cell Li-Ion Battery Solar Charger                                     |

## Utility packages

|                                                                           |                                                                                                     |
| :-----------------------------------------------------------------------: | --------------------------------------------------------------------------------------------------- |
|        [graphviz](https://www.npmjs.com/package/@typecad/graphviz)        | view connections in your typeCAD project                                                            |
|         [ngspice](https://www.npmjs.com/package/@typecad/ngspice)         | ngspice Simulation for typeCAD                                                                      |
|          [wiring](https://www.npmjs.com/package/@typecad/wiring)          | Programmatically Create Wiring Diagrams                                                             |
|   [jlcpcb-export](https://www.npmjs.com/package/@typecad/jlcpcb-export)   | export all the required files for JLCPCB assembly from a typeCAD project                            |
|  [typecad-docgen](https://www.npmjs.com/package/@typecad/typecad-docgen)  | convert markdown files and KiCAD PCBs into documentation with support for layer exports and renders |
| [typecad-gitdiff](https://www.npmjs.com/package/@typecad/typecad-gitdiff) | See the differences between KiCAD PCB files                                                         |
|   [kicad2typecad](https://www.npmjs.com/package/@typecad/kicad2typecad)   | Parse KiCad PCB board files and generate typeCAD code                                               |
|    [jlcpcb-parts](https://www.npmjs.com/package/@typecad/jlcpcb-parts)    | Fuzzy search for JLCPCB basic and preferred electrical components                                   |
|    [typecad-mcp](https://www.npmjs.com/package/@typecad/typecad-mcp)    |  Provides AI assistants with direct access to typeCAD tools and workflows                                   |
|    [kicad-symbols](https://www.npmjs.com/package/@typecad/kicad-symbols)    | Fuzzy search for KiCad schematic symbols                                 |

<SvelteSeo
{title}
{description}
canonical={url}
jsonLd={{
		'@context': 'https://schema.org',
		'@type': 'WebSite',
		name: title,
		description: description,
		url: url,
		image: image,
	}}
openGraph={{
		title,
		description,
		url,
		type: 'website',
		site_name: 'typeCAD.net',
		// images
	}}
/>
