declare module 'markdown-it-multimd-table-ext' {
  import MarkdownIt from 'markdown-it';
  interface Options {
    multiline: boolean;
    rowspan: boolean;
    headerless: boolean;
    multibody: boolean;
    autolabel: boolean;
  }
  const multimd_table_plugin: {
    (md: MarkdownIt, options?: Options): void;
  };
  export default multimd_table_plugin;
}
