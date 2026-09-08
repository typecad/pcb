<script lang="ts">
  import SvelteSeo from 'svelte-seo';
  import { WorkspaceViewer } from '$lib/components/examples/index.js';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import type { PageData } from './$types.js';

  let { data }: { data: PageData } = $props();
  // Derive so the view stays correct if `data` changes (navigation between examples).
  const ex = $derived(data.example);
  const canonical = $derived(`https://typecad.net/examples/${ex.slug}`);
  const title = $derived(`淆 ${ex.title} Example | typeCAD.net`);
</script>

<SvelteSeo
  {title}
  description={ex.description}
  {canonical}
  openGraph={{
    type: 'article',
    url: canonical,
    title: `${ex.title} — typeCAD Example`,
    description: ex.description,
    site_name: 'typeCAD',
  }}
/>

<svelte:head>
  <title>{title}</title>
</svelte:head>

<h1>{ex.title}</h1>
{#if ex.board}
  <p><Badge variant="secondary" class="text-xs font-normal">{ex.board}</Badge></p>
{/if}

{ex.description}

{#if ex.tags.length}
  <div class="not-prose mt-2 flex flex-wrap gap-1">
    {#each ex.tags as tag (tag)}
      <Badge variant="outline" class="text-[11px] font-normal">{tag}</Badge>
    {/each}
  </div>
{/if}

<div class="not-prose mt-6">
  <WorkspaceViewer example={ex} />
</div>
