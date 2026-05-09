import { KiCAD as BaseKiCAD, kicad_cli_path, kicad_path } from '@typecad/typecad';

export { kicad_cli_path };

export let kicad_symbols_path: string | undefined;

export class KiCAD {
	constructor() {
		new BaseKiCAD();
		if (kicad_path) {
			const libraryPaths = new BaseKiCAD().getLibraryPaths();
			if (libraryPaths.symbols) {
				kicad_symbols_path = libraryPaths.symbols;
			}
		}
	}

	getSymbolsPath(): string | undefined {
		return kicad_symbols_path;
	}

	getCliPath(): string | undefined {
		return kicad_cli_path;
	}

	async hasLocalSymbols(): Promise<boolean> {
		if (!kicad_symbols_path) {
			return false;
		}

		const fs = await import('node:fs');
		try {
			const files = await fs.promises.readdir(kicad_symbols_path);
			return files.some(file => file.endsWith('.kicad_sym'));
		} catch (error) {
			return false;
		}
	}
}
