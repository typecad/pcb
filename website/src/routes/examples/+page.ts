import type { PageLoad } from './$types.js';
import type { ExamplesManifest } from '$lib/types/examples.js';

export const load: PageLoad = async ({ fetch }) => {
  // The manifest is generated at build time by scripts/generate-examples.js
  // and served as a static asset. On the index page we only need the summary
  // fields, so strip the (large) tree before returning.
  const res = await fetch('/examples-manifest.json');
  const manifest: ExamplesManifest = res.ok ? await res.json() : { examples: [] };

  return {
    examples: manifest.examples.map((ex) => ({
      slug: ex.slug,
      title: ex.title,
      description: ex.description,
      tags: ex.tags,
      board: ex.board,
    })),
  };
};
