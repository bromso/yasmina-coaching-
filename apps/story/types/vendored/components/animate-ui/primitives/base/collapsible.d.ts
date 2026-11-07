import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";
import { type HTMLMotionProps } from "motion/react";
import type * as React from "react";
type CollapsibleContextType = {
    isOpen: boolean;
    setIsOpen: CollapsibleProps["onOpenChange"];
};
declare const useCollapsible: () => CollapsibleContextType;
type CollapsibleProps = React.ComponentProps<typeof CollapsiblePrimitive.Root>;
declare function Collapsible(props: CollapsibleProps): React.JSX.Element;
type CollapsibleTriggerProps = React.ComponentProps<typeof CollapsiblePrimitive.Trigger>;
declare function CollapsibleTrigger(props: CollapsibleTriggerProps): React.JSX.Element;
type CollapsiblePanelProps = Omit<React.ComponentProps<typeof CollapsiblePrimitive.Panel>, "keepMounted" | "render"> & HTMLMotionProps<"div"> & {
    keepRendered?: boolean;
};
declare function CollapsiblePanel({ transition, hiddenUntilFound, keepRendered, ...props }: CollapsiblePanelProps): React.JSX.Element;
export { Collapsible, type CollapsibleContextType, CollapsiblePanel, type CollapsiblePanelProps, type CollapsibleProps, CollapsibleTrigger, type CollapsibleTriggerProps, useCollapsible, };
