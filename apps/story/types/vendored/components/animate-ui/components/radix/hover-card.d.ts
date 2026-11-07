import { type HoverCardContentProps as HoverCardContentPrimitiveProps, type HoverCardProps as HoverCardPrimitiveProps, type HoverCardTriggerProps as HoverCardTriggerPrimitiveProps } from "@repo/ui/components/animate-ui/primitives/radix/hover-card";
type HoverCardProps = HoverCardPrimitiveProps;
declare function HoverCard(props: HoverCardProps): import("react").JSX.Element;
type HoverCardTriggerProps = HoverCardTriggerPrimitiveProps;
declare function HoverCardTrigger(props: HoverCardTriggerProps): import("react").JSX.Element;
type HoverCardContentProps = HoverCardContentPrimitiveProps;
declare function HoverCardContent({ className, align, sideOffset, ...props }: HoverCardContentProps): import("react").JSX.Element;
export { HoverCard, HoverCardContent, type HoverCardContentProps, type HoverCardProps, HoverCardTrigger, type HoverCardTriggerProps, };
