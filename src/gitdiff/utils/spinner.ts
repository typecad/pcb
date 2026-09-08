const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const INTERVAL = 80;

const SHOW_CURSOR = '\u001B[?25h';
const HIDE_CURSOR = '\u001B[?25l';

let activeSpinners = 0;

function restoreCursorOnExit() {
  process.stderr.write(SHOW_CURSOR);
}

export interface Spinner {
  start(): Spinner;
  success(text?: string): void;
  error(text?: string): void;
}

export default function createSpinner(options?: { text?: string; color?: string }): Spinner {
  const text = options?.text ?? '';
  let frameIndex = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  const isTty = process.stderr.isTTY && process.env.TERM !== 'dumb' && !('CI' in process.env);

  function render() {
    if (!isTty) return;
    const frame = FRAMES[frameIndex++ % FRAMES.length];
    process.stderr.write(`\r\u001B[36m${frame}\u001B[39m ${text}`);
  }

  function clearLine() {
    if (isTty) {
      process.stderr.cursorTo(0);
      process.stderr.clearLine(1);
    }
  }

  function stopTimer() {
    if (timer) {
      clearInterval(timer);
      timer = undefined;
    }
    activeSpinners--;
    if (activeSpinners <= 0) {
      activeSpinners = 0;
      process.stderr.write(SHOW_CURSOR);
    }
  }

  return {
    start() {
      if (timer) return this;
      render();
      timer = setInterval(render, INTERVAL);
      activeSpinners++;
      if (isTty && activeSpinners === 1) {
        process.stderr.write(HIDE_CURSOR);
        process.on('exit', restoreCursorOnExit);
      }
      return this;
    },
    success(finalText?: string) {
      stopTimer();
      clearLine();
      if (isTty) {
        process.stderr.write(`\u001B[32m✔\u001B[39m ${finalText ?? text}\n`);
      } else {
        process.stderr.write(`✔ ${finalText ?? text}\n`);
      }
    },
    error(finalText?: string) {
      stopTimer();
      clearLine();
      if (isTty) {
        process.stderr.write(`\u001B[31m✖\u001B[39m ${finalText ?? text}\n`);
      } else {
        process.stderr.write(`✖ ${finalText ?? text}\n`);
      }
    },
  };
}
