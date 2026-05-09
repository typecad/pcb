<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import * as Command from '$lib/components/ui/command';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import Search from 'lucide-svelte/icons/search';
	import File from 'lucide-svelte/icons/file';
	import Book from 'lucide-svelte/icons/book';
	import Newspaper from 'lucide-svelte/icons/newspaper';
	import Package from 'lucide-svelte/icons/package';
	import Play from 'lucide-svelte/icons/play';
	import type { SearchResult } from '../../routes/api/search/+server';
	
	type EnhancedSearchResult = SearchResult & { 
		score?: number; 
		contextualPreview?: string; 
	};

	let { open = $bindable(false) } = $props();

	let searchResults: SearchResult[] = $state([]);
	let filteredResults: EnhancedSearchResult[] = $state([]);
	let searchQuery = $state('');
	let loading = $state(false);

	// Load search data
	onMount(async () => {
		try {
			loading = true;
			const response = await fetch('/api/search');
			if (response.ok) {
				searchResults = await response.json();
				filteredResults = searchResults;
			}
		} catch (error) {
			console.error('Failed to load search data:', error);
		} finally {
			loading = false;
		}
	});

		// Filter results based on search query
	$effect(() => {
		if (!searchQuery.trim()) {
			filteredResults = searchResults.slice(0, 8); // Show recent results
			return;
		}

		const query = searchQuery.toLowerCase().trim();
		
		// Security: Limit query length to prevent ReDoS and memory exhaustion
		if (query.length > 100) {
			filteredResults = [];
			return;
		}
		
		// Security: Reject queries with suspicious patterns (only unescaped special chars)
		if (/^[(){}[\]\\^$|*+?]+$/.test(query)) {
			filteredResults = [];
			return;
		}
		
		// Note: Allow searching for common words like 'typecad' and 'kicad'
		// These are actually meaningful search terms for this documentation site
		
		// Create regex once for better performance
		const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		
		// Security: Use try-catch to prevent regex errors
		let wordBoundaryRegex: RegExp, startsWithRegex: RegExp;
		try {
			wordBoundaryRegex = new RegExp(`\\b${escapedQuery}\\b`, 'i');
			startsWithRegex = new RegExp(`\\b${escapedQuery}`, 'i');
		} catch (e) {
			// If regex creation fails, fall back to safe string matching
			filteredResults = searchResults.filter(result => 
				result.title.toLowerCase().includes(query) || 
				result.content.toLowerCase().includes(query)
			).slice(0, 8);
			return;
		}
		
		const results = searchResults
			.map(result => {
				const titleLower = result.title.toLowerCase();
				const contentLower = result.content.toLowerCase();
				const hrefLower = result.href.toLowerCase();
				
				let score = 0;
				
				// Exact title match gets highest score
				if (titleLower === query) score += 100;
				// Title starts with query as word gets high score
				else if (startsWithRegex.test(titleLower)) score += 50;
				// Title contains query as whole word gets medium score
				else if (wordBoundaryRegex.test(titleLower)) score += 20;
				
				// URL path word matches get good scores
				if (wordBoundaryRegex.test(hrefLower)) score += 15;
				
				// Content word matches get lower scores
				if (wordBoundaryRegex.test(contentLower)) score += 5;
				
				// Fallback: if no word boundary matches, check for substring in content only
				if (score === 0 && contentLower.includes(query)) score += 1;
				
				// Boost relevance for exact brand/technology matches
				if (['typecad', 'kicad'].includes(query)) {
					score = Math.max(score, 3); // Ensure these get decent scores
				}
				
				// Generate contextual excerpt if the search term is found in content
				let contextualPreview = result.preview;
				if (score > 0) {
					const match = wordBoundaryRegex.exec(result.content) || result.content.toLowerCase().indexOf(query);
					if (match) {
						const matchIndex = typeof match === 'number' ? match : match.index;
						const start = Math.max(0, matchIndex - 50);
						const end = Math.min(result.content.length, matchIndex + query.length + 50);
						
						let excerpt = result.content.slice(start, end);
						
						// Add ellipsis if we're not at the beginning/end
						if (start > 0) excerpt = '...' + excerpt;
						if (end < result.content.length) excerpt = excerpt + '...';
						
						contextualPreview = excerpt;
					}
				}
				
				return { ...result, score, contextualPreview };
			})
			.filter(result => result.score > 0)
			.sort((a, b) => b.score - a.score)
			.slice(0, 8);

		filteredResults = results;
	});

	function handleSelect(result: EnhancedSearchResult) {
		open = false;
		goto(result.href);
	}

	function getCategoryIcon(category: string) {
		switch (category) {
			case 'docs':
				return Book;
			case 'examples':
				return Play;
			case 'news':
				return Newspaper;
			case 'packages':
				return Package;
			case 'getting-started':
				return File;
			default:
				return File;
		}
	}

	function getCategoryColor(category: string) {
		switch (category) {
			case 'docs':
				return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300';
			case 'examples':
				return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300';
			case 'news':
				return 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300';
			case 'packages':
				return 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300';
			case 'getting-started':
				return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300';
			default:
				return 'bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300';
		}
	}

	// Keyboard shortcut handling
	onMount(() => {
		function handleKeydown(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
				e.preventDefault();
				open = !open;
			}
		}

		document.addEventListener('keydown', handleKeydown);
		return () => document.removeEventListener('keydown', handleKeydown);
	});
</script>

<Button
	variant="outline"
	class="relative h-9 w-9 p-0 xl:h-9 xl:w-48 xl:justify-start xl:px-3 xl:py-2"
	onclick={() => (open = true)}
>
	<Search class="h-4 w-4 xl:mr-2" />
	<span class="hidden xl:inline-flex text-sm text-muted-foreground">Search...</span>
</Button>

<Command.Dialog bind:open shouldFilter={false}>
	<Command.Input
		placeholder="Search documentation..."
		bind:value={searchQuery}
	/>
	<Command.List>
		{#if loading}
			<Command.Empty>Loading...</Command.Empty>
		{:else if filteredResults.length === 0}
			<Command.Empty>
				{searchQuery.trim() ? 'No results found.' : 'Start typing to search...'}
			</Command.Empty>
		{:else}
			<Command.Group heading="Results">
				{#each filteredResults as result, i (result.href)}
					{@const Icon = getCategoryIcon(result.category)}
					<Command.Item
						value={`${result.title}-${i}`}
						onSelect={() => handleSelect(result)}
						class="flex items-center gap-2 p-2 cursor-pointer"
					>
						<Icon class="h-4 w-4 shrink-0" />
						<div class="flex-1 overflow-hidden">
							<div class="flex items-center gap-2">
								<span class="font-medium truncate">{result.title}</span>
								<Badge variant="secondary" class={`text-xs shrink-0 ${getCategoryColor(result.category)}`}>
									{result.category}
								</Badge>
							</div>
							<p class="text-sm text-muted-foreground truncate">
								{result.contextualPreview || result.preview}
							</p>
						</div>
					</Command.Item>
				{/each}
			</Command.Group>
		{/if}
	</Command.List>
</Command.Dialog> 