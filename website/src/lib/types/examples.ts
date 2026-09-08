// Shape of the manifest emitted by scripts/generate-examples.js and served at
// /examples-manifest.json. Generated content (Shiki HTML) lives inline so the
// viewer needs no client-side highlighter.

export type ExampleFileNode = {
  name: string;
  path: string;
  type: 'file';
  lang: string;
  html: string;
};

export type ExampleFolderNode = {
  name: string;
  path: string;
  type: 'folder';
  children: ExampleNode[];
};

export type ExampleNode = ExampleFileNode | ExampleFolderNode;

export type Example = {
  slug: string;
  title: string;
  description: string;
  tags: string[];
  board: string;
  /** Always a folder node representing the example's root directory. */
  tree: ExampleFolderNode;
};

export type ExamplesManifest = {
  examples: Example[];
};
