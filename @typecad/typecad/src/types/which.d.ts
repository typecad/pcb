declare module 'which' {
  function which(command: string, options?: { nothrow?: boolean }): string | null;
  namespace which {
    function sync(command: string, options?: { nothrow?: boolean }): string | null;
  }
  export = which;
}
