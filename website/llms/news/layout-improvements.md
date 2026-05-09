---
title: Layout Improvements
description: Major improvements in typeCAD PCB layout
date: '2025-4-19'
categories:
  - layout
  - pcb
published: true
cover: https://unsplash.com/photos/T_l246EK19I/download?ixid=M3wxMjA3fDB8MXxzZWFyY2h8Mnx8bGV2ZWwlMjB1cHxlbnwwfHx8fDE3NDUxMjUzMTl8MA&force=true&w=640
---

# Major improvements in typeCAD PCB layout

Version 0.1.2 of [typeCAD](https://www.npmjs.com/package/@typecad/typecad) was just released with major layout improvements. Before there were significant limitations on what was possible with it. Before, when a layout was applied, it moved all the components to whatever location specified in the typeCAD code. This worked well enough as an MVP, but wasn't a great developer experience. 

Now with this new release, that has been fixed. To keep the components from moving around, they just need to be given a UUID:

```ts
this.C1 = new Capacitor({ value: '10uF', uuid: '6d588378-32ea-4e85-a943-d9b373a3d454' });
```

There are several VS Code extensions that can help with the generation. [Here's one](https://marketplace.visualstudio.com/items?itemName=netcorext.uuid-generator). 

## Other improvements
There were also improvements in BOM generation. Fields can be customized in typeCAD code.