/**
 * Helper function to get call site information for error reporting.
 * Skips internal library files to find the user's code location.
 *
 * @param skipFiles - Additional file names or paths to skip
 * @returns Call site information or undefined if not available
 */
import * as fs from 'fs';

const fileContentCache = new Map<string, string>();

function getCachedFileContent(filePath: string): string | undefined {
  let content = fileContentCache.get(filePath);
  if (content === undefined) {
    try {
      content = fs.readFileSync(filePath, 'utf8');
      fileContentCache.set(filePath, content);
      if (fileContentCache.size > 50) {
        const firstKey = fileContentCache.keys().next().value;
        if (firstKey !== undefined) fileContentCache.delete(firstKey);
      }
    } catch {
      return undefined;
    }
  }
  return content;
}

export function getCallSite(
  skipFiles: string[] = [],
): { file: string; line: number; column: number; function?: string } | undefined {
  const stack = new Error().stack;
  if (!stack) return undefined;

  const lines = stack.split('\n');

  const defaultSkips = [
    'node_modules',
    '\\dist\\',
    '/dist/',

    '/component.ts',
    '\\component.ts',
    '/component.js',
    '\\component.js',
    '/pcb.ts',
    '\\pcb.ts',
    '/pcb.js',
    '\\pcb.js',
    '/pcb_track_builder.ts',
    '\\pcb_track_builder.ts',
    '/pcb_routing_core.ts',
    '\\pcb_routing_core.ts',
    '/pcb_routing_helpers.ts',
    '\\pcb_routing_helpers.ts',
    '/stack_trace.ts',
    '\\stack_trace.ts',
  ];

  const allSkips = [...defaultSkips, ...skipFiles];

  for (let i = 2; i < lines.length; i++) {
    const line = lines[i];
    if (line) {
      const match = line.match(/at\s+(?:(.+?)\s+\()?(.+):(\d+):(\d+)\)?/);
      if (match) {
        const filePath = match[2];

        const normalizedPath = filePath.replace(/\\/g, '/');
        const shouldSkip = allSkips.some((skip) => normalizedPath.includes(skip.replace(/\\/g, '/')));

        if (!shouldSkip) {
          const lineNum = parseInt(match[3], 10);
          const funcName = match[1]?.trim();
          let isSuperCall = false;

          try {
            const fileContent = getCachedFileContent(filePath);
            if (fileContent) {
              const fileLines = fileContent.split('\n');
              const lineText = fileLines[lineNum - 1];
              if (lineText && lineText.includes('super(')) {
                isSuperCall = true;
              }
            }
          } catch {
            /* file read failed, use heuristic */
            if (funcName && funcName.startsWith('new ')) {
              isSuperCall = true;
            }
          }

          if (isSuperCall) {
            continue;
          }

          return {
            function: funcName,
            file: filePath,
            line: lineNum,
            column: parseInt(match[4], 10),
          };
        }
      }
    }
  }
  return undefined;
}
