import { type TooltipContentProps as TooltipContentPrimitiveProps, type TooltipProps as TooltipPrimitiveProps, type TooltipProviderProps as TooltipProviderPrimitiveProps, type TooltipTriggerProps as TooltipTriggerPrimitiveProps } from "@repo/ui/components/animate-ui/primitives/animate/tooltip";
import type * as React from "react";
type TooltipProviderProps = TooltipProviderPrimitiveProps;
declare function TooltipProvider({ openDelay, ...props }: TooltipProviderProps): React.JSX.Element;
type TooltipProps = TooltipPrimitiveProps;
declare function Tooltip({ sideOffset, ...props }: TooltipProps): React.JSX.Element;
type TooltipTriggerProps = TooltipTriggerPrimitiveProps;
declare function TooltipTrigger({ ...props }: TooltipTriggerProps): React.JSX.Element;
type TooltipContentProps = Omit<TooltipContentPrimitiveProps, "asChild"> & {
    children: React.ReactNode;
    layout?: boolean | "position" | "size" | "preserve-aspect";
};
declare function TooltipContent({ className, children, layout, ...props }: TooltipContentProps): React.JSX.Element;
export { Tooltip, TooltipContent, type TooltipContentProps, type TooltipProps, TooltipProvider, type TooltipProviderProps, TooltipTrigger, type TooltipTriggerProps, };
