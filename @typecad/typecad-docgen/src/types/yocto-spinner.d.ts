declare module 'yocto-spinner' {
  interface SpinnerOptions {
    text?: string;
    color?: string;
    spinner?: string;
  }

  interface Spinner {
    start(): Spinner;
    stop(): Spinner;
    success(text?: string): Spinner;
    error(text?: string): Spinner;
    warn(text?: string): Spinner;
    info(text?: string): Spinner;
  }

  function yoctoSpinner(options?: SpinnerOptions): Spinner;
  export = yoctoSpinner;
} 