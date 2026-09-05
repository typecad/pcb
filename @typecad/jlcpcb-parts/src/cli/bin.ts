#!/usr/bin/env node

import { runApplication } from '../app/index.js';

/**
 * Main entry point for the CLI executable
 */
async function main(): Promise<void> {
  try {
    // Run the application with command-line arguments
    await runApplication(process.argv);
  } catch (error) {
    console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

// Run the main function
main().catch((error) => {
  console.error(`Unhandled error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
