#!/usr/bin/env node
import { runCli } from './cli.js';

runCli(process.argv.slice(2)).catch((error) => {
  // runCli handles friendly error output and exit codes; this is a last-resort guard
  console.error(error);
  process.exit(1);
});
