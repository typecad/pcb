declare module 'markdown-it-attrs' {
  interface MarkdownItAttrsOptions {
    leftDelimiter?: string;
    rightDelimiter?: string;
    allowedAttributes?: string[];
  }

  const markdownItAttrs: import('markdown-it').PluginWithOptions<MarkdownItAttrsOptions>;
  export default markdownItAttrs;
}
