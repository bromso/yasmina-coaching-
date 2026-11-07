import { type AccordionItemProps as AccordionItemPrimitiveProps, type AccordionPanelProps as AccordionPanelPrimitiveProps, type AccordionProps as AccordionPrimitiveProps, type AccordionTriggerProps as AccordionTriggerPrimitiveProps } from "@repo/ui/components/animate-ui/primitives/base/accordion";
import type * as React from "react";
type AccordionProps = AccordionPrimitiveProps;
declare function Accordion(props: AccordionProps): React.JSX.Element;
type AccordionItemProps = AccordionItemPrimitiveProps;
declare function AccordionItem({ className, ...props }: AccordionItemProps): React.JSX.Element;
type AccordionTriggerProps = AccordionTriggerPrimitiveProps & {
    showArrow?: boolean;
};
declare function AccordionTrigger({ className, children, showArrow, ...props }: AccordionTriggerProps): React.JSX.Element;
type AccordionPanelProps = AccordionPanelPrimitiveProps & {
    children: React.ReactNode;
};
declare function AccordionPanel({ className, children, ...props }: AccordionPanelProps): React.JSX.Element;
export { Accordion, AccordionItem, type AccordionItemProps, AccordionPanel, type AccordionPanelProps, type AccordionProps, AccordionTrigger, type AccordionTriggerProps, };
