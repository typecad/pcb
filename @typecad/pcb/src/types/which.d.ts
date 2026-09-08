declare module 'which' {
  interface WhichFunction {
    (command: string, options?: { nothrow?: boolean }): string | null;
    sync(command: string, options?: { nothrow?: boolean }): string | null;
  }
  declare const which: WhichFunction;
  export default which;
}
