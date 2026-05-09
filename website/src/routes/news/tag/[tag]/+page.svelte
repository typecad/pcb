<script lang="ts">
  import type { PageData } from './$types';
  import { formatDate } from '$lib/utils';
  import Button from '$lib/components/ui/button/button.svelte';
  import { Badge } from '$lib/components/ui/badge/index.js';
  import { badgeVariants } from '$lib/components/ui/badge';
  import {ChevronLeft} from "lucide-svelte";

  export let data: PageData;
</script>
<Button variant="outline" onclick={() => window.history.back()}><ChevronLeft class="h-5 w-5" /> Back</Button>
<br /><br />
<h1><code>{data.tag}</code> Tag</h1>
<section>
  <div class="w-full py-20 lg:py-10">
    <div class="container mx-auto flex flex-col gap-7">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-8">
        {#each data.tagged_posts as post}
          <div class="flex-col gap-2 hover:opacity-75">
            <h3 class="text-xl tracking-tight">
              <a href={post.slug}>{post.title}</a>
            </h3>
            <p class="date">{formatDate(post.date)}</p>
            <p class="text-muted-foreground text-base">
              {post.description}
            </p>
			{#each post.categories as category}
              <a
                href="/news/tag/{category}"
                class={badgeVariants({ variant: 'default' })}>{category}</a>
            {/each}
          </div>
        {/each}
      </div>
    </div>
  </div>

  {#if data.tagged_posts.length == 0}
    <h2>👺</h2>
    <p>Nothing here for `{data.tag}`</p>
    <br />
    <Button variant="outline" onclick={() => window.history.back()}><ChevronLeft class="h-5 w-5" /> Back</Button>

  {/if}
</section>
