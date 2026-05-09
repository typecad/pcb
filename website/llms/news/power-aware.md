---
title: Power aware design
description: typeCAD can check for power compatibility between components now
date: '2025-6-12'
categories:
  - typecad
  - kicad
  - editing
  - sync
  - code-as-schematic
published: true
cover: https://unsplash.com/photos/SG9Ycz2uqGs/download?ixid=M3wxMjA3fDB8MXxzZWFyY2h8NDR8fGRvJTIwbm90JTIwdG91Y2h8ZW58MHwwfHx8MTc0OTc0NTg2M3ww&force=true&w=640
---

# Building power aware circuits with typeCAD
**type**CAD can now check for power issues as you develop your circuits. 

## Current carrying tracks
When creating tracks, you can pass a `powerInfo` object that includes the current the track will carry. **type**CAD will check that the track is wide enough to handle the current. 

```ts
let track = pcb.track()
    .powerInfo({ current: 1.0, maxTempRise: 10, thickness: 35 });
    .from({x: 100, y: 100}, "F.Cu", 0.2)
    .to({x: 110, y: 100})
    .to({x: 110, y: 120, layer: "B.Cu"})
```

Using the above code, **type**CAD will check that the track is wide enough to handle 1 amp of current for the specified temperature rise and copper thickness. 

If not, it will throw an error during build. Like this:

```
[TrackBuilder] ERROR: Track width 0.2mm is too narrow for 1A current on F.Cu. Minimum width should be 0.300mm.
```

This works for any segment of track and it is automatically done during every build. You don't need to have a separate calculator and manually check each track segment. 

## Current carrying vias
Vias can be created with the optional `powerInfo` object. This allows **type**CAD to check that the current draw through the via is within the limits of the via's rating using the IPC-2221 standard. `maxTempRise` is the maximum wanted rise in temperature of the via, default is 10 C. `thickness` is the thickness of the via's copper in microns. 35 is the default (1 oz).

```ts
let via = pcb.via({
  at: { x: 10, y: 10 },
  size: 0.6,
  drill: 0.3,
  powerInfo: { current: 3, maxTempRise: 10, thickness: 35 },
});
```

Using the above code, **type**CAD will check that the via is large enough to handle 1 amp of current for the specified temperature rise and copper thickness. 

If not, it will throw an error during build. Like this:

```
[PCB VIA] ERROR: Via size 0.6mm (drill 0.3mm) is too small for 3A current. Maximum capacity is 2.75A @ 10°C rise
```

This also works automatically during every build. 

## Connecting power aware tracks, vias and pins
**type**CAD also now allows for `powerInfo` objects to be attached to pins of components. This allows for checking proper voltage levels and current draw between components and the nets they are connected to. 

- If you try to connect a device that draws 1 Amp, but only power it with a 0.8 Amp power supply, you'll see an error.
- If you try to connect a 5V device to a 3.3V power supply, you'll see an error.
- and many more issues are detected

This all happens automatically during every build. 

## Taking advantage of programmatic circuit design
This is a good example of taking full advantage of programming concepts for circuit design.