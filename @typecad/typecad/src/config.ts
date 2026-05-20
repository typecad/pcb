import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import chalk from 'chalk';
import logger from './logging.js';

export class Config {
    #contents: Record<string, string> | null = null;

    #open() {
        if (this.#contents !== null) return;

        const configPath = path.join(process.cwd(), 'typecad.json');
        
        try {
            if (!fs.existsSync(configPath)) {
                this.#contents = {};
                return;
            }
    
            let config_text = fs.readFileSync(configPath, "utf8");
            this.#contents = JSON.parse(config_text);
        } catch (error) {
            logger.error('- ', chalk.red.bold('ERROR: cannot read/process typecad.json. Try editing or deleting the file.'));
            this.#contents = {};
        }
    }

    get(key: string): string {
        this.#open();

        if (key in this.#contents!) {
            return this.#contents![key];
        } else {
            return '';
        }
    }

    set(key: string, value: string): boolean {
        this.#open();

        const configPath = path.join(process.cwd(), 'typecad.json');

        this.#contents![key] = value;

        try {
            fs.writeFileSync(configPath, JSON.stringify(this.#contents, null, 2));
        } catch (err) {
            logger.error(err);
            return false;
        }

        return true;
    }
}
