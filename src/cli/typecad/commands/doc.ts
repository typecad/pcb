import path from 'node:path';
import { generateDocumentation } from '../../docgen/index.js';
import { tempManager } from '../../docgen/utils/tempFileManager.js';
import type { ParsedArgs } from '../parser.js';
import logger from '../../../utils/logging.js';

export async function run(parsed: ParsedArgs): Promise<void> {
  const markdownFile = parsed.positional[0];
  const pcbFile = parsed.positional[1];

  if (!markdownFile) {
    throw new Error('Input markdown file is required.\n' + 'Usage: typecad-pcb doc <markdown_file> <pcb_file> [options]');
  }

  if (!pcbFile) {
    throw new Error('PCB file is required.\n' + 'Usage: typecad-pcb doc <markdown_file> <pcb_file> [options]');
  }

  const inputFile = path.resolve(markdownFile);
  const pcbFilePath = path.resolve(pcbFile);
  const output = parsed.args['output'] || parsed.args['o'];
  const outputFile = output ? path.resolve(String(output)) : inputFile.replace(/\.md$/, '.html');
  const verbose = parsed.args['verbose'] === true || parsed.args['v'] === true;
  const quiet = parsed.args['quiet'] === true || parsed.args['q'] === true;
  const openFile = parsed.args['open'] !== false;

  try {
    await generateDocumentation(inputFile, pcbFilePath, outputFile, {
      verbose,
      quiet,
      openFile,
    });
  } catch (error) {
    try {
      await tempManager.cleanupAll();
    } catch {
      logger.debug('Failed to cleanup temp files');
    }
    throw error;
  }
}
