import { type TooltipContentProps as TooltipContentPrimitiveProps, type TooltipProps as TooltipPrimitiveProps, type TooltipTriggerProps as TooltipTriggerPrimitiveProps } from "@repo/ui/components/animate-ui/primitives/radix/tooltip";
type TooltipProps = TooltipPrimitiveProps & {
    delayDuration?: TooltipPrimitiveProps["delayDuration"];
};
declare function Tooltip({ delayDuration, ...props }: TooltipProps): import("react").JSX.Element;
type TooltipTriggerProps = TooltipTriggerPrimitiveProps;
declare function TooltipTrigger({ ...props }: TooltipTriggerProps): import("react").JSX.Element;
type TooltipContentProps = TooltipContentPrimitiveProps;
declare function TooltipContent({ className, sideOffset, children, ...props }: TooltipContentProps): import("react").JSX.Element;
export { Tooltip, TooltipContent, type TooltipContentProps, type TooltipProps, TooltipTrigger, type TooltipTriggerProps, };
