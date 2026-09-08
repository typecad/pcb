import fs from 'node:fs';
import { exec } from 'node:child_process';
import readline from 'node:readline';
import chalk from 'chalk';

export interface IKiCadWindowStatus {
  found: boolean;
  hasUnsavedChanges: boolean;
  windowTitle?: string;
  appName?: string;
}

/**
 * Scans open windows to find KiCad PCB Editor with the specified board name.
 * @param boardName - The name of the board to look for (without .kicad_pcb extension)
 * @returns Status object indicating if the window was found and if it has unsaved changes
 * @private
 */
export async function scanForKiCadWindow(boardName: string): Promise<IKiCadWindowStatus> {
  try {
    // Use PowerShell directly to get window titles instead of the problematic find-window.js
    const windowTitles = await new Promise<string[]>((resolve, reject) => {
      const powershellCommand = `Get-Process | Where-Object {$_.MainWindowTitle -ne '' -and $_.MainWindowTitle -like '*PCB Editor*'} | Select-Object -ExpandProperty MainWindowTitle`;

      exec(`powershell -Command "${powershellCommand}"`, (error, stdout, stderr) => {
        if (error) {
          // Fall back to trying all windows
          const fallbackCommand = `Get-Process | Where-Object {$_.MainWindowTitle -ne ''} | Select-Object -ExpandProperty MainWindowTitle`;
          exec(`powershell -Command "${fallbackCommand}"`, (fallbackError, fallbackStdout, fallbackStderr) => {
            if (fallbackError) {
              reject(new Error(`Window detection failed: ${fallbackError.message}`));
              return;
            }

            const allTitles = fallbackStdout
              .split('\n')
              .map((line) => line.trim())
              .filter((line) => line.length > 0);

            // Filter for PCB Editor windows
            const kicadTitles = allTitles.filter((title) => title.toLowerCase().includes('pcb editor'));

            resolve(kicadTitles);
          });
          return;
        }

        const titles = stdout
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0);

        resolve(titles);
      });
    });

    // The window titles are already filtered for PCB Editor windows
    const kicadTitles = windowTitles;

    // Check each KiCad window title for our specific board
    for (const title of kicadTitles) {
      // Check if this window contains our board name
      // Title format examples:
      // "board — PCB Editor" (no unsaved changes)
      // "*board — PCB Editor" (has unsaved changes)
      const hasUnsavedChanges = title.startsWith('*');
      const cleanTitle = hasUnsavedChanges ? title.substring(1) : title;

      // Extract the board name from the title
      let titleParts = cleanTitle.split(' — PCB Editor');
      if (titleParts.length === 1) {
        // Try with regular hyphen if em dash didn't work
        titleParts = cleanTitle.split(' - PCB Editor');
      }

      if (titleParts.length > 0) {
        const titleBoardName = titleParts[0].trim();

        // Check if this matches our board name
        if (titleBoardName === boardName) {
          return {
            found: true,
            hasUnsavedChanges: hasUnsavedChanges,
            windowTitle: title,
          };
        }
      }
    }

    return { found: false, hasUnsavedChanges: false };
  } catch (error) {
    return { found: false, hasUnsavedChanges: false };
  }
}

/**
 * Prompts the user to save changes in KiCad and wait before continuing.
 * @param boardName - The name of the board
 * @param windowTitle - The title of the KiCad window
 * @returns Promise that resolves when user chooses to continue
 * @private
 */
export async function promptUserToSave(boardName: string, windowTitle: string): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // Enable raw mode to capture escape key
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }

  return new Promise((resolve, reject) => {
    // Handle escape key to cancel
    const onData = (key: Buffer) => {
      if (key[0] === 27) {
        // Escape key
        rl.close();
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        reject(new Error(`${boardName}.kicad_pcb write cancelled`));
      }
    };

    process.stdin.on('data', onData);

    rl.question(
      chalk.bold.bgYellowBright(
        chalk.bgYellow(`🐉 Warning:`) +
          chalk.bold.bgBlack(
            ` ${boardName} has unsaved changes in KiCad. Press Enter to continue or Escape to cancel...`,
          ),
      ),
      (answer) => {
        process.stdin.removeListener('data', onData);
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        rl.close();
        resolve();
      },
    );
  });
}
