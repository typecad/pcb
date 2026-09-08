<script lang="ts">
  import SvelteSeo from 'svelte-seo';
  import Icon from '@iconify/svelte';
  import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
  } from '$lib/components/ui/card/index.js';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import type { PageData } from './$types.js';

  let { data }: { data: PageData } = $props();

  const title: string = '淆 Examples | typeCAD.net';
  const url: string = 'https://typeCAD.net/examples';
  const description: string =
    'Complete, real typeCAD hardware projects — browse the source, config, and board code exactly as they appear in VS Code.';
</script>

<svelte:head>
  <title>{title}</title>
</svelte:head>

<h1><Icon style="display:inline" inline icon="catppuccin:folder-node" /> Examples</h1>

Real, complete typeCAD projects you can browse like a VS Code workspace — every file is the actual source and config for a working board. Click in to explore the code and read the comments.

{#if data.examples.length === 0}
  <p class="text-muted-foreground">No projects yet. Check back soon.</p>
{:else}
  <div class="not-prose grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {#each data.examples as ex (ex.slug)}
      <a href="/examples/{ex.slug}" class="group block focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded-lg focus-visible:outline-none">
        <Card class="h-full transition-colors group-hover:border-primary/50">
          <CardHeader>
            <CardTitle class="flex items-center gap-2 text-lg">
              <Icon icon="catppuccin:folder" class="size-5" />
              {ex.title}
            </CardTitle>
            {#if ex.board}
              <CardDescription class="text-xs">{ex.board}</CardDescription>
            {/if}
          </CardHeader>
          <CardContent class="flex flex-col gap-3">
            <p class="text-sm text-muted-foreground line-clamp-3">{ex.description}</p>
            {#if ex.tags.length}
              <div class="flex flex-wrap gap-1">
                {#each ex.tags as tag (tag)}
                  <Badge variant="secondary" class="text-[11px] font-normal">{tag}</Badge>
                {/each}
              </div>
            {/if}
          </CardContent>
        </Card>
      </a>
    {/each}
  </div>
{/if}

<h2>Guides</h2>

<p>Step-by-step articles showing how to use <strong>type</strong>CAD</p>

<h3>Tutorial</h3>

<table>
  <thead>
    <tr><th></th><th></th></tr>
  </thead>
  <tbody>
    <tr><td><a href="/getting-started">Creating a project</a></td><td>creating and building a project</td></tr>
    <tr><td><a href="/examples/voltage-divider">Add/connect passives</a></td><td>make a voltage divider</td></tr>
    <tr><td><a href="/examples/attiny85">Add KiCAD Components</a></td><td>Add an MCU to your project</td></tr>
    <tr><td><a href="/examples/packages">Use typeCAD Packages</a></td><td>Add a typeCAD package</td></tr>
  </tbody>
</table>

<h3>Feature Guides</h3>

<table>
  <thead>
    <tr><th></th><th></th></tr>
  </thead>
  <tbody>
    <tr><td><a href="/examples/erc">ERC</a></td><td>run an electrical rule check on your schematic</td></tr>
    <tr><td><a href="/examples/bom">BOM</a></td><td>export a bill-of-material file from your schematic</td></tr>
    <tr><td><a href="/examples/ngspice">ngspice</a></td><td>run a simulation with your <strong>type</strong>CAD code</td></tr>
    <tr><td><a href="/examples/jlcpcb-export">JLCPCB-Export</a></td><td>export all the assembly files for JLCPCB</td></tr>
    <tr><td><a href="/examples/jig">Jig/Multi-boards</a></td><td>Create a test jig/multi-board with one codebase</td></tr>
    <tr><td><a href="/examples/autorouter">Auto Router</a></td><td>Auto-route tracks between connected pins</td></tr>
    <tr><td><a href="/examples/multilayer-board">Multilayer Boards</a></td><td>4+ layer boards: planes, impedance control, via policy</td></tr>
    <tr><td><a href="/examples/zones">Zones</a></td><td>Create copper zones and keepout areas</td></tr>
    <tr><td><a href="/examples/gitdiff">Visual PCB Diff</a></td><td>Compare two KiCAD PCB files visually</td></tr>
    <tr><td><a href="/examples/docgen">Documentation Gen</a></td><td>Generate HTML docs from Markdown + KiCAD PCB</td></tr>
    <tr><td><a href="/examples/import-kicad">Import KiCAD Board</a></td><td>Convert a KiCAD PCB to typeCAD code</td></tr>
  </tbody>
</table>

<SvelteSeo
  title={title}
  {description}
  canonical={url}
  jsonLd={{
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: title,
    description: description,
    url: url,
  }}
  openGraph={{
    title,
    description,
    url,
    type: 'website',
    site_name: 'typeCAD',
  }}
/>
