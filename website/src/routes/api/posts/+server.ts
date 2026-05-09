import { json } from '@sveltejs/kit'
import type { Post } from '$lib/types/articles'

async function getPosts() {
	let posts: Post[] = []

	// Use Vite's import.meta.glob to get all news markdown files
	const newsFiles = import.meta.glob('../../news/*.md', { query: '?raw', eager: true })

	for (const [path, module] of Object.entries(newsFiles)) {
		const content = (module as any).default as string

		// Extract frontmatter
		const frontmatterMatch = content.match(/^---\r?\n(.*?)\r?\n---/s)
		if (frontmatterMatch) {
			const frontmatter = frontmatterMatch[1]
			const metadata: any = {}

			// Parse frontmatter - handle YAML properly
			const lines = frontmatter.split('\n')
			let i = 0
			while (i < lines.length) {
				const line = lines[i]
				const [key, ...valueParts] = line.split(':')

				if (key && valueParts.length > 0) {
					const value = valueParts.join(':').trim()
					const trimmedKey = key.trim()

					if (trimmedKey === 'categories') {
						// Check if next lines start with '-'
						const categories: string[] = []
						i++

						// Look for list items
						while (i < lines.length && lines[i].trim().startsWith('-')) {
							const item = lines[i].replace(/^\s*-\s+/, '').trim().replace(/^['"]|['"]$/g, '')
							if (item) categories.push(item)
							i++
						}

						// If we didn't find list items, try inline format
						if (categories.length === 0 && value) {
							const cleanValue = value.replace(/[\[\]]/g, '')
							if (cleanValue) {
								categories.push(...cleanValue.split(',').map((v: string) => v.trim().replace(/['"]/g, '')).filter(v => v))
							}
						}

						metadata[trimmedKey] = categories
						continue // Skip the i++ at the end since we already advanced
					} else if (value === 'true') {
						metadata[trimmedKey] = true
					} else if (value === 'false') {
						metadata[trimmedKey] = false
					} else if (/^['"]/.test(value)) {
						metadata[trimmedKey] = value.replace(/^['"]|['"]$/g, '')
					} else {
						metadata[trimmedKey] = value
					}
				}
				i++
			}

			// Extract slug from path
			const slugMatch = path.match(/\/news\/(.+)\.md$/)
			const slug = slugMatch ? slugMatch[1] : ''
			const post = { ...metadata, slug: `/news/${slug}` } as Post

			if (post.published) {
				posts.push(post)
			}
		}
	}

	posts = posts.sort((first, second) =>
		new Date(second.date).getTime() - new Date(first.date).getTime()
	)

	return posts
}

export async function GET() {
	const posts = await getPosts()
	return json(posts)
}