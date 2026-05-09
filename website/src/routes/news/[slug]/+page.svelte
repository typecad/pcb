<script lang="ts">
  export let data;

  import SvelteSeo from 'svelte-seo';
  import Cover from '$lib/components/cover.svelte';
  const title: string = `${data.meta.title} | typeCAD`;
  const url: string = 'https://typecad.net/news/tag';
  const description: string = `${data.meta.description}`;
  const image = data.meta.cover || '';
  const images = '';

  import { formatDate } from '$lib/utils';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { badgeVariants } from '$lib/components/ui/badge';
  import '../../../markdown.css';
  import { ChevronLeft } from 'lucide-svelte';
  import Button from '$lib/components/ui/button/button.svelte';
</script>

{#if data.meta.cover}
  <Cover image={data.meta.cover} alt={data.meta.title} />
{/if}

<article>
  <!-- Tags -->
  <div class="tags">
    {#each data.meta.categories as category}
      <a
        href="/news/tag/{category}"
        class={badgeVariants({ variant: 'secondary' })}>{category}</a>
    {/each}
  </div>

  <!-- Post -->
  <div>
    <svelte:component this={data.content} />
  </div>
</article>

<SvelteSeo
  {title}
  {description}
  canonical={url}
  jsonLd={{
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: title,
    description: description,
    url: url,
    image: image,
    publisher: 'typeCAD',
    dateCreated: data.meta.date,
    articleBody: data.content
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

