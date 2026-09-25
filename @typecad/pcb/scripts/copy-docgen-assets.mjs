import { cpSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const srcDir = join('src', 'cli', 'docgen', 'styles');
const destDir = join('dist', 'cli', 'docgen', 'styles');

mkdirSync(destDir, { recursive: true });

for (const file of readdirSync(srcDir)) {
  cpSync(join(srcDir, file), join(destDir, file));
}
