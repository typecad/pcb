<script lang="ts">
  import { ModeWatcher } from 'mode-watcher';
  import '../app.css';
  import { config } from '$lib/stores/index.js';
  import { Toaster as DefaultSonner } from '$lib/components/ui/sonner/index.js';
  import * as Dialog from '$lib/components/ui/dialog';
  import { siteConfig } from '$lib/config/site';

  import SiteHeader from '$lib/components/site-header.svelte';
  import SiteFooter from '$lib/components/site-footer.svelte';
  import { page } from "$app/state";
  import { dev } from '$app/environment';

  let { children } = $props();
</script>

<ModeWatcher />
<!-- <Metadata /> -->
<DefaultSonner position="top-right" />

<div
  class="relative flex min-h-screen flex-col bg-background"
  id="page"
  data-vaul-drawer-wrapper>
  <SiteHeader />
    <!-- <div in:fade={{ duration: 300 }}> -->
      <!-- <slot /> -->
    <!-- </div> -->
    <div>
    {@render children?.()}
  </div>
  <SiteFooter />
</div>
