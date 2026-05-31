<script lang="ts">
	import { page } from "$app/state";
	import { docsConfig } from "$lib/config/docs.js";
	import type { NavItem, SidebarNavItem } from "$lib/types/nav.js";
	import ChevronLeft from "lucide-svelte/icons/chevron-left";
	import ChevronRight from "lucide-svelte/icons/chevron-right";

	function flatten(navItems: SidebarNavItem[]): NavItem[] {
		return navItems
			.flatMap((group) => group.items ?? [])
			.filter((item) => !item?.disabled && item.href);
	}

	const allDocsLinks = $derived(
		flatten(docsConfig.docsNav).concat(flatten(docsConfig.packageNav))
	);

	const pager = $derived.by(() => {
		const pathname = page.url.pathname;
		const activeIndex = allDocsLinks.findIndex((link) => link.href === pathname);
		if (activeIndex === -1) return { prev: null, next: null };
		return {
			prev: activeIndex > 0 ? allDocsLinks[activeIndex - 1] : null,
			next: activeIndex < allDocsLinks.length - 1 ? allDocsLinks[activeIndex + 1] : null,
		};
	});
</script>

<div class="flex items-center justify-between mt-12 pt-6 border-t">
	{#if pager.prev?.href}
		<a href={pager.prev.href} class="inline-flex items-center gap-1 text-sm font-medium text-[#4d9375] hover:underline">
			<ChevronLeft class="h-4 w-4" />
			{pager.prev.title}
		</a>
	{:else}
		<div></div>
	{/if}
	{#if pager.next?.href}
		<a href={pager.next.href} class="inline-flex items-center gap-1 text-sm font-medium text-[#4d9375] hover:underline ml-auto">
			{pager.next.title}
			<ChevronRight class="h-4 w-4" />
		</a>
	{/if}
</div>
