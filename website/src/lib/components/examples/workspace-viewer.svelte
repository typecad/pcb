<script lang="ts">
	import FileTreeNode from './file-tree-node.svelte';
	import EditorTabs from './editor-tabs.svelte';
	import EditorPane from './editor-pane.svelte';
	import type { Example, ExampleFileNode } from '$lib/types/examples.js';

	let { example }: { example: Example } = $props();

	// Flatten the tree into a path → node lookup so selecting/opening a file is
	// O(1) regardless of tree depth.
	let filesByPath = $derived(new Map<string, ExampleFileNode>(collectFiles(example.tree)));

	// Open-file state lives here so the tree, tabs, and pane stay in sync.
	let openPaths = $state<string[]>([]);
	let activePath = $state<string | undefined>(undefined);

	let openFiles = $derived(
		openPaths
			.map((p) => filesByPath.get(p))
			.filter((f): f is ExampleFileNode => Boolean(f))
			.map((f) => ({ name: f.name, path: f.path }))
	);
	let activeFile = $derived(activePath ? filesByPath.get(activePath) : undefined);

	function collectFiles(
		node: Example['tree'],
		out: Array<[string, ExampleFileNode]> = []
	): Array<[string, ExampleFileNode]> {
		for (const child of node.children) {
			if (child.type === 'file') {
				out.push([child.path, child]);
			} else {
				collectFiles(child, out);
			}
		}
		return out;
	}

	// Open (or focus) a file from the tree, capping the number of open tabs so
	// the bar stays usable. Matches VS Code's "middle-ish" behavior — we don't
	// try to replicate its exact tab-cycling policy.
	function openFile(path: string) {
		if (!openPaths.includes(path)) {
			const next = [...openPaths, path];
			if (next.length > 8) next.shift();
			openPaths = next;
		}
		activePath = path;
	}

	function closeFile(path: string) {
		const idx = openPaths.indexOf(path);
		const next = openPaths.filter((p) => p !== path);
		openPaths = next;
		// If the closed tab was active, move focus to a neighbor.
		if (activePath === path) {
			activePath = next[Math.min(idx, next.length - 1)] ?? next[0];
		}
	}

	// Open the first file on mount so the pane isn't empty on first view. This
	// runs client- and server-side alike — no window access, so SSR is safe.
	$effect(() => {
		if (activePath === undefined && filesByPath.size > 0) {
			const first = [...filesByPath.values()][0];
			openFile(first.path);
		}
	});
</script>

<div
	class="overflow-hidden rounded-lg border border-neutral-700/60 bg-[#1e1e1e] shadow-2xl"
>
	<!-- Title bar — mimics a VS Code window frame with traffic-light dots. -->
	<div class="flex items-center gap-2 bg-[#323233] px-3 py-1.5">
		<span class="size-3 rounded-full bg-[#ff5f57]"></span>
		<span class="size-3 rounded-full bg-[#febc2e]"></span>
		<span class="size-3 rounded-full bg-[#28c840]"></span>
		<span class="ml-2 truncate text-[12px] text-neutral-400">{example.title} — typeCAD Example</span>
	</div>

	<!-- Responsive: side-by-side on md+, stacked on small screens. Both columns
	     share the same fixed height on md+ so the explorer and code pane line up;
	     the explorer scrolls internally, the code pane scrolls within its area. -->
	<!-- minmax(0, 1fr) + min-w-0 on the editor column: without them the track's
	     auto minimum is the code's min-content width, so a long line stretches
	     the whole page instead of scrolling inside the pane. -->
	<div class="grid grid-cols-1 md:h-[70vh] md:grid-cols-[220px_minmax(0,1fr)]">
		<!-- Activity-bar-less explorer (file tree) -->
		<aside class="max-h-[60vh] overflow-y-auto border-b border-white/5 bg-[#252526] p-1.5 md:h-full md:max-h-none md:border-b-0 md:border-r">
			<div class="px-2 py-1.5 text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">
				Explorer
			</div>
			{#each example.tree.children as node (node.path)}
				<FileTreeNode {node} {activePath} onselect={openFile} />
			{/each}
		</aside>

		<!-- Editor area: tabs + active file content. h-full + min-h-0 lets the
		     inner ScrollArea take ownership of vertical scrolling. -->
		<div class="flex h-full min-h-[60vh] min-w-0 flex-col md:min-h-0">
			{#if openFiles.length}
				<EditorTabs
					{openFiles}
					{activePath}
					onactivate={(p: string) => (activePath = p)}
					onclose={closeFile}
				/>
			{/if}
			{#if activeFile}
				<EditorPane file={activeFile} />
			{:else}
				<div class="flex flex-1 items-center justify-center text-[13px] text-neutral-500">
					Select a file from the explorer
				</div>
			{/if}
		</div>
	</div>
</div>
