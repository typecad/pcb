/**
 * Injectable logger for library output (component "created"/"added" messages).
 * Replace it with setLogger({...}) to capture or silence the chatter; pass
 * null for a fully silent library.
 *
 * The TYPECAD_WIRING_QUIET environment variable is also honored so tooling
 * (like the CLI) can silence the library even when the entry file loads its
 * own copy of these modules.
 */
export interface WiringLogger {
  info(message: string): void;
}

const consoleLogger: WiringLogger = {
  info(message: string): void {
    process.stdout.write(message + '\n');
  }
};

const silentLogger: WiringLogger = {
  info(): void {
    // silenced
  }
};

/** Logger set through setLogger (undefined = not overridden) */
let overrideLogger: WiringLogger | undefined;

/**
 * Replaces the library logger. Pass a custom WiringLogger implementation or
 * null to silence all library output. The default logger writes to stdout.
 */
export function setLogger(logger: WiringLogger | null): void {
  overrideLogger = logger ?? silentLogger;
}

/** Returns the active logger (mainly useful to restore a previous one) */
export function getLogger(): WiringLogger {
  if (overrideLogger) {
    return overrideLogger;
  }
  return process.env.TYPECAD_WIRING_QUIET === '1' ? silentLogger : consoleLogger;
}

/** Logs an informational message through the active logger */
export function logInfo(message: string): void {
  getLogger().info(message);
}
