import chalk from 'chalk';

/**
 * Helpers for error/hint text that tells the user to type something in a
 * terminal. The command goes on its own indented, colored line — no prompt
 * character, no surrounding quotes or backticks — so it can be selected and
 * pasted as-is. chalk drops the color automatically when output is piped,
 * not a TTY, or NO_COLOR is set, leaving the same indented plain text.
 */

/**
 * Always the npx form of our own CLI: typeCAD is a project dependency, not a
 * global install, so a bare `typecad-pcb` is not on most users' PATH.
 */
export function npxForm(command: string): string {
  return /^typecad-pcb(\s|$)/.test(command) ? `npx ${command}` : command;
}

/** One command, indented and colored, on its own line. */
export function commandLine(command: string): string {
  return `    ${chalk.bold.cyan(npxForm(command))}`;
}

/**
 * `message`, a blank line, then each command on its own line.
 * End `message` with a colon: "Add it to the project with:".
 */
export function withCommands(message: string, ...commands: string[]): string {
  return `${message}\n\n${commands.map(commandLine).join('\n')}`;
}

/** The "no .kicad_pcb in build/" error shared by the commands that read a built board. */
export function missingBoardMessage(
  buildDir: string,
  subcommand: string,
  placeholder = '<path/to/board.kicad_pcb>',
): string {
  return (
    `No .kicad_pcb file found in ${buildDir}.\n\n` +
    `Build the board first:\n\n${commandLine('typecad-pcb build')}\n\n` +
    `Or point at a board file directly:\n\n${commandLine(`typecad-pcb ${subcommand} ${placeholder}`)}`
  );
}

/** The "no entry file" error shared by build, check and validate. */
export function noEntryMessage(command = 'build'): string {
  return (
    withCommands(
      'No entry file specified and none could be auto-detected.\nProvide a file path:',
      `typecad-pcb ${command} <entry.ts>`,
    ) + '\n\nOr configure one in typecad.conf.ts: { entry: "./src/main.ts" }'
  );
}
