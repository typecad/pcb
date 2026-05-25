const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const INTERVAL = 80;

export interface Spinner {
    start(): Spinner;
    success(text?: string): void;
}

export default function createSpinner(options?: { text?: string }): Spinner {
    const text = options?.text ?? '';
    let frameIndex = 0;
    let timer: ReturnType<typeof setInterval> | undefined;
    let isTty = process.stderr.isTTY && process.env.TERM !== 'dumb' && !('CI' in process.env);

    function render() {
        if (!isTty) return;
        const frame = FRAMES[frameIndex++ % FRAMES.length];
        process.stderr.write(`\r\u001B[36m${frame}\u001B[39m ${text}`);
    }

    return {
        start() {
            if (timer) return this;
            render();
            timer = setInterval(render, INTERVAL);
            if (isTty) process.stderr.write('\u001B[?25l');
            return this;
        },
        success(finalText?: string) {
            if (timer) {
                clearInterval(timer);
                timer = undefined;
            }
            if (isTty) {
                process.stderr.write('\r\u001B[?25l');
                process.stderr.cursorTo(0);
                process.stderr.clearLine(1);
                process.stderr.write(`\u001B[32m✔\u001B[39m ${finalText ?? text}\n`);
                process.stderr.write('\u001B[?25h');
            } else {
                process.stderr.write(`✔ ${finalText ?? text}\n`);
            }
        },
    };
}
