import { cva, type VariantProps } from "class-variance-authority";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/utils/ui";

const TooltipProvider = TooltipPrimitive.Provider;

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

const tooltipVariants = cva(
	"z-50 overflow-visible rounded-sm text-sm shadow-md",
	{
		variants: {
			variant: {
				default: "bg-popover text-popover-foreground border px-3 py-1.5",
				destructive:
					"bg-destructive/10 text-destructive dark:bg-destructive/20 border-destructive [border-width:0.5px]",
				outline: "border-border",
				important: "bg-popover text-primary border border-border",
				promotions: "bg-popover text-primary border border-border",
				personal: "bg-popover text-primary border border-border",
				updates: "bg-popover text-primary border border-border",
				forums: "bg-popover text-primary border border-border",
				sidebar:
					"bg-popover text-popover-foreground border p-2.5 flex flex-col gap-2",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
);

interface TooltipContentProps
	extends React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>,
		VariantProps<typeof tooltipVariants> {}

const TooltipContent = React.forwardRef<
	React.ElementRef<typeof TooltipPrimitive.Content>,
	TooltipContentProps
>(({ className, sideOffset = 4, variant, ...props }, ref) => (
	<TooltipPrimitive.Content
		ref={ref}
		sideOffset={sideOffset}
		className={cn(tooltipVariants({ variant }), className)}
		{...props}
	>
		{variant === "sidebar" && (
			<svg
				width="6"
				height="10"
				viewBox="0 0 6 10"
				fill="none"
				xmlns="http://www.w3.org/2000/svg"
				className="absolute top-1/2 left-[-6px] -translate-y-1/2"
				aria-hidden="true"
			>
				<path d="M6 0L0 5L6 10V0Z" className="fill-popover" />
			</svg>
		)}
		{props.children}
	</TooltipPrimitive.Content>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
