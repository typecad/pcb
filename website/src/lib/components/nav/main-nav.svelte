<script lang="ts">
	import { Icons } from "../icons/index.js";
	import { page } from "$app/stores";
	import { siteConfig } from "$lib/config/site.js";
	import { cn } from "$lib/utils.js";
	import Icon from '@iconify/svelte';

</script>

<div class="mr-4 hidden md:flex">
	<a href="/" class="mr-6 flex items-center space-x-2">
		<!-- <Icon style="display:inline" icon="fluent-emoji-flat:fire" /> -->
		 <img src="/favicon.png" alt="logo" class="h-6 w-6" />
		<span class="hidden font-bold sm:inline-block">
			{siteConfig.name}
		</span>
	</a>
	<nav class="flex items-center gap-6 text-sm">
		<a
			href="/getting-started"
			class={cn(
				"transition-colors hover:text-foreground/80",
				$page.url.pathname === "/getting-started" ? "text-foreground" : "text-foreground/60"
			)}
		>
			Getting Started
		</a>
		<a
			href="/docs"
			class={cn(
				"transition-colors hover:text-foreground/80",
				$page.url.pathname === "/docs" ? "text-foreground" : "text-foreground/60"
			)}
		>
			Docs
		</a>
		<a
			href="/packages"
			class={cn(
				"transition-colors hover:text-foreground/80",
				$page.url.pathname.startsWith("/packages")
					? "text-foreground"
					: "text-foreground/60"
			)}
		>
			Packages
		</a>
		<a
			href="/examples"
			class={cn(
				"transition-colors hover:text-foreground/80",
				$page.url.pathname.startsWith("/examples") ? "text-foreground" : "text-foreground/60"
			)}
		>
			Examples
		</a>
		<a
			href="/news"
			class={cn(
				"transition-colors hover:text-foreground/80",
				$page.url.pathname.startsWith("/news")
					? "text-foreground"
					: "text-foreground/60"
			)}
		>
			News
		</a>
		<!-- <a
			href={siteConfig.links.github}
			target="_blank"
			rel="noopener noreferrer"
			class={cn(
				"hidden text-foreground/60 transition-colors hover:text-foreground/80 lg:block"
			)}
		>
			GitHub
		</a> -->
	</nav>
</div>
