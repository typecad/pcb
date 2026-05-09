declare module 'inquirer-file-selector' {
  interface FileSelectorOptions {
    message: string;
    filter?: (file: { name: string; path: string }) => boolean;
  }

  function fileSelector(options: FileSelectorOptions): Promise<string>;
  export default fileSelector;
} 