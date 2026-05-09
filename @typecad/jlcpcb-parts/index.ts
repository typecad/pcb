#!/usr/bin/env tsx

import { runApplication } from './src/app/index.js';

/**
 * Main entry point for the application
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
main().catch(error => {
  console.error(`Unhandled error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});