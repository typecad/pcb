<script lang="ts">
	import SvelteSeo from 'svelte-seo';
	const title: string = '🖿 Examples | typeCAD.net';
	const url: string = 'https://typeCAD.net/examples';
	const description: string = 'A list of examples to show how to use **type**CAD';
	const image = '';
	const images = '';

	import { buttonVariants } from "$lib/components/ui/button";
	import { AtSign } from 'lucide-svelte';
  	import Icon from '@iconify/svelte';

</script>

# <Icon style="display:inline" inline icon="catppuccin:folder-node" /> Examples

### Tutorial

|                                                   |                                 |
| :------------------------------------------------ | ------------------------------- |
| [Creating a project](/getting-started)            | creating and building a project |
| [Add/connect passives](/examples/voltage-divider) | make a voltage divider          |
| [Add KiCAD Components](/examples/attiny85)        | Add an MCU to your project      |
| [Use typeCAD Packages](/examples/packages)        | Add a typeCAD package           |

### Examples

A list of small examples to show how to use **type**CAD

|                                          |                                                    |
| :--------------------------------------- | -------------------------------------------------- |
| [ERC](/examples/erc)                     | run an electrical rule check on your schematic     |
| [BOM](/examples/bom)                     | export a bill-of-material file from your schematic |
| [ngspice](/examples/ngspice)             | run a simulation with your **type**CAD code        |
| [JLCPCB-Export](/examples/jlcpcb-export) | export all the assembly files for JLCPCB           |
| [Jig/Multi-boards](/examples/jig)        | Create a test jig/multi-board with one codebase    |
| [Auto Router](/examples/autorouter)      | Auto-route tracks between connected pins           |
| [Multilayer Boards](/examples/multilayer-board) | 4+ layer boards: planes, impedance control, via policy |
| [Zones](/examples/zones)                 | Create copper zones and keepout areas              |
| [Visual PCB Diff](/examples/gitdiff)     | Compare two KiCAD PCB files visually               |
| [Documentation Gen](/examples/docgen)    | Generate HTML docs from Markdown + KiCAD PCB       |
| [Import KiCAD Board](/examples/import-kicad) | Convert a KiCAD PCB to typeCAD code            |

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
		site_name: 'typeCAD',
		// images
	}}
/>
