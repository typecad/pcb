<script lang="ts">
	import { ScrollArea as ScrollAreaPrimitive, type WithoutChild } from "bits-ui";
	import { Scrollbar } from "./index.js";
	import { cn } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		orientation = "vertical",
		scrollbarXClasses = "",
		scrollbarYClasses = "",
		codeBlockMode = false,
		maxHeight,
		children,
		...restProps
	}: WithoutChild<ScrollAreaPrimitive.RootProps> & {
		orientation?: "vertical" | "horizontal" | "both" | undefined;
		scrollbarXClasses?: string | undefined;
		scrollbarYClasses?: string | undefined;
		codeBlockMode?: boolean;
		maxHeight?: string | undefined;
	} = $props();

	// Generate appropriate CSS classes for code block mode
	const getScrollAreaClasses = () => {
		const baseClasses = "relative overflow-hidden";
		
		if (codeBlockMode) {
			// Add scroll-area-wrapped class for CSS targeting
			return cn(baseClasses, "scroll-area-wrapped", className);
		}
		
		// Legacy behavior - add scroll-area class for backward compatibility
		return cn(baseClasses, "scroll-area", className);
	};

	// Generate viewport classes with optional max-height
	const getViewportClasses = () => {
		const baseClasses = "h-full w-full rounded-[inherit]";
		
		if (codeBlockMode && maxHeight) {
			return cn(baseClasses, `max-h-[${maxHeight}]`);
		}
		
		return baseClasses;
	};
</script>

<ScrollAreaPrimitive.Root bind:ref {...restProps} class={getScrollAreaClasses()}>
	<ScrollAreaPrimitive.Viewport class={getViewportClasses()}>
		{@render children?.()}
	</ScrollAreaPrimitive.Viewport>
	{#if orientation === "vertical" || orientation === "both"}
		<Scrollbar orientation="vertical" class={scrollbarYClasses} />
	{/if}
	{#if orientation === "horizontal" || orientation === "both"}
		<Scrollbar orientation="horizontal" class={scrollbarXClasses} />
	{/if}
	<ScrollAreaPrimitive.Corner />
</ScrollAreaPrimitive.Root>
