declare module 'markdown-it-attrs' {
    import MarkdownIt from 'markdown-it';
    
    interface MarkdownItAttrsOptions {
        leftDelimiter?: string;
        rightDelimiter?: string;
        allowedAttributes?: string[];
    }

    const markdownItAttrs: MarkdownIt.PluginWithOptions<MarkdownItAttrsOptions>;
    export default markdownItAttrs;
} 
