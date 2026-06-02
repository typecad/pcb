import { json } from '@sveltejs/kit';

export interface SearchResult {
	title: string;
	href: string;
	content: string;
	preview: string;
	category: 'docs' | 'examples' | 'news' | 'packages' | 'getting-started';
}

const docsModules = import.meta.glob<{ default: string }>('../../docs/**/*.md', { eager: true, query: '?raw', import: 'default' });
const examplesModules = import.meta.glob<{ default: string }>('../../examples/**/*.md', { eager: true, query: '?raw', import: 'default' });
const newsModules = import.meta.glob<{ default: string }>('../../news/*.md', { eager: true, query: '?raw', import: 'default' });
const packagesModules = import.meta.glob<{ default: string }>('../../packages/**/*.md', { eager: true, query: '?raw', import: 'default' });
const gettingStartedModules = import.meta.glob<{ default: string }>('../../getting-started/**/*.md', { eager: true, query: '?raw', import: 'default' });

function processGlobModules(
	modules: Record<string, string>,
	category: SearchResult['category'],
	globPrefix: string
): SearchResult[] {
	const results: SearchResult[] = [];

	for (const [path, content] of Object.entries(modules)) {
		const relativePath = path.replace(globPrefix, '').replace('.md', '').replace('/+page', '');
		const slug = `/${relativePath}`;
		const title = extractTitle(content) || getPageTitle(slug);
		const textContent = extractTextContent(content);

		results.push({
			title,
			href: slug,
			content: textContent,
			preview: textContent.slice(0, 200),
			category
		});
	}

	return results;
}

function processNewsModules(modules: Record<string, string>): SearchResult[] {
	const results: SearchResult[] = [];

	for (const [path, content] of Object.entries(modules)) {
		const filename = path.split('/').pop()!;
		const frontmatterMatch = content.match(/^---\r?\n(.*?)\r?\n---/s);
		let title = getPageTitle(`/news/${filename.replace('.md', '')}`);
		let description = '';
		let published = true;

		if (frontmatterMatch) {
			const frontmatter = frontmatterMatch[1];
			const titleMatch = frontmatter.match(/title:\s*(.+)/);
			const descMatch = frontmatter.match(/description:\s*(.+)/);
			const pubMatch = frontmatter.match(/published:\s*(.+)/);

			if (titleMatch) title = titleMatch[1].trim().replace(/^['"]|['"]$/g, '');
			if (descMatch) description = descMatch[1].trim().replace(/^['"]|['"]$/g, '');
			if (pubMatch) published = pubMatch[1].trim() === 'true';
		}

		if (published) {
			const textContent = extractTextContent(content);
			results.push({
				title,
				href: `/news/${filename.replace('.md', '')}`,
				content: description || textContent,
				preview: description || textContent.slice(0, 200),
				category: 'news'
			});
		}
	}

	return results;
}

function getSearchableContent(): SearchResult[] {
	const results: SearchResult[] = [];

	results.push(...processGlobModules(docsModules, 'docs', '../../docs/'));
	results.push(...processGlobModules(examplesModules, 'examples', '../../examples/'));
	results.push(...processNewsModules(newsModules));
	results.push(...processGlobModules(packagesModules, 'packages', '../../packages/'));
	results.push(...processGlobModules(gettingStartedModules, 'getting-started', '../../getting-started/'));

	return results;
}

function extractTextContent(content: string): string {
	// Remove script tags and everything before the first heading
	let cleanContent = content.replace(/<script[\s\S]*?<\/script>/gi, '');

	// Find the main content - everything after the first # heading
	const mainContentMatch = cleanContent.match(/^#\s.*$/m);
	if (mainContentMatch) {
		const headingIndex = cleanContent.indexOf(mainContentMatch[0]);
		cleanContent = cleanContent.substring(headingIndex);
	}

	// Remove only the very end navigation/footer sections
	// Security: Use more specific, safer patterns to prevent ReDoS
	cleanContent = cleanContent.replace(/<div class="relative">[\s\S]{0,1000}?<\/div>\s*$/gi, '');
	cleanContent = cleanContent.replace(/<SvelteSeo[\s\S]{0,2000}$/gi, '');

	// Extract and clean the text content
	let textContent = cleanContent
		.replace(/<ScrollArea[^>]*>[\s\S]*?<\/ScrollArea>/gi, (match) => {
			// Security: Limit match length to prevent ReDoS
			if (match.length > 10000) return '';
			// Extract content from ScrollArea but keep the text inside
			return match.replace(/<[^>]*>/g, '').replace(/```[\s\S]*?```/g, '');
		})
		.replace(/<[^>]*>/g, '') // Remove remaining HTML tags
		.replace(/```[\s\S]*?```/g, '') // Remove code blocks
		.replace(/`([^`]*)`/g, '$1') // Remove inline code backticks but keep content
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // Convert links to text
		.replace(/#{1,6}\s*/g, '') // Remove markdown headers
		.replace(/[*_]{1,2}([^*_]*)[*_]{1,2}/g, '$1') // Remove markdown emphasis
		.replace(/>\s*\[![^\]]*\][^]*?$/gm, '') // Remove callout blocks
		// Clean up markdown tables while preserving content
		.replace(/^\s*\|?\s*:?-+:?\s*\|?\s*$/gm, '') // Remove table separator rows
		.replace(/^\s*[-:]+\s*\|\s*[-:]+.*$/gm, '') // Remove table alignment rows
		.replace(/^\s*\|\s*:?-+:?\s*\|\s*:?-+:?\s*.*$/gm, '') // Remove complex table separators
		.replace(/\|/g, ' ') // Replace pipe characters with spaces to separate table cells
		// Clean up table artifacts
		.replace(/:\s*-+\s*:/g, ' ') // Remove :---: patterns
		.replace(/-{3,}/g, ' ') // Replace long sequences of dashes with space
		.replace(/:{2,}/g, ' ') // Replace multiple colons with space
		.replace(/^\s*[-*+]\s+/gm, '') // Remove list markers
		.replace(/^\s*\d+\.\s+/gm, '') // Remove numbered list markers
		.replace(/\n+/g, ' ') // Replace newlines with spaces
		.replace(/\s+/g, ' ') // Normalize whitespace
		.trim();

	// More targeted removal of navigation terms - only remove standalone instances
	const navigationTerms = [
		'Getting Started', 'Docs', 'Packages', 'Examples', 'News',
		'Requirements', 'Concepts', 'Tooling', 'Project Structure', 'Classes',
		'Passives', 'Components', 'Pins', 'Connections', 'Board Layout',
		'Overview', 'Structure', 'Code', 'Use'
	];

	// Check if this term is the main topic (appears early and prominently)
	const firstSentence = textContent.substring(0, 200).toLowerCase();

	navigationTerms.forEach(term => {
		const termLower = term.toLowerCase();
		// Only remove if it's not the main topic AND appears as a standalone navigation item
		if (!firstSentence.includes(termLower)) {
			// More specific pattern to avoid removing terms that are part of actual content
			const standalonePattern = new RegExp(`\\b${term}\\b(?=\\s*(\\||$|\\s))`, 'gi');
			textContent = textContent.replace(standalonePattern, '');
		}
	});

	return textContent.replace(/\s+/g, ' ').trim();
}

function extractTitle(content: string): string | null {
	// Look for markdown titles (# Title) - handle various formatting
	const titleMatch = content.match(/^#\s*(.+)$/m);
	if (titleMatch) {
		return titleMatch[1]
			.replace(/\*\*(.+?)\*\*/g, '$1') // Remove bold markdown
			.replace(/`(.+?)`/g, '$1') // Remove code markdown
			.replace(/<[^>]*>/g, '') // Remove HTML tags
			.replace(/[\u{1F600}-\u{1F6FF}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/gu, '') // Remove emojis
			.trim();
	}
	return null;
}

function getPageTitle(slug: string): string {
	// Generate title from slug
	const parts = slug.split('/').filter(Boolean);
	const lastPart = parts[parts.length - 1];

	return lastPart
		.split('-')
		.map(word => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}

export async function GET({ request }) {
	try {
		const content = getSearchableContent();
		const userAgent = request.headers.get('user-agent') || '';
		const isCrawler = userAgent.includes('bot') || userAgent.includes('crawler');

		return json(content, {
			headers: {
				'Cache-Control': isCrawler ? 'public, max-age=3600' : 'no-cache, no-store, must-revalidate',
				...(isCrawler ? {} : { 'Pragma': 'no-cache', 'Expires': '0' })
			}
		});
	} catch (error) {
		console.error('Error generating search content:', error);
		return json([], { status: 500 });
	}
}