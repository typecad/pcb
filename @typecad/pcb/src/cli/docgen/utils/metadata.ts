import { IMetadata } from '../types/metadata.js';

export function parseMetadata(input: string): Record<string, string | boolean> {
  const metadata: Record<string, string | boolean> = {};
  const lines = input.split('\n');

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();

    if (key && value) {
      if (value.toLowerCase() === 'true' || value.toLowerCase() === 'false') {
        metadata[key] = value.toLowerCase() === 'true';
      } else {
        metadata[key] = value;
      }
    }
  }
  return metadata;
}
