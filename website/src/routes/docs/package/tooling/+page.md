<script lang="ts">
    import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
    import { buttonVariants } from "$lib/components/ui/button";
    import ChevronRight from "lucide-svelte/icons/chevron-right";
    let { data }: { data: PageData } = $props();
</script>

# Tooling
**type**CAD has a command-line tool to generate all the boilerplate code for a package. It sets up the package for easy publishing and reuse. 

<br />

> [!note] 
> The tool creates a package to write **type**CAD-related code. If you're interested in a more utility-focused package rather than creating/placing/connecting components, you can simply create an npm package with `npm init`.

Execute the following command in `./hw` of an already existing **type**CAD project.
<ScrollArea orientation="both">

```bash
typecad add package
```
</ScrollArea>

You'll see two options after running the script:
- Empty Package: create an empty package
- Component Package: creates a package based around a component. This is useful for creating reference designs around a component, for example. 

If you choose an empty package, the script will create a directory and package structure and then give you instructions on how to `import` it into your project. If you choose a component package, it will ask you for the symbol and footprint files for the main component the package will be based around. The package will additionally include more boilerplate code for creating that component in the package. 

### Non-interactive mode
All the information can be passed by command-line arguments and the script will automatically create a component. `--help` will show all the parameters.

<ScrollArea orientation="horizontal">

```bash
# An empty package
typecad add package --empty=true --name=my_package

# Component from KiCAD
typecad add package --component=true --name=attiny_package --kicad=true --symbol=MCU_Microchip_ATtiny:ATtiny3227-M --footprint=Package_DFN_QFN:DFN-20-1EP_3x4mm_P0.5mm_EP1.65x3.1mm

# local files
typecad add package --component=true --name=local_component --local=true --symbol=kicad_sch:symbol_name --footprint=kicad_mod:footprint_name

# JLCPCB components
typecad add package --component=true --name=resistor_package --jlcpcb=true --c=C3217148
```
</ScrollArea>

The above is the minimum to run automatically.

<div class="relative">
<br/>
<br/>
<br/>
    <p class="absolute right-0">
       <a href="/docs/package/structure" class={buttonVariants({ variant: "outline" })}>Structure<ChevronRight /></a>
    </p>
</div>