# ScrollArea Component

Enhanced ScrollArea component with backward compatibility and code block optimization.

## Features

- **Backward Compatibility**: Existing usage continues to work unchanged
- **Code Block Mode**: Optimized styling for code blocks with `codeBlockMode` prop
- **Flexible Height**: Optional `maxHeight` prop for constrained scrolling
- **CSS Integration**: Works seamlessly with auto-scroll CSS classes

## Usage

### Legacy Usage (Backward Compatible)
```svelte
<ScrollArea class="h-32">
  <pre><code>Your code here</code></pre>
</ScrollArea>
```

### Enhanced Usage for Code Blocks
```svelte
<ScrollArea codeBlockMode={true} maxHeight="24rem" orientation="both">
  <pre><code>Your code here</code></pre>
</ScrollArea>
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `codeBlockMode` | `boolean` | `false` | Enables code block optimizations and adds `scroll-area-wrapped` class |
| `maxHeight` | `string` | `undefined` | Sets maximum height for the viewport (e.g., "24rem", "300px") |
| `orientation` | `"vertical" \| "horizontal" \| "both"` | `"vertical"` | Scroll direction |
| `scrollbarXClasses` | `string` | `""` | Additional classes for horizontal scrollbar |
| `scrollbarYClasses` | `string` | `""` | Additional classes for vertical scrollbar |

## CSS Classes

- **Legacy**: Adds `scroll-area` class for backward compatibility
- **Enhanced**: Adds `scroll-area-wrapped` class when `codeBlockMode={true}`

## Integration with Auto-Scroll

The component works seamlessly with the auto-scroll CSS system:

- When wrapped in ScrollArea, code blocks automatically disable their native scrolling
- ScrollArea takes over scrolling responsibility
- CSS specificity rules ensure proper precedence

## Examples

See `scroll-area-test.svelte` for comprehensive usage examples.