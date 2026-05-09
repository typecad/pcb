# ScrollArea Usage Examples

## Backward Compatibility

All existing ScrollArea usage continues to work unchanged:

```svelte
<!-- Existing usage in markdown files -->
<ScrollArea orientation="both">
```ts
// Your existing code here
// This will continue to work exactly as before
// The component adds 'scroll-area' class for CSS targeting
```
</ScrollArea>

<!-- Existing usage with custom classes -->
<ScrollArea class="h-32 w-full" orientation="vertical">
  <pre><code>// Legacy usage preserved</code></pre>
</ScrollArea>
```

## Enhanced Features

### Code Block Mode

For optimized code block handling:

```svelte
<ScrollArea codeBlockMode={true} orientation="both">
```ts
// Enhanced code block with optimized styling
// Adds 'scroll-area-wrapped' class for better CSS integration
// Works seamlessly with auto-scroll system
```
</ScrollArea>
```

### Constrained Height

For code blocks with maximum height limits:

```svelte
<ScrollArea codeBlockMode={true} maxHeight="24rem" orientation="both">
```ts
// Code block with constrained height
// Viewport will have max-h-[24rem] class applied
// Useful for preventing overly tall code blocks
```
</ScrollArea>
```

## CSS Integration

The enhanced ScrollArea works with the auto-scroll CSS system:

- **Legacy mode**: Adds `scroll-area` class, CSS rules disable native scrolling on `pre` elements
- **Enhanced mode**: Adds `scroll-area-wrapped` class, same CSS behavior with better specificity
- **Auto-scroll classes**: When ScrollArea wraps code blocks, native auto-scroll classes are overridden
- **Responsive**: Works with all responsive breakpoints and accessibility features

## Migration Guide

No migration needed! Existing code continues to work. To use enhanced features:

1. Add `codeBlockMode={true}` for optimized code block styling
2. Add `maxHeight="..."` for height constraints
3. The component automatically handles CSS class assignment

## Browser Support

- All modern browsers with CSS Grid and Flexbox support
- Graceful degradation for older browsers
- Accessibility features preserved
- Custom scrollbar styling where supported