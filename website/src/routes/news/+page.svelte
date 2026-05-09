<script lang="ts">
  import SvelteSeo from 'svelte-seo';
  const title: string = '📰 News | typeCAD.net';
  const url: string = 'https://typeCAD.net/news';
  const description: string =
    "Read are articles to see what we're up to";
  const image = '';
  const images = '';

  import { formatDate } from '$lib/utils';
  import type { Post } from '$lib/types/articles.js';
  import { badgeVariants } from '$lib/components/ui/badge';
  import Icon from '@iconify/svelte';

  export let tags: string[] = [];
  function parse_tags(posts: Post[]) {
    posts.forEach((post) => {
      post.categories.forEach((tag) => {
        if (tag != '') {
          tags.push(tag);
        }
      });
    });

    tags = tags.filter(function (elem, index, self) {
      return index === self.indexOf(elem);
    });
  }

  export let data;
  $: parse_tags(data.posts);
</script>

{#key tags}
  {#each tags as tag}
    <!-- <Badge variant="secondary">{tag}</Badge> -->
    <a href="/news/tag/{tag}" class={badgeVariants({ variant: 'default' })}
      >{tag}</a>
  {/each}
<br />
<br />
{/key}
<h1><Icon style="display:inline" icon="fluent-emoji-flat:newspaper" width="64" height="64" inline /> News</h1>
<br />

<div class="w-full  lg:py-3">
  <div class="container mx-auto flex flex-col ">
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 ">
      {#each data.posts as post}
        <div class="flex flex-col gap-2 hover:opacity-75">
          <h3 class="text-xl tracking-tight">
            <a href={post.slug}>{post.title}</a>
          </h3>
          <span class="date">{formatDate(post.date)}</span>
          <span class="text-muted-foreground text-base">
            {post.description}
          </span>
        </div>
      {/each}
    </div>
  </div>
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
		site_name: 'typeCAD',
		// images
	}}
/>