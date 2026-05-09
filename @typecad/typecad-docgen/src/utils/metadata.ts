import { IMetadata } from '../types/metadata.js';

export function parseMetadata(input: string): Record<string, string | boolean> {
    const metadata: Record<string, string | boolean> = {};
    const lines = input.split('\n');

    for (const line of lines) {
        // Split on first colon to preserve any colons in URLs
        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) continue;
        
        const key = line.slice(0, colonIndex).trim();
        const value = line.slice(colonIndex + 1).trim();
        
        if (key && value) {
            // Handle boolean values
            if (value.toLowerCase() === 'true' || value.toLowerCase() === 'false') {
                metadata[key] = value.toLowerCase() === 'true';
            } else {
                // For URLs, decode any HTML entities and preserve the URL
                metadata[key] = value.replace(/&amp;/g, '&')
                                   .replace(/&lt;/g, '<')
                                   .replace(/&gt;/g, '>')
                                   .replace(/&quot;/g, '"')
                                   .replace(/&#039;/g, "'");
            }
        }
    }
    return metadata;
}

export const defaultMetadata: IMetadata = {
    highlight: 'vitesse-light',
    stylesheet: '',
    title: '',
    company: '',
    board_name: '',
    variant: '',
    filename: '',
    revision: '',
    date: '',
    kicad_theme: 'KiCAD Default',
    dark_mode: false
}; 