import type { Post } from '$lib/types/articles.js'

export async function load({ fetch, params }) {
	const response = await fetch('/api/posts')
	const allPosts: Post[] = await response.json()

	// Filter posts that contain the specified tag
	const taggedPosts = allPosts.filter(post =>
		post.categories && post.categories.includes(params.tag)
	)

	return {
		tag: params.tag,
		tagged_posts: taggedPosts
	}
}