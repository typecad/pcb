import fs from 'node:fs';
import chalk from 'chalk';

export interface Locatable {
    reference: string;
    sourceInfo?: {
        file: string;
        line: number;
        variable?: string;
    };
}

/**
 * Reports a beautiful, colorized error message with source code context.
 * 
 * @param message The error message
 * @param item The component or object with source info
 */
export function reportError(message: string, item: Locatable) {
    const sourceInfo = item.sourceInfo;
    
    // Header
    console.log(chalk.red.bold(`\nError: ${message}`));
    
    if (sourceInfo && sourceInfo.file && sourceInfo.line) {
        const variableName = sourceInfo.variable || item.reference;
        console.log(`  at ${chalk.cyan(variableName)} (${chalk.gray(sourceInfo.file + ':' + sourceInfo.line)})`);
        
        try {
            if (fs.existsSync(sourceInfo.file)) {
                const content = fs.readFileSync(sourceInfo.file, 'utf-8');
                const lines = content.split(/\r?\n/);
                const lineIdx = sourceInfo.line - 1;
                
                const startLine = Math.max(0, lineIdx - 2);
                const endLine = Math.min(lines.length - 1, lineIdx + 2);
                
                console.log(); // Spacer
                
                for (let i = startLine; i <= endLine; i++) {
                    const lineNumStr = (i + 1).toString().padStart(5, ' ');
                    const lineContent = lines[i];
                    
                    if (i === lineIdx) {
                        // Highlighted line
                        console.log(`${chalk.red('>')} ${chalk.gray(lineNumStr)} | ${lineContent}`);
                        
                        // Try to add a pointer under the variable name
                        if (sourceInfo.variable && lineContent.includes(sourceInfo.variable)) {
                            const indent = lineContent.indexOf(sourceInfo.variable);
                            const pointer = ' '.repeat(indent) + '^'.repeat(sourceInfo.variable.length);
                            console.log(`        | ${chalk.red(pointer)}`);
                        }
                    } else {
                        // Context lines
                        console.log(`  ${chalk.gray(lineNumStr)} | ${chalk.gray(lineContent)}`);
                    }
                }
                console.log(); // Spacer
            }
        } catch (e) {
            // Fallback if file reading fails
            console.log(chalk.gray(`  [Could not read source file: ${(e as Error).message}]`));
        }
    } else {
        console.log(`  at ${chalk.cyan(item.reference)} (No source info available)`);
    }
}
