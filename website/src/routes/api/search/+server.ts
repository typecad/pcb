import { json } from '@sveltejs/kit';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

export interface SearchResult {
	title: string;
	href: string;
	content: string;
	preview: string; // Short preview for display
	category: 'docs' | 'examples' | 'news' | 'packages' | 'getting-started';
}

function readMarkdownFiles(dirPath: string, category: SearchResult['category'], basePath: string = ''): SearchResult[] {
	const results: SearchResult[] = [];

	// Check if directory exists first
	if (!existsSync(dirPath)) {
		return results;
	}

	try {
		const files = readdirSync(dirPath, { withFileTypes: true });

		for (const file of files) {
			const fullPath = join(dirPath, file.name);

			if (file.isDirectory()) {
				// Recursively read subdirectories
				results.push(...readMarkdownFiles(fullPath, category, `${basePath}/${file.name}`));
			} else if (file.name.endsWith('.md')) {
				const content = readFileSync(fullPath, 'utf-8');
				const slug = `${basePath}/${file.name.replace('.md', '')}`.replace('/+page', '');

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
		}
	} catch (error) {
		console.error(`Error reading directory ${dirPath}:`, error);
	}

	return results;
}

async function getSearchableContent(): Promise<SearchResult[]> {
	const results: SearchResult[] = [];

	// Get the current directory path
	const currentDir = fileURLToPath(new URL('.', import.meta.url));
	const apiDir = dirname(currentDir);
	const routesDir = dirname(apiDir);

	// Get docs content
	results.push(...readMarkdownFiles(join(routesDir, 'docs'), 'docs', '/docs'));

	// Get examples content
	results.push(...readMarkdownFiles(join(routesDir, 'examples'), 'examples', '/examples'));

	// Get news content (different structure - has frontmatter)
	try {
		const newsDir = join(routesDir, 'news');
		if (!existsSync(newsDir)) {
			// News directory not found - skipping news content
		} else {
			const allFiles = readdirSync(newsDir);
			const files = allFiles.filter(file => file.endsWith('.md'));

			for (const file of files) {
				const filePath = join(newsDir, file);
				const content = readFileSync(filePath, 'utf-8');

				// Extract frontmatter
				const frontmatterMatch = content.match(/^---\r?\n(.*?)\r?\n---/s);
				let title = getPageTitle(`/news/${file.replace('.md', '')}`);
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
						href: `/news/${file.replace('.md', '')}`,
						content: description || textContent,
						preview: description || textContent.slice(0, 200),
						category: 'news'
					});
				}
			}
		}
	} catch (error) {
		console.error('Error reading news files:', error);
	}

	// Get packages content
	results.push(...readMarkdownFiles(join(routesDir, 'packages'), 'packages', '/packages'));

	// Get getting-started content
	results.push(...readMarkdownFiles(join(routesDir, 'getting-started'), 'getting-started', '/getting-started'));

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
		// Security: Basic rate limiting check (could be enhanced with Redis/database)
		const userAgent = request.headers.get('user-agent') || '';
		if (userAgent.includes('bot') || userAgent.includes('crawler')) {
			// Allow legitimate crawlers but with cache headers
			const content = await getSearchableContent();
			return json(content, {
				headers: {
					'Cache-Control': 'public, max-age=3600', // Cache for crawlers
				}
			});
		}

		const content = await getSearchableContent();
		// Add cache control headers to prevent stale results for regular users
		return json(content, {
			headers: {
				'Cache-Control': 'no-cache, no-store, must-revalidate',
				'Pragma': 'no-cache',
				'Expires': '0'
			}
		});
	} catch (error) {
		console.error('Error generating search content:', error);
		return json([], { status: 500 });
	}
}