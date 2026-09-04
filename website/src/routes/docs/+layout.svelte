<script lang="ts">
  import { DocsSidebarNav } from '$lib/components/nav/index.js';
  import TableOfContents from '$lib/components/table-of-contents.svelte';
  import DocsPager from '$lib/components/docs-pager.svelte';
  import { ScrollArea } from '$lib/components/ui/scroll-area/index.js';
  import { docsConfig } from '$lib/config/docs.js';
  import '../../markdown.css';
  let { children } = $props();
  import { page } from "$app/state";

  const allItems = docsConfig.docsNav.flatMap(g => g.items ?? []).concat(
    docsConfig.packageNav.flatMap(g => g.items ?? [])
  );

  const currentItem = $derived(
    allItems.find(item => item.href === page.url.pathname)
  );
</script>

<div class="">
  <div
    class="container flex-1 items-start md:grid md:grid-cols-[220px_1fr] md:gap-6 lg:grid-cols-[240px_1fr] lg:gap-10">
    <aside
      class="fixed top-14 z-30 -ml-2 hidden h-[calc(100vh-3.5rem)] w-full shrink-0 md:sticky md:block">
      <ScrollArea class="h-full py-6 pr-6 lg:py-8">
        <DocsSidebarNav items={docsConfig.docsNav} />
        <DocsSidebarNav items={docsConfig.packageNav} />
      </ScrollArea>
    </aside>
    <main
      class="relative py-6 lg:gap-10 lg:py-8 xl:grid xl:grid-cols-[1fr_200px] min-w-0">
      <div class="mx-auto w-11/12 min-w-0">
        {#if currentItem && page.url.pathname !== '/docs'}
          <div class="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground pt-6">
            <a href="/docs" class="hover:text-foreground transition-colors">Docs</a>
            {#if currentItem.group}
              <span class="text-border">/</span>
              <span>{currentItem.group}</span>
            {/if}
            <span class="text-border">/</span>
            <span class="text-foreground">{currentItem.title}</span>
          </div>
        {/if}
        <div class="markdown pb-12 pt-8" id="markdown">
          {@render children?.()}
        </div>
        {#if page.url.pathname !== '/docs'}
          <DocsPager />
        {/if}
      </div>
      <div class="hidden text-sm xl:block">
        <div class="sticky top-16 -mt-10 h-[calc(100vh-3.5rem)] pt-6">
          <ScrollArea class="h-full">
            {#key page.url.pathname}
              <TableOfContents />
            {/key}
          </ScrollArea>
        </div>
      </div>
    </main>
  </div>
</div>
