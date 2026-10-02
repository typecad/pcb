import { escapeSexprString } from '../sexpr/escape.js';
import { GENERATOR_NAME, generatorVersion } from '../utils/generator_identity.js';

export function renderSchematic(data: {
  uuid: string;
  lib_symbols: string[];
  wires: string[];
  labels: string[];
  symbols: string[];
}): string {
  return `(kicad_sch
	(version 20250114)
	(generator "${GENERATOR_NAME}")
	(generator_version "${generatorVersion()}")
	(paper "A4")
    (uuid "${data.uuid}")

    (lib_symbols
${data.lib_symbols.map((s) => `    ${s}`).join('\n')}
    )

${data.wires.map((s) => `\t${s}`).join('\n')}

${data.labels.map((s) => `\t${s}`).join('\n')}

${data.symbols.map((s) => `    ${s}`).join('\n')}

	(sheet_instances
		(path "/"
			(page "1")
		)
	)
	(embedded_fonts no)
)`;
}

export function renderLabel(data: {
  net_name: string;
  x: number;
  y: number;
  label_rotation: number;
  justify_horizontal: string;
  justify_vertical: string;
  uuid: string;
}): string {
  return `
		(label "${escapeSexprString(data.net_name)}"
			(at ${data.x} ${data.y} ${data.label_rotation})
			(effects
				(font
					(size 1.27 1.27)
				)
				(justify ${data.justify_horizontal} ${data.justify_vertical})
			)
			(uuid "${data.uuid}")
		)
`;
}
