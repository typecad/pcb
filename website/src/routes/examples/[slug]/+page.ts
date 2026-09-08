import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types.js';
import type { ExamplesManifest } from '$lib/types/examples.js';

export const load: PageLoad = async ({ params, fetch }) => {
  const res = await fetch('/examples-manifest.json');
  const manifest: ExamplesManifest = res.ok ? await res.json() : { examples: [] };

  const example = manifest.examples.find((ex) => ex.slug === params.slug);
  if (!example) {
    error(404, `Example "${params.slug}" not found`);
  }

  return { example };
};
