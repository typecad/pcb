<script lang="ts">
	import FileTreeNode from './file-tree-node.svelte';
	import ChevronRight from 'lucide-svelte/icons/chevron-right';
	import Icon from '@iconify/svelte';
	import { cn } from '$lib/utils.js';
	import { fileIconFor } from './file-icons.js';
	import type { ExampleNode } from '$lib/types/examples.js';

	let {
		node,
		activePath = undefined,
		indent = 0,
		onselect
	}: {
		node: ExampleNode;
		activePath?: string | undefined;
		indent?: number;
		onselect?: (path: string) => void;
	} = $props();

	// Folders start expanded — most example projects are small enough to show
	// in full, and this matches VS Code's behavior for freshly-opened workspaces.
	let open = $state(true);
</script>

{#if node.type === 'folder'}
	<button
		type="button"
		onclick={() => (open = !open)}
		style="padding-left: {indent + 6}px"
		class="flex w-full items-center gap-1 rounded px-1.5 py-1 text-left text-[13px] text-neutral-300 hover:bg-white/5"
	>
		<ChevronRight
			class={cn(
				'size-3.5 shrink-0 text-neutral-500 transition-transform',
				open && 'rotate-90'
			)}
		/>
		<Icon
			icon={open ? 'catppuccin:folder-open' : 'catppuccin:folder'}
			class="size-4 shrink-0"
		/>
		<span class="truncate">{node.name}</span>
	</button>
	{#if open && node.children.length}
		{#each node.children as child (child.path)}
			<FileTreeNode
				node={child}
				{activePath}
				indent={indent + 12}
				{onselect}
			/>
		{/each}
	{/if}
{:else}
	<button
		type="button"
		onclick={() => onselect?.(node.path)}
		style="padding-left: {indent + 22}px"
		class={cn(
			'flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[13px] transition-colors',
			activePath === node.path
				? 'bg-white/10 text-white'
				: 'text-neutral-400 hover:bg-white/5 hover:text-neutral-200'
		)}
	>
		<Icon icon={fileIconFor(node.name)} class="size-4 shrink-0" />
		<span class="truncate">{node.name}</span>
	</button>
{/if}
