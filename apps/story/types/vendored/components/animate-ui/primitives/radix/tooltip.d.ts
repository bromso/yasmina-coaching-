import { type HTMLMotionProps, type MotionValue, type SpringOptions } from "motion/react";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import type * as React from "react";
type TooltipContextType = {
    isOpen: boolean;
    setIsOpen: (isOpen: boolean) => void;
    x: MotionValue<number>;
    y: MotionValue<number>;
    followCursor?: boolean | "x" | "y";
    followCursorSpringOptions?: SpringOptions;
};
declare const useTooltip: () => TooltipContextType;
type TooltipProviderProps = React.ComponentProps<typeof TooltipPrimitive.Provider>;
declare function TooltipProvider(props: TooltipProviderProps): React.JSX.Element;
type TooltipProps = React.ComponentProps<typeof TooltipPrimitive.Root> & {
    followCursor?: boolean | "x" | "y";
    followCursorSpringOptions?: SpringOptions;
};
declare function Tooltip({ followCursor, followCursorSpringOptions, ...props }: TooltipProps): React.JSX.Element;
type TooltipTriggerProps = React.ComponentProps<typeof TooltipPrimitive.Trigger>;
declare function TooltipTrigger({ onMouseMove, ...props }: TooltipTriggerProps): React.JSX.Element;
type TooltipPortalProps = Omit<React.ComponentProps<typeof TooltipPrimitive.Portal>, "forceMount">;
declare function TooltipPortal(props: TooltipPortalProps): React.JSX.Element;
type TooltipContentProps = Omit<React.ComponentProps<typeof TooltipPrimitive.Content>, "forceMount" | "asChild"> & HTMLMotionProps<"div">;
declare function TooltipContent({ onEscapeKeyDown, onPointerDownOutside, side, sideOffset, align, alignOffset, avoidCollisions, collisionBoundary, collisionPadding, arrowPadding, sticky, hideWhenDetached, style, transition, ...props }: TooltipContentProps): React.JSX.Element;
type TooltipArrowProps = React.ComponentProps<typeof TooltipPrimitive.Arrow>;
declare function TooltipArrow(props: TooltipArrowProps): React.JSX.Element;
export { Tooltip, TooltipArrow, type TooltipArrowProps, TooltipContent, type TooltipContentProps, type TooltipContextType, TooltipPortal, type TooltipPortalProps, type TooltipProps, TooltipProvider, type TooltipProviderProps, TooltipTrigger, type TooltipTriggerProps, useTooltip, };
