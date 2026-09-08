import type { Skill } from './types.js';

export const configSkills: Skill[] = [
  {
    name: 'config',
    category: 'configuration',
    description: 'Configure typeCAD projects using typecad.conf.ts, typecad.conf.js, or typecad.json',
    package: '@typecad/pcb',
    import: "import { defineConfig } from '@typecad/pcb';",
    examples: [
      {
        title: 'typecad.conf.ts',
        code: `import { defineConfig } from '@typecad/pcb';

export default defineConfig({
  entry: './src/my-board.ts',
  kicad_cli: '/usr/bin/kicad-cli',
  verbose: true,
});`,
      },
      {
        title: 'typecad.json',
        code: `{
  "entry": "./src/my-board.ts",
  "kicad_cli": "C:\\\\Program Files\\\\KiCad\\\\9.0\\\\bin\\\\kicad-cli.exe",
  "verbose": false
}`,
      },
    ],
    notes: [
      'Config file search order: typecad.conf.ts, typecad.conf.js, typecad.json (in project root)',
      'entry: path to your TypeScript entry file (auto-detected if omitted)',
      'kicad_cli: explicit path to kicad-cli binary (auto-detected if omitted)',
      'kicad_path: path to KiCad installation directory',
      'use_flatpak: set true for Linux Flatpak KiCad installations',
      'verbose: enable verbose logging during build',
      'defineConfig() provides type hints and validation for the config object',
    ],
    related: ['build', 'pcb-structure', 'create-project'],
  },
];
