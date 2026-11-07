import { type HoverCardArrowProps as HoverCardArrowPropsPrimitive, type HoverCardContentProps as HoverCardContentPropsPrimitive, type HoverCardPortalProps as HoverCardPortalPropsPrimitive, type HoverCardProps as HoverCardPropsPrimitive, type HoverCardTriggerProps as HoverCardTriggerPropsPrimitive } from "@repo/ui/components/animate-ui/primitives/radix/hover-card";
import * as React from "react";
type PreviewLinkCardContextType = {
    href: string;
    src?: string;
    width?: number;
    height?: number;
};
declare const usePreviewLinkCard: () => PreviewLinkCardContextType;
type PreviewLinkCardProps = HoverCardPropsPrimitive & {
    href: string;
    src?: string;
    width?: number;
    height?: number;
    deviceScaleFactor?: number;
    colorScheme?: "light" | "dark";
};
declare function PreviewLinkCard({ href, src, width, height, deviceScaleFactor, colorScheme, ...props }: PreviewLinkCardProps): React.JSX.Element;
type PreviewLinkCardTriggerProps = HoverCardTriggerPropsPrimitive & React.ComponentProps<"a">;
declare function PreviewLinkCardTrigger({ asChild, children, href: hrefProp, ...props }: PreviewLinkCardTriggerProps): React.JSX.Element;
type PreviewLinkCardPortalProps = HoverCardPortalPropsPrimitive;
declare function PreviewLinkCardPortal(props: PreviewLinkCardPortalProps): React.JSX.Element;
type PreviewLinkCardContentProps = HoverCardContentPropsPrimitive & React.ComponentProps<"a">;
declare function PreviewLinkCardContent({ side, sideOffset, align, alignOffset, avoidCollisions, collisionBoundary, collisionPadding, arrowPadding, sticky, hideWhenDetached, transition, asChild, children, href: hrefProp, style, ...props }: PreviewLinkCardContentProps): React.JSX.Element;
type PreviewLinkCardImageProps = Omit<React.ComponentProps<"img">, "src" | "width" | "height">;
declare function PreviewLinkCardImage({ alt, ...props }: PreviewLinkCardImageProps): React.JSX.Element;
type PreviewLinkCardArrowProps = HoverCardArrowPropsPrimitive;
declare function PreviewLinkCardArrow(props: PreviewLinkCardArrowProps): React.JSX.Element;
export { PreviewLinkCard, PreviewLinkCardArrow, type PreviewLinkCardArrowProps, PreviewLinkCardContent, type PreviewLinkCardContentProps, type PreviewLinkCardContextType, PreviewLinkCardImage, type PreviewLinkCardImageProps, PreviewLinkCardPortal, type PreviewLinkCardPortalProps, type PreviewLinkCardProps, PreviewLinkCardTrigger, type PreviewLinkCardTriggerProps, usePreviewLinkCard, };
