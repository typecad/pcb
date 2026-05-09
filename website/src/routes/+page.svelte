<script lang="ts">
  import * as PageHeader from "$lib/components/page-header/index.js";
  import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
  } from "$lib/components/ui/card";
  import { Blocks, Braces, GitMerge, Hexagon } from "lucide-svelte";
  // import '../app.css';
  import "../markdown.css";
  import SvelteSeo from "svelte-seo";
  const title: string = "🛖 Home | typeCAD.net";
  const url: string = "https://typeCAD.net";
  const description: string =
    "TypeScript + KiCAD = typeCAD: Write TypeScript code and build it into a KiCAD project";
  const image = "";
  const images = "";
  interface BenefitsProps {
    icon: "sparkle" | "tag" | "paintbrush" | "blocks" | "lineChart" | "wallet";
    title: string;
    description: string;
  }
  import Icon from "@iconify/svelte";

  const benefitList: BenefitsProps[] = [
    {
      icon: "blocks",
      title:
        "<a class='hover:text-primary underline decoration-dotted' href='/code'>Code</a>",
      description:
        "Write TypeScript code instead of clicking/dragging in a GUI.",
    },
    {
      icon: "tag",
      title:
        "<a class='hover:text-primary underline decoration-dotted' href='/git'>`git`</a>",
      description: "Git for meaningful version control and CI/CD",
    },
    {
      icon: "paintbrush",
      title:
        "<a class='hover:text-primary underline decoration-dotted' href='/package'>Package</a>",
      description: "npm/Node.js to install/update/shrinkwrap/publish your code",
    },
    {
      icon: "sparkle",
      title:
        "<a class='hover:text-primary underline decoration-dotted' href='/automate'>Automate</a>",
      description:
        "Develop custom integrations, auto-documentation, custom validation and AI",
    },
  ];

  const iconMap = {
    sparkle: Blocks,
    tag: GitMerge,
    paintbrush: Hexagon,
    blocks: Braces,
    lineChart: Braces,
    wallet: Braces,
  };
</script>

<PageHeader.Root class="">
  <!-- <a
    href="/buy/kits"
    class={cn(
      'inline-flex items-center rounded-lg bg-muted px-3 py-1 text-sm font-medium'
    )}
    {...$$restProps}>
    <Icon style="display:inline" inline icon="fluent-emoji-flat:puzzle-piece" />
    <Separator class="mx-1 h-1" orientation="vertical" />
    <span>Use 15OFFKITS at checkout for 15% savings on kits</span>
    <ArrowRight class="ml-1 size-4" />
  </a> -->

  <PageHeader.Heading>typeCAD</PageHeader.Heading>
  <PageHeader.Description class="text-muted-foreground">
    🤖programmatically 💥create 🛰️hardware
  </PageHeader.Description>
</PageHeader.Root>

<section class="container py-24 sm:py-16">
  <div class="grid lg:grid-cols-2 place-items-center lg:gap-24">
    <div>
      <h2
        class="text-4xl md:text-4xl max-w-lg tracking-tighter text-left font-regular"
      >
        TypeScript + KiCAD = typeCAD
      </h2>
      <p
        class="text-s leading-relaxed tracking-tight text-muted-foreground max-w-md text-left"
      >
        Write TypeScript code and build it into a KiCAD project
      </p>
      <p
        class="text-s leading-relaxed tracking-tight text-muted-foreground max-w-md text-left"
      >
        Use all the normal software tools, but now for hardware
      </p>
      <p
        class="text-s leading-relaxed tracking-tight text-muted-foreground max-w-md text-left"
      >
        Package your code into small packages
      </p>
      <p
        class="text-s leading-relaxed tracking-tight text-muted-foreground max-w-md text-left"
      >
        Quickly combine known-working packages into larger projects
      </p>
      <br />
      <p class="text-s leading-relaxed tracking-tight max-w-md text-left">
        Read our <a
          href="/getting-started"
          style="color: #4d9375; font-weight: 700"
          >getting started guide <Icon
            style="display:inline"
            inline
            icon="fluent-emoji-flat:auto-rickshaw"
            width="20"
            height="20"
          /></a
        >
      </p>
    </div>

    <div class="grid lg:grid-cols-2 gap-4 w-full">
      {#each benefitList as { icon, title, description }, index}
        <Card
          class="bg-muted/50 dark:bg-card hover:bg-background dark:hover:bg-background transition-all delay-75 group/number"
        >
          <CardHeader>
            <div class="flex justify-between">
              <svelte:component
                this={iconMap[icon]}
                class="size-8 mb-6 text-primary"
              />
              <span
                class="text-5xl text-muted-foreground/15 font-medium transition-all delay-75 group-hover/number:text-muted-foreground/30"
              >
                0{index + 1}
              </span>
            </div>
            <CardTitle
              class="[&_a]:text-primary [&_a]:hover:text-primary/80 [&_a]:transition-colors [&_a]:underline-offset-4 [&_a]:hover:underline"
              >{@html title}</CardTitle
            >
          </CardHeader>

          <CardContent class="text-muted-foreground">
            {description}
          </CardContent>
        </Card>
      {/each}
    </div>
  </div>
</section>

<SvelteSeo
  {title}
  {description}
  canonical={url}
  jsonLd={{
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: title,
    description: description,
    url: url,
    image: image,
  }}
  openGraph={{
    title,
    description,
    url,
    type: "website",
    site_name: "typeCAD.net",
    // images
  }}
/>
