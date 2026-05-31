import type { NavItem, SidebarNavItem } from "$lib/types/nav.js";

type DocsConfig = {
	mainNav: NavItem[];
	sidebarNav: SidebarNavItem[];
	buyNav: SidebarNavItem[];
	developNav: SidebarNavItem[];
	rdNav: SidebarNavItem[];
	docsNav: SidebarNavItem[];
	packageNav: SidebarNavItem[];

};

export const docsConfig: DocsConfig = {
	mainNav: [
		{
			title: "Getting Started",
			href: "/getting-started",
		},
		{
			title: "Docs",
			href: "/docs",
		},
		{
			title: "Packages",
			href: "/packages",
		},
		{
			title: "Examples",
			href: "/examples",
		},
		{
			title: "News",
			href: "/news",
		},
	],
	sidebarNav: [
		{
			title: "Docs",
			href: "/docs",
			items: [
				{
					title: "Requirements",
					href: "/docs/requirements",
					items: [],
				},
				{
					title: "Concepts",
					href: "/docs/concepts",
					items: [],
				},
				{
					title: "Configuration",
					href: "/docs/configuration",
					items: [],
				},
				{
					title: "CLI Reference",
					href: "/docs/cli",
					items: [],
				},
				{
					title: "Project Structure",
					href: "/docs/project-structure",
					items: [],
				},
				{
					title: "Classes",
					href: "/docs/classes",
					items: [],
				},
				{
					title: "Passives",
					href: "/docs/passives",
					items: [],
				},
				{
					title: "Components",
					href: "/docs/components",
					items: [],
				},
				{
					title: "Pins",
					href: "/docs/pins",
					items: [],
				},
				{
					title: "Connections",
					href: "/docs/connections",
					items: [],
				},
				{
					title: "Board Layout",
					href: "/docs/board_layout",
					items: [],
				},
				{
					title: "Auto Router",
					href: "/docs/autorouter",
					items: [],
				},
			]
		},
		{
		title: "Packages",
			href: "/docs",
			items: [
				{
					title: "Overview",
					href: "/docs/package/overview",
					items: [],
				},
				{
					title: "Tooling",
					href: "/docs/package/tooling",
					items: [],
				},
				{
					title: "Structure",
					href: "/docs/package/structure",
					items: [],
				},
				{
					title: "Code",
					href: "/docs/package/code",
					items: [],
				},
				{
					title: "Use",
					href: "/docs/package/use",
					items: [],
				},
				// {
				// 	title: "IoT Reference Designs",
				// 	href: "/buy/rd",
				// 	items: [],
				// },
				// {
				// 	title: "Extras",
				// 	href: "/buy/extras",
				// 	items: [],
				// },
			],
		},
		// {
		// 	title: "Develop",
		// 	items: [
		// 		{
		// 			title: "mod-EC",
		// 			href: "/docs/components/accordion",
		// 			items: [],
		// 		},
		// 		// {
		// 		// 	title: "Measure pH",
		// 		// 	href: "/docs/components/alert",
		// 		// 	items: [],
		// 		// },
		// 		// {
		// 		// 	title: "Measure ORP",
		// 		// 	href: "/docs/components/alert",
		// 		// 	items: [],
		// 		// },
		// 		// {
		// 		// 	title: "IoT Device",
		// 		// 	href: "/docs/components/alert",
		// 		// 	items: [],
		// 		// },
		// 	],
		// },
	],
	buyNav: [
		{
			title: "Buy",
			href: "/buy",
			items: [
				{
					title: "Kits",
					href: "/buy/kits",
					items: [],
				},
				{
					title: "Hardware & Probes",
					href: "/buy/hw-probes",
					items: [],
				},
				{
					title: "Reference Designs",
					href: "/buy/rd",
					items: [],
				},
			],
		},
	],
	developNav: [
		{
			title: "Develop",
			href: "/develop",
			items: [
				{
					title: "Sensor Modules",
					href: "/develop/modules",
					items: [],
				},
				{
					title: "Kits",
					href: "/develop/kits",
					items: [],
				},
				{
					title: "Reference Designs",
					href: "/develop/rd",
					items: [],
				},
				// {
				// 	title: "FAQ",
				// 	href: "/develop/faq",
				// 	items: [],
				// },
				// {
				// 	title: "IoT Reference Designs",
				// 	href: "/buy/rd",
				// 	items: [],
				// },
				// {
				// 	title: "Extras",
				// 	href: "/buy/extras",
				// 	items: [],
				// },
			],
		},
	],
	rdNav: [
		{
			title: "Reference Designs",
			href: "/rd",
			items: [
				{
					title: "What are they?",
					href: "/rd/about",
					items: [],
				},
				{
					title: "Designs",
					href: "/develop/kits",
					items: [],
				},
				{
					title: "Source",
					href: "/develop/kits",
					items: [],
				},
			],
		},
	],
	docsNav: [
		{
			title: "Docs",
			href: "/docs",
			items: [
				{
					title: "What is typeCAD",
					href: "/docs/what-is-typecad",
					items: [],
					group: "Getting Started",
				},
				{
					title: "Requirements",
					href: "/docs/requirements",
					items: [],
					group: "Getting Started",
				},
				{
					title: "Concepts",
					href: "/docs/concepts",
					items: [],
					group: "Getting Started",
				},
				{
					title: "Project Structure",
					href: "/docs/project-structure",
					items: [],
					group: "Getting Started",
				},
				{
					title: "Configuration",
					href: "/docs/configuration",
					items: [],
					group: "Core Language",
				},
				{
					title: "Components",
					href: "/docs/components",
					items: [],
					group: "Core Language",
				},
				{
					title: "Pins",
					href: "/docs/pins",
					items: [],
					group: "Core Language",
				},
				{
					title: "Passives",
					href: "/docs/passives",
					items: [],
					group: "Core Language",
				},
				{
					title: "Connections",
					href: "/docs/connections",
					items: [],
					group: "Core Language",
				},
				{
					title: "Power",
					href: "/docs/power",
					items: [],
					group: "Core Language",
				},
				{
					title: "Classes",
					href: "/docs/classes",
					items: [],
					group: "Core Language",
				},
				{
					title: "Board Layout",
					href: "/docs/board_layout",
					items: [],
					group: "Board & Layout",
				},
				{
					title: "Auto Router",
					href: "/docs/autorouter",
					items: [],
					group: "Board & Layout",
				},
				{
					title: "CLI Reference",
					href: "/docs/cli",
					items: [],
					group: "Tools & Integrations",
				},
				{
					title: "Tooling",
					href: "/docs/tooling",
					items: [],
					group: "Tools & Integrations",
				},
				{
					title: "Git Diff",
					href: "/docs/gitdiff",
					items: [],
					group: "Tools & Integrations",
				},
				{
					title: "DocGen",
					href: "/docs/docgen",
					items: [],
					group: "Tools & Integrations",
				},
				{
					title: "Import from KiCAD",
					href: "/docs/import",
					items: [],
					group: "Tools & Integrations",
				},
				// {
				// 	title: "Hardware Contract",
				// 	href: "/docs/hardware-contract",
				// 	items: [],
				// 	group: "Tools & Integrations",
				// },
				// {
				// 	title: "AI Notes",
				// 	href: "/docs/ai",
				// 	items: [],
				// 	group: "Tools & Integrations",
				// },
				// {
				// 	title: "Troubleshooting",
				// 	href: "/docs/troubleshooting",
				// 	items: [],
				// 	group: "Tools & Integrations",
				// },
			],
		},
	],
	packageNav: [
		{
			title: "Packages",
			href: "/docs",
			items: [
				{
					title: "Overview",
					href: "/docs/package/overview",
					items: [],
				},
				{
					title: "Tooling",
					href: "/docs/package/tooling",
					items: [],
				},
				{
					title: "Structure",
					href: "/docs/package/structure",
					items: [],
				},
				{
					title: "Code",
					href: "/docs/package/code",
					items: [],
				},
				{
					title: "Use",
					href: "/docs/package/use",
					items: [],
				},
				// {
				// 	title: "IoT Reference Designs",
				// 	href: "/buy/rd",
				// 	items: [],
				// },
				// {
				// 	title: "Extras",
				// 	href: "/buy/extras",
				// 	items: [],
				// },
			],
		},
	],
};
