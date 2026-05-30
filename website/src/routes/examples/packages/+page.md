<script lang="ts">
	import { buttonVariants } from "$lib/components/ui/button";
	import { AtSign } from 'lucide-svelte';
  	import Icon from '@iconify/svelte';
    import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
  	import Youtube from "svelte-youtube-embed";

</script>

# Adding typeCAD Packages
**type**CAD is just code and code can be easily packaged and distributed. Read more about them at their [doc](/docs/package/overview) page, but quickly they allow for easy packaging/installation/reuse of blocks of code. A particularly useful thing is implementing a particular IC, including all the passives, connections, and tracks to use it. The result is simply importing packages and connecting them together.

Since a package is entirely defined by the package itself and what it does, there is no _one way_ to use them, so each package comes with its own documentation. 

## `@typecad/rd-bq24210`
There is a [package](https://www.npmjs.com/package/@typecad/rd-bq24210) available that implements the [bq24210](https://www.ti.com/lit/ds/symlink/bq24210.pdf), a solar-powered battery charger. Let's add it to an existing project.

### `npm i`
Run `npm i @typecad/rd-bq24210` in your project's `./hw` directory. It will install all the required files including KiCAD symbols, footprints and 3d models into the project's `./build/lib` directory. 

<br />

> [!WARNING]
> When using any `npm` command, ensure it is entered in the `./hw` directory, at the same level as the `package.json` file is. If it is given in another folder, it either won't work, or will create a bunch of unwanted folders. 

### `import`
The package's page gives implementation code:

```ts
import { rd_bq24210 } from '@typecad/rd-bq24210';
```

### `new`
Create a new instance:

```ts
...
let charger = new rd_bq24210({ 
  chargeCurrentMa: 500,
  temperatureMonitoring: true,
  pcb: typecad 
});
...
```
According to the package documentation, there are a couple things that can be configured in this step: the charging current and using temperature monitoring. 

Charging current is determined by a simple formula that results in a resistor value connected to the IC, the package does the calculations and returns a resistor value to provide the specified current. 

### `create`
The package has a property, `::components` which includes all `create`-able elements. This can be passed directly to your `PCB::create()` method.

```ts
...
typecad.create(charger.components);
...
```

### Additional connections
This particular IC needs a solar panel and a battery connected to it as explained in the documentation. 

## Layout
Build the project, open the PCB and you will find the package: components, connections, and tracks grouped together. You can drag it around your board and route tracks to it as needed. 