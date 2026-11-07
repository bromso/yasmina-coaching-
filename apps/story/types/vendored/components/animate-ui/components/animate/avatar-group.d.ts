import { type AvatarGroupProps as AvatarGroupPropsPrimitive, type AvatarGroupTooltipProps as AvatarGroupTooltipPropsPrimitive } from "@repo/ui/components/animate-ui/primitives/animate/avatar-group";
import type * as React from "react";
type AvatarGroupProps = AvatarGroupPropsPrimitive;
declare function AvatarGroup({ className, invertOverlap, ...props }: AvatarGroupProps): React.JSX.Element;
type AvatarGroupTooltipProps = Omit<AvatarGroupTooltipPropsPrimitive, "asChild"> & {
    children: React.ReactNode;
    layout?: boolean | "position" | "size" | "preserve-aspect";
};
declare function AvatarGroupTooltip({ className, children, layout, ...props }: AvatarGroupTooltipProps): React.JSX.Element;
export { AvatarGroup, type AvatarGroupProps, AvatarGroupTooltip, type AvatarGroupTooltipProps };
