<script lang="ts">
    import SvelteSeo from 'svelte-seo';
    const title: string = '📗 Docs | typeCAD.net';
    const url: string = 'https://typecad.net/docs';
    const description: string = 'typeCAD Documentation';
    const image = '';
    const images = '';

    import {
        Card,
        CardContent,
        CardDescription,
        CardHeader,
        CardTitle,
    } from "$lib/components/ui/card/index.js";
    import { Badge } from "$lib/components/ui/badge/index.js";
    import { Button } from "$lib/components/ui/button/index.js";
    import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
    import {
        Rocket,
        Code2,
        LayoutGrid,
        Wrench,
        ArrowRight,
    } from "lucide-svelte";

    interface TrackCard {
        icon: typeof Rocket;
        title: string;
        description: string;
        badge: string;
        badgeVariant: "default" | "secondary" | "outline";
        links: { title: string; href: string }[];
    }

    const tracks: TrackCard[] = [
        {
            icon: Rocket,
            title: "Getting Started",
            description: "Set up your environment, learn the core concepts, and understand the project structure.",
            badge: "Beginner",
            badgeVariant: "secondary",
            links: [
                { title: "What is typeCAD", href: "/docs/what-is-typecad" },
                { title: "Requirements", href: "/docs/requirements" },
                { title: "Concepts", href: "/docs/concepts" },
            ],
        },
        {
            icon: Code2,
            title: "Core Language",
            description: "Learn the TypeScript API for components, pins, connections, and power nets.",
            badge: "Beginner",
            badgeVariant: "secondary",
            links: [
                { title: "Components", href: "/docs/components" },
                { title: "Pins", href: "/docs/pins" },
                { title: "Connections", href: "/docs/connections" },
            ],
        },
        {
            icon: LayoutGrid,
            title: "Board & Layout",
            description: "Control PCB placement and routing from your typeCAD code.",
            badge: "Intermediate",
            badgeVariant: "outline",
            links: [
                { title: "Board Layout", href: "/docs/board_layout" },
                { title: "Auto Router", href: "/docs/autorouter" },
            ],
        },
        {
            icon: Wrench,
            title: "Tools & Integrations",
            description: "CLI commands, Git diff, documentation generation, and KiCAD import.",
            badge: "Reference",
            badgeVariant: "outline",
            links: [
                { title: "CLI Reference", href: "/docs/cli" },
                { title: "Git Diff", href: "/docs/gitdiff" },
                { title: "Import from KiCAD", href: "/docs/import" },
            ],
        },
    ];
</script>

<section class="mx-auto max-w-[980px] flex flex-col items-center gap-2 py-8 md:py-12 md:pb-4 lg:py-16 lg:pb-8">
    <h1 class="text-3xl font-bold tracking-tight md:text-4xl">📗 typeCAD Documentation</h1>
    <p class="max-w-[600px] text-center text-muted-foreground">Programmatically create hardware designs with TypeScript and the npm ecosystem.</p>
</section>

<section class="container py-0 pb-8">
    <div class="grid gap-4 sm:grid-cols-2">
        {#each tracks as track}
            <Card class="hover:bg-muted/50 transition-colors">
                <CardHeader>
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <svelte:component this={track.icon} class="h-5 w-5 text-primary" />
                            <CardTitle class="text-lg">{track.title}</CardTitle>
                        </div>
                        <Badge variant={track.badgeVariant}>{track.badge}</Badge>
                    </div>
                    <CardDescription>{track.description}</CardDescription>
                </CardHeader>
                <CardContent>
                    <div class="flex flex-wrap gap-2">
                        {#each track.links as link}
                            <a
                                href={link.href}
                                class="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                            >
                                {link.title}
                            </a>
                        {/each}
                    </div>
                </CardContent>
            </Card>
        {/each}
    </div>
</section>



<SvelteSeo
    {title}
    {description}
    canonical={url}
    jsonLd={{
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: title,
        description: description,
        url: url,
        image: image,
    }}
    openGraph={{
        title,
        description,
        url,
        type: 'website',
        site_name: 'typeCAD.net',
    }}
/>
