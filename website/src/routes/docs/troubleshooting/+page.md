<script lang="ts">
    import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
    let { data }: { data: PageData } = $props();
</script>

# Troubleshooting

Common errors and their solutions when working with typeCAD.

## Import and Module Errors

### "Cannot find module '@typecad/typecad'"
**Cause**: Component created in wrong directory or `@typecad/typecad` not installed.

**Solution**: 
1. Ensure you're working in the `hw/` directory
2. Check that `hw/package.json` includes `@typecad/typecad` dependency
3. Run `npm install` in the `hw/` directory

### "Module has no exported member 'Connector'"
**Cause**: Importing from wrong package path.

<ScrollArea orientation="both">

```ts
// ❌ Wrong
import { Connector } from '@typecad/passives/0603';

// ✅ Correct
import { Connector } from '@typecad/passives/connector';
```
</ScrollArea>

## Connection Errors

### "Property 'connect' does not exist on type 'Pin'"
**Cause**: Using non-existent `.connect()` method.

<ScrollArea orientation="both">

```ts
// ❌ Wrong
pin1.connect(pin2);

// ✅ Correct
typecad.net(pin1, pin2);
```
</ScrollArea>

### "Property 'pin' does not exist"
**Cause**: Using string-based pin access on components with named pins.

<ScrollArea orientation="both">

```ts
// ❌ Wrong
esp32.pin('VDD')

// ✅ Correct
esp32.VDD         // or esp32.pin(8) if VDD is pin 8
```
</ScrollArea>

## Component Creation Errors

### "Cannot find name 'ComponentName'"
**Cause**: Component file not imported or created in wrong location.

**Solution**:
1. Ensure component was created with `typecad add component`
2. Check the import statement matches the generated file
3. Verify component file is in `hw/src/` directory

### Component properties not working
<ScrollArea orientation="both">

```ts
// ❌ Wrong
new Connector({ pins: 3 })

// ✅ Correct
new Connector({ number: 3 })
```
</ScrollArea>

Check the component documentation for correct property names.

## Build Errors

### TypeScript compilation errors
1. Check all imports are correct
2. Ensure all components are properly created with `typecad.create()`
3. Verify pin connections use correct syntax

### KiCAD file generation issues
1. Ensure all components have valid symbols and footprints
2. Check that all nets have at least 2 pins connected
3. Verify component references are unique

## Getting Help

If you're still stuck:
1. Check the [Examples](/examples) for working code patterns
2. Join the [Reddit community](https://www.reddit.com/r/typecad/) 
3. Review the [API documentation](/docs) for correct syntax
