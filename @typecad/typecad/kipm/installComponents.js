import fs from 'fs';
import path from 'path';
import importComponent from './importComponent.js';
import cleanupComponents from './cleanupComponents.js';
import { createSpinner } from './spinnerUtil.js';

async function installFromComponentsFile(projectName, projectDir, baseDir, dryRun = false) {
  // First, clean up any components that are no longer needed
  if (!dryRun) {
    await cleanupComponents(projectName, projectDir, baseDir);
  }

  const componentsPath = path.join(baseDir, projectDir, 'components.txt');
  
  if (!fs.existsSync(componentsPath)) {
    console.error(`components.txt not found in ${projectDir}`);
    return;
  }

  const content = fs.readFileSync(componentsPath, 'utf8');
  const lcscIds = content.split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#')); // Skip empty lines and comments

  for (const lcscId of lcscIds) {
    const spinner = createSpinner(`${dryRun ? '[DRY RUN] ' : ''}Installing ${lcscId}...`);
    try {
      const result = await importComponent(projectName, projectDir, lcscId, baseDir, dryRun);
      if (result) {
        spinner.succeed(lcscId, {
          symbolName: result.symbolName,
          footprintCount: result.footprintCount,
          modelCount: result.modelCount
        });
      } else {
        // Component was already installed
        spinner.clear();
      }
    } catch (err) {
      spinner.fail(lcscId, err.message);
    }
  }
}

export default installFromComponentsFile;
