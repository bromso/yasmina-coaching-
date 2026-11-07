import { type TooltipPopupProps as TooltipPopupPrimitiveProps, type TooltipPositionerProps as TooltipPositionerPrimitiveProps, type TooltipProps as TooltipPrimitiveProps, type TooltipProviderProps as TooltipProviderPrimitiveProps, type TooltipTriggerProps as TooltipTriggerPrimitiveProps } from "@repo/ui/components/animate-ui/primitives/base/tooltip";
type TooltipProviderProps = TooltipProviderPrimitiveProps;
type TooltipProps = TooltipPrimitiveProps & {
    delay?: TooltipProviderProps["delay"];
};
declare function Tooltip({ delay, ...props }: TooltipProps): import("react").JSX.Element;
type TooltipTriggerProps = TooltipTriggerPrimitiveProps;
declare function TooltipTrigger({ ...props }: TooltipTriggerProps): import("react").JSX.Element;
type TooltipPanelProps = TooltipPositionerPrimitiveProps & TooltipPopupPrimitiveProps;
declare function TooltipPanel({ className, sideOffset, children, style, ...props }: TooltipPanelProps): import("react").JSX.Element;
export { Tooltip, TooltipPanel, type TooltipPanelProps, type TooltipProps, TooltipTrigger, type TooltipTriggerProps, };
