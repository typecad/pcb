<script lang="ts">
  // import * as Icon from "$lib/components/docs/icons/index.js";
  // import ModeToggle from "$lib/components/ui/mode-toggle.svelte";
  // import CommandMenu from "$lib/components/docs/command-menu.svelte";
  import MainNav from '$lib/components/nav/main-nav.svelte';
  import MobileNav from '$lib/components/nav/mobile-nav.svelte';
  import Search from '$lib/components/search.svelte';
  import { buttonVariants } from '$lib/components/ui/button/index.js';
  import { siteConfig } from '$lib/config/site.js';
  import { cn } from '$lib/utils.js';
  import Icon from '@iconify/svelte';

</script>

<header
  class="border-border/40 bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 w-full border-b backdrop-blur">
  <div class="container flex h-14 max-w-screen-2xl items-center">
    <MainNav />
    <MobileNav />
    <div
      class="flex flex-1 items-center justify-end space-x-2 md:justify-end">
      <div class="w-full flex-1 md:w-auto md:flex-none">
        <Search />
      </div>
      <a href='https://www.reddit.com/r/typecad/' target="_blank" rel="noreferrer" >
          <Icon icon="ant-design:reddit-outlined" width="32" height="32" />
      </a>
    </div>
  </div>
</header>
