<script lang="ts">
  import '../../markdown.css';
  let { children } = $props();
</script>

<!-- Single centered column (the docs container scaffolding, minus the
     sidebar/TOC rails the examples pages don't use). min-w-0 keeps
     unbreakable code lines scrolling inside the viewer instead of
     stretching the page. -->
<div class="container flex-1 items-start">
  <main class="relative min-w-0 py-6 lg:py-8">
    <div class="mx-auto w-full min-w-0">
      <div class="markdown pb-12 pt-8">
        {@render children?.()}
      </div>
    </div>
  </main>
</div>
