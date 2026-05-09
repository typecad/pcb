import type { Post } from '$lib/types/articles.js'


export async function load({ fetch, params }) {
	console.log(params);
    const { tag } = params;
    const response = await fetch('/api/posts')
	const posts: Post[] = await response.json();

    console.log(posts[0].categories)
    const tagged_posts = posts.filter((post) => post.categories.includes(tag));
	console.log(tagged_posts);

	return {
		tag,
		tagged_posts
	};
};