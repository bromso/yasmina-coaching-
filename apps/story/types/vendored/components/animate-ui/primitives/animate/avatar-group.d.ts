import { type TooltipArrowProps, type TooltipContentProps, type TooltipProps, type TooltipProviderProps } from "@repo/ui/components/animate-ui/primitives/animate/tooltip";
import { type Transition } from "motion/react";
import * as React from "react";
type AvatarGroupProps = Omit<React.ComponentProps<"div">, "translate"> & {
    children: React.ReactElement[];
    invertOverlap?: boolean;
    translate?: string | number;
    transition?: Transition;
    tooltipTransition?: Transition;
} & Omit<TooltipProviderProps, "children"> & Omit<TooltipProps, "children">;
declare function AvatarGroup({ ref, children, id, transition, invertOverlap, translate, openDelay, closeDelay, side, sideOffset, align, alignOffset, tooltipTransition, style, ...props }: AvatarGroupProps): React.JSX.Element;
type AvatarGroupTooltipProps = TooltipContentProps;
declare function AvatarGroupTooltip(props: AvatarGroupTooltipProps): React.JSX.Element;
type AvatarGroupTooltipArrowProps = TooltipArrowProps;
declare function AvatarGroupTooltipArrow(props: AvatarGroupTooltipArrowProps): React.JSX.Element;
export { AvatarGroup, type AvatarGroupProps, AvatarGroupTooltip, AvatarGroupTooltipArrow, type AvatarGroupTooltipArrowProps, type AvatarGroupTooltipProps, };
