declare module 'markdown-it-multimd-table-ext' {
    import MarkdownIt from 'markdown-it';
    interface Options {
        multiline: boolean;
        rowspan: boolean;
        headerless: boolean;
        multibody: boolean;
        autolabel: boolean;
    }
    const multimd_table_plugin: MarkdownIt.PluginWithOptions<Options>;
    export default multimd_table_plugin;
} 