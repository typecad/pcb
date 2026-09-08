// Generates static/examples-manifest.json from the real project files under
// src/content/examples/<slug>/. Each file is read off disk, syntax-highlighted
// with Shiki (VS Code's `dark-plus` theme), and embedded as HTML in a manifest
// the WorkspaceViewer consumes at runtime.
//
// This mirrors the existing scripts/convert-md.js convention: ESM, recursive
// fs walk, top-level await. Run via `npm run generate-examples` (also chained
// into `npm run build`).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createHighlighter } from 'shiki';
import { transformerColorizedBrackets } from '@shikijs/colorized-brackets';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const examplesDir = path.join(projectRoot, 'src', 'content', 'examples');
const manifestPath = path.join(projectRoot, 'static', 'examples-manifest.json');

// Files/dirs that are never part of the displayed project.
const SKIP_NAMES = new Set([
	'node_modules',
	'dist',
	'.git',
	'.DS_Store',
	'.svelte-kit',
	'tsconfig.tsbuildinfo'
]);

// Skip the generated output directory unless the example opts in via meta.
const GENERATED_DIR = 'out';

// Map a file extension to a Shiki language id. Keep this in sync with the
// `langs` array below — every value here must be loaded into the highlighter.
const LANG_BY_EXT = {
	'.ts': 'typescript',
	'.mts': 'typescript',
	'.cts': 'typescript',
	'.tsx': 'tsx',
	'.js': 'javascript',
	'.mjs': 'javascript',
	'.cjs': 'javascript',
	'.jsx': 'jsx',
	'.json': 'json',
	'.cpp': 'cpp',
	'.cc': 'cpp',
	'.cxx': 'cpp',
	'.hpp': 'cpp',
	'.hh': 'cpp',
	'.h': 'cpp',
	'.ino': 'cpp',
	'.c': 'c',
	'.css': 'css',
	'.html': 'html',
	'.htm': 'html',
	'.md': 'markdown',
	'.markdown': 'markdown',
	'.yaml': 'yaml',
	'.yml': 'yaml',
	'.sh': 'bash',
	'.bash': 'bash',
	'.zsh': 'bash',
	'.toml': 'toml',
	'.ini': 'ini',
	'.xml': 'xml'
};

const highlighter = await createHighlighter({
	themes: ['dark-plus'],
	langs: [
		'shellsession',
		'typescript',
		'javascript',
		'tsx',
		'jsx',
		'json',
		'jsonc',
		'cpp',
		'c',
		'css',
		'html',
		'markdown',
		'yaml',
		'bash',
		'toml',
		'ini',
		'xml',
		'diff'
	]
});

// Directory entries are intentionally string-only so the JSON stays serializable
// once the Shiki HTML is filled in.

function languageFor(filename) {
	const ext = path.extname(filename).toLowerCase();
	return LANG_BY_EXT[ext] ?? 'text';
}

function titleFromSlug(slug) {
	return slug
		.split('-')
		.map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
		.join(' ');
}

// Recursively build a tree node for one entry on disk.
function buildNode(fullPath, relPath, name, includeGenerated) {
	const stat = fs.statSync(fullPath);

	if (stat.isDirectory()) {
		if (SKIP_NAMES.has(name)) return null;
		if (name === GENERATED_DIR && !includeGenerated) return null;

		const children = [];
		for (const child of fs.readdirSync(fullPath, { withFileTypes: true })) {
			const childPath = path.join(fullPath, child.name);
			const childRel = relPath ? `${relPath}/${child.name}` : child.name;
			const node = buildNode(childPath, childRel, child.name, includeGenerated);
			if (node) children.push(node);
		}
		if (children.length === 0) return null;

		// Folders first, then files, each alphabetical — matches VS Code's default.
		children.sort((a, b) => {
			if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
			return a.name.localeCompare(b.name);
		});

		return { name, path: relPath, type: 'folder', children };
	}

	// Skip the meta file itself — it isn't part of the displayed project.
	if (name === 'example.meta.json') return null;
	if (SKIP_NAMES.has(name)) return null;

	const lang = languageFor(name);
	const code = fs.readFileSync(fullPath, 'utf-8');
	const html = highlighter.codeToHtml(code, {
		lang,
		// Dual-theme render with BOTH slots set to dark-plus. This makes Shiki
		// emit --shiki-* and --shiki-dark-* CSS variables (instead of bare inline
		// colors), which the global app.css dark-mode rule
		// `html.dark .shiki span { color: var(--shiki-dark) }` relies on. Without
		// these vars, that rule blanks every span's color in dark mode. Using the
		// same theme for both slots keeps the code pane always dark-plus regardless
		// of the site theme toggle — the embedded-IDE look is intentional.
		themes: {
			light: 'dark-plus',
			dark: 'dark-plus'
		},
		transformers: [
			// Brackets match the rest of the site; the viewer supplies its own
			// scroll chrome and copy button, so those transformers are not used.
			transformerColorizedBrackets({
				// Keys match the dual-theme slot names above.
				themes: {
					light: ['#6A9955', '#569CD6', '#DCDCAA', '#CE9178'],
					dark: ['#6A9955', '#569CD6', '#DCDCAA', '#CE9178']
				}
			})
		]
	});

	return { name, path: relPath, type: 'file', lang, html };
}

function readMeta(exampleDir, slug) {
	const metaPath = path.join(exampleDir, 'example.meta.json');
	if (!fs.existsSync(metaPath)) {
		return { title: titleFromSlug(slug), description: '', tags: [], board: '' };
	}
	try {
		const raw = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
		return {
			title: raw.title ?? titleFromSlug(slug),
			description: raw.description ?? '',
			tags: Array.isArray(raw.tags) ? raw.tags : [],
			board: raw.board ?? '',
			includeGenerated: Boolean(raw.includeGenerated),
			// "hidden": true keeps the project folder in the repo but leaves it
			// out of the manifest (and therefore off the site).
			hidden: Boolean(raw.hidden)
		};
	} catch (error) {
		console.warn(`  ! example.meta.json for "${slug}" is invalid, using defaults:`, error.message);
		return { title: titleFromSlug(slug), description: '', tags: [], board: '' };
	}
}

function buildExample(slug, exampleDir) {
	const meta = readMeta(exampleDir, slug);
	if (meta.hidden) {
		console.log(`  • "${slug}" is hidden in example.meta.json, skipping.`);
		return null;
	}
	const tree = buildNode(exampleDir, '', slug, meta.includeGenerated);
	if (!tree) {
		console.warn(`  ! "${slug}" has no displayable files, skipping.`);
		return null;
	}
	return {
		slug,
		title: meta.title,
		description: meta.description,
		tags: meta.tags,
		board: meta.board,
		tree
	};
}

function main() {
	if (!fs.existsSync(examplesDir)) {
		console.warn(`! No examples directory at ${examplesDir}`);
		fs.writeFileSync(manifestPath, JSON.stringify({ examples: [] }, null, 2), 'utf-8');
		return;
	}

	const slugs = fs
		.readdirSync(examplesDir, { withFileTypes: true })
		.filter((d) => d.isDirectory())
		.map((d) => d.name)
		.sort();

	const examples = [];
	for (const slug of slugs) {
		console.log(`• building example "${slug}"`);
		const ex = buildExample(slug, path.join(examplesDir, slug));
		if (ex) examples.push(ex);
	}

	// stable, compact-for-network JSON
	fs.writeFileSync(manifestPath, JSON.stringify({ examples }, null, 2), 'utf-8');
	console.log(`\n✓ wrote ${examples.length} example(s) → ${path.relative(projectRoot, manifestPath)}`);
	if (examples.length) {
		console.log('  slugs:', examples.map((e) => e.slug).join(', '));
	}
}

main();
