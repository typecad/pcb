declare module 'inquirer-file-selector' {
  interface Item {
    path: string;
    name: string;
    isDirectory: boolean;
  }

  interface FileSelectorOptions {
    message: string;
    filter?: (file: { isDirectory: boolean; name: string; path: string }) => boolean;
    showExcluded?: boolean;
  }

  export function fileSelector(options: FileSelectorOptions): Promise<Item>;
} 