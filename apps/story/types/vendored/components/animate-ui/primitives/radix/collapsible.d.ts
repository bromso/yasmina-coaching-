import { type HTMLMotionProps } from "motion/react";
import { Collapsible as CollapsiblePrimitive } from "radix-ui";
import type * as React from "react";
type CollapsibleContextType = {
    isOpen: boolean;
    setIsOpen: (isOpen: boolean) => void;
};
declare const useCollapsible: () => CollapsibleContextType;
type CollapsibleProps = React.ComponentProps<typeof CollapsiblePrimitive.Root>;
declare function Collapsible(props: CollapsibleProps): React.JSX.Element;
type CollapsibleTriggerProps = React.ComponentProps<typeof CollapsiblePrimitive.Trigger>;
declare function CollapsibleTrigger(props: CollapsibleTriggerProps): React.JSX.Element;
type CollapsibleContentProps = Omit<React.ComponentProps<typeof CollapsiblePrimitive.Content>, "asChild" | "forceMount"> & HTMLMotionProps<"div"> & {
    keepRendered?: boolean;
};
declare function CollapsibleContent({ keepRendered, transition, ...props }: CollapsibleContentProps): React.JSX.Element;
export { Collapsible, CollapsibleContent, type CollapsibleContentProps, type CollapsibleContextType, type CollapsibleProps, CollapsibleTrigger, type CollapsibleTriggerProps, useCollapsible, };
