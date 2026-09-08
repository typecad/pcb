<script lang="ts">
	import { ScrollArea } from '$lib/components/ui/scroll-area/index.js';
	import Copy from 'lucide-svelte/icons/copy';
	import Check from 'lucide-svelte/icons/check';
	import type { ExampleFileNode } from '$lib/types/examples.js';

	let { file }: { file: ExampleFileNode } = $props();

	// Break the path into breadcrumb segments: blink > src > main.ts
	let crumbs = $derived(file.path.split('/'));

	let copied = $state(false);
	async function copySource() {
		// The HTML is trusted (we generated it). Extract the text content for
		// the clipboard without the syntax-highlight spans.
		const host = document.getElementById('vscode-code-host');
		const text = host?.querySelector('code')?.textContent ?? '';
		try {
			await navigator.clipboard.writeText(text);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// Clipboard may be unavailable (permissions, non-secure context).
		}
	}
</script>

<ScrollArea codeBlockMode orientation="both" class="vscode-pane flex min-h-0 flex-1 flex-col">
	<!-- Breadcrumb + actions bar -->
	<div
		class="flex items-center justify-between border-b border-white/5 bg-[#1e1e1e] px-4 py-1.5 text-[12px] text-neutral-400"
	>
		<nav class="flex items-center gap-1 overflow-x-auto">
			{#each crumbs as crumb, i}
				{#if i > 0}
					<span class="text-neutral-600">›</span>
				{/if}
				<span class={i === crumbs.length - 1 ? 'text-neutral-200' : ''}>{crumb}</span>
			{/each}
		</nav>
		<button
			type="button"
			onclick={copySource}
			class="flex shrink-0 items-center gap-1 rounded px-2 py-1 text-neutral-400 hover:bg-white/5 hover:text-neutral-200 focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:outline-none"
			aria-label="Copy file contents"
		>
			{#if copied}
				<Check class="size-3.5 text-green-400" />
				<span class="text-green-400">Copied</span>
			{:else}
				<Copy class="size-3.5" />
				<span>Copy</span>
			{/if}
		</button>
	</div>

	<!-- The Shiki HTML is trusted: generated at build time by our own script. -->
	<div id="vscode-code-host" class="vscode-code min-w-0 flex-1">
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html file.html}
	</div>
</ScrollArea>

<style>
	/* Shiki emits class="shiki dark-plus", which the global app.css `.shiki`
	   rules (the site-wide `step` line-number counter + vitesse background)
	   also target. Those rules are meant for the markdown code blocks, not this
	   viewer. We override them scoped under .vscode-pane so the two systems
	   don't collide.

	   All selectors are wrapped in :global() because the Shiki HTML arrives via
	   {@html} and Svelte can't statically see the elements. */

	/* Reset the global `step` counter so it doesn't emit a second line number,
	   and set our own. Also drop the global card-colored background. */
	:global(.vscode-pane .shiki) {
		background-color: #1e1e1e !important;
		margin: 0;
		padding: 0;
		counter-reset: vscode-line;
	}

	/* Each Shiki line becomes its own row. white-space: pre lives HERE (on the
	   line), not on <code>: Shiki emits a literal newline between each
	   </span><span class="line">, and white-space: pre on <code> would render
	   those inter-line newlines as blank lines — double spacing. Putting pre on
	   .line preserves indentation within a line without honoring the breaks
	   between block-level line spans. */
	:global(.vscode-pane .shiki .line) {
		padding: 0 1rem 0 3.5rem;
		position: relative;
		white-space: pre;
		line-height: 1.5;
	}

	/* Our line numbers. The higher-specificity selector + !important makes this
	   win over the global .shiki .line::before { content: counter(step) }. */
	:global(.vscode-pane .shiki .line::before) {
		counter-increment: vscode-line;
		content: counter(vscode-line) !important;
		position: absolute;
		left: 0;
		width: 2.5rem;
		text-align: right;
		color: #6e7681;
		user-select: none;
	}

	:global(.vscode-pane .shiki code) {
		font-family: var(--font-mono, ui-monospace, 'SF Mono', Menlo, Consolas, monospace);
		font-size: 13px;
		line-height: 1;
		display: block;
		background: transparent !important;
	}
</style>

