import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion";
import { type HTMLMotionProps } from "motion/react";
import * as React from "react";
type AccordionItemContextType = {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
};
declare const useAccordionItem: () => AccordionItemContextType;
type AccordionProps = AccordionPrimitive.Root.Props<string>;
declare function Accordion(props: AccordionProps): React.JSX.Element;
type AccordionItemProps = Omit<React.ComponentProps<typeof AccordionPrimitive.Item>, "value"> & {
    value: string;
};
declare function AccordionItem(props: AccordionItemProps): React.JSX.Element;
type AccordionHeaderProps = React.ComponentProps<typeof AccordionPrimitive.Header>;
declare function AccordionHeader(props: AccordionHeaderProps): React.JSX.Element;
type AccordionTriggerProps = React.ComponentProps<typeof AccordionPrimitive.Trigger>;
declare function AccordionTrigger(props: AccordionTriggerProps): React.JSX.Element;
type AccordionPanelProps = Omit<React.ComponentProps<typeof AccordionPrimitive.Panel>, "keepMounted" | "render"> & HTMLMotionProps<"div"> & {
    keepRendered?: boolean;
};
declare function AccordionPanel({ transition, hiddenUntilFound, keepRendered, ...props }: AccordionPanelProps): React.JSX.Element;
export { Accordion, AccordionHeader, type AccordionHeaderProps, AccordionItem, type AccordionItemContextType, type AccordionItemProps, AccordionPanel, type AccordionPanelProps, type AccordionProps, AccordionTrigger, type AccordionTriggerProps, useAccordionItem, };
