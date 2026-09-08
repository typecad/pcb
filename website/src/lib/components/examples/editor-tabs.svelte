<script lang="ts">
	import X from 'lucide-svelte/icons/x';
	import Icon from '@iconify/svelte';
	import { cn } from '$lib/utils.js';
	import { fileIconFor } from './file-icons.js';

	let {
		openFiles,
		activePath,
		onactivate,
		onclose
	}: {
		// `name` is the short label (basename); `path` is the unique key.
		openFiles: { name: string; path: string }[];
		activePath: string | undefined;
		onactivate?: (path: string) => void;
		onclose?: (path: string) => void;
	} = $props();
</script>

<div class="flex items-stretch overflow-x-auto bg-[#252526] text-[13px]">
	{#each openFiles as file (file.path)}
		{@const isActive = activePath === file.path}
		<div
			class={cn(
				'group flex cursor-pointer items-center gap-1.5 border-r border-black/30 px-3 py-2 whitespace-nowrap transition-colors',
				isActive
					? 'bg-[#1e1e1e] text-white'
					: 'bg-[#2d2d2d] text-neutral-400 hover:bg-[#252526]'
			)}
			role="tab"
			tabindex="0"
			aria-selected={isActive}
			onclick={() => onactivate?.(file.path)}
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					onactivate?.(file.path);
				}
			}}
		>
			<Icon icon={fileIconFor(file.name)} class="size-4 shrink-0" />
			<span>{file.name}</span>
			<button
				type="button"
				aria-label="Close tab"
				class="ml-1 rounded p-0.5 text-neutral-500 hover:bg-white/10 hover:text-neutral-200 focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:outline-none"
				onclick={(e) => {
					e.stopPropagation();
					onclose?.(file.path);
				}}
			>
				<X class="size-3.5" />
			</button>
		</div>
	{/each}
</div>
