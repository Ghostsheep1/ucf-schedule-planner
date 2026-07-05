import adapterNode from '@sveltejs/adapter-node';
import adapterVercel from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: process.env.VERCEL === '1' ? adapterVercel() : adapterNode(),
		version: {
			pollInterval: 5 * 60 * 1000
		}
	},
	preprocess: vitePreprocess()
};
export default config;
