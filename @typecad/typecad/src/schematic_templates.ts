export const schematic_template = `
(kicad_sch
	(version 20250114)
	(generator "typecad")
	(generator_version "0.1.0")
	(paper "A4")
    (uuid "{{{uuid}}}")

    (lib_symbols
	{{#each lib_symbols}}
    {{this}}
    {{/each}}
    )

	{{#each wires}}
	{{this}}
	{{/each}}

	{{#each labels}}
	{{this}}
	{{/each}}

	{{#each symbols}}
    {{this}}
    {{/each}}

	(sheet_instances
		(path "/"
			(page "1")
		)
	)
	(embedded_fonts no)
)`;

export const label_template = `
		(label "{{{net_name}}}"
			(at {{{x}}} {{{y}}} {{{label_rotation}}})
			(effects
				(font
					(size 1.27 1.27)
				)
				(justify {{{justify_horizontal}}} {{{justify_vertical}}})
			)
			(uuid "{{{uuid}}}")
		)
`;
