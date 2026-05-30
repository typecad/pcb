<script lang="ts">
    import SvelteSeo from 'svelte-seo';
	const title: string = '📗 Docs | typeCAD.net';
	const url: string = 'https://typecad.net/packages';
	const description: string = 'typeCAD Packages';
	const image = '';
	const images = '';

    import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
    import { buttonVariants } from "$lib/components/ui/button";
    import ChevronRight from "lucide-svelte/icons/chevron-right";
    let { data }: { data: PageData } = $props();
</script>

# 📗 **type**CAD Documentation

These pages show **type**CAD in a user-focused way, without getting into the details of class properties and methods and less-used options.

## Quick Start Guide
1. [Getting Started](/getting-started) - Create your first project with `typecad create`
2. [Configuration](/docs/configuration) - Set up your project with `typecad.conf.ts`
3. [Connections](/docs/connections) - Learn the syntax for connecting components  
4. [Project Structure](/docs/project-structure) - Understand where files go

## Essential Concepts
- [Connections](/docs/connections) - How to connect pins (most important!)
- [Pins](/docs/pins) - Understanding pin access methods
- [Components](/docs/components) - Adding and using components
- [Passives](/docs/passives) - Resistors, capacitors, and other passive components

## CLI Tools
- [Tooling](/docs/tooling) - Overview of all `typecad` CLI commands
- [CLI Reference](/docs/cli) - Detailed command reference
- [Configuration](/docs/configuration) - `typecad.conf.ts` and `defineConfig()`

## Features
- [Git Diff](/docs/gitdiff) - Visual PCB comparison with `typecad diff`
- [DocGen](/docs/docgen) - Documentation generation with `typecad doc`
- [Import from KiCAD](/docs/import) - Convert existing boards with `typecad import`
- [Hardware Contract](/docs/hardware-contract) - Bridge hardware and firmware

The Docs section focuses on learning the basics. You'll probably want to start there. After that, have a look at the Packages section to learn how to fully use **type**CAD.

<div class="relative">
<br/>
<br/>
<br/>
    <p class="absolute right-0">
       <a href="/docs/requirements" class={buttonVariants({ variant: "outline" })}>Requirements <ChevronRight /></a>
    </p>
</div>

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
