import { mdsvex } from 'mdsvex';
// import adapter from '@sveltejs/adapter-auto';
import adapter from '@sveltejs/adapter-vercel';
import preprocess from 'svelte-preprocess';
import mdsvexConfig from './mdsvex.config.js';

/** @type {import('@sveltejs/kit').Config} */
const config = {
    extensions: ['.svelte', ...mdsvexConfig.extensions],
    preprocess: [
        preprocess({
            postcss: true,
            typescript: false
        }),
        mdsvex(mdsvexConfig)
    ],
    kit: {
        adapter: adapter(),
        serviceWorker: {
            register: false,
          }
    }
};

export default config;
