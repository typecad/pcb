import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import llms from 'vite-plugin-llms'

export default defineConfig({
	plugins: [
		sveltekit(),
		llms({
			llmsDir: 'llms' // optional, defaults to 'llms'
		})],
	build: {
		target: 'esnext' //browsers can handle the latest ES features
	}
});
