import { type DisclosureButtonProps as DisclosureButtonPrimitiveProps, type DisclosurePanelProps as DisclosurePanelPrimitiveProps, type DisclosureProps as DisclosurePrimitiveProps } from "@repo/ui/components/animate-ui/primitives/headless/disclosure";
import type { motion } from "motion/react";
import type * as React from "react";
type AccordionProps<TTag extends React.ElementType = "div"> = React.ComponentProps<TTag> & {
    children: React.ReactNode;
    as?: TTag;
};
declare function Accordion<TTag extends React.ElementType = "div">({ as: Component, ...props }: AccordionProps<TTag>): React.JSX.Element;
type AccordionItemProps<TTag extends React.ElementType = "div"> = DisclosurePrimitiveProps<TTag>;
declare function AccordionItem<TTag extends React.ElementType = "div">({ className, children, ...props }: AccordionItemProps<TTag>): React.JSX.Element;
type AccordionButtonProps = DisclosureButtonPrimitiveProps & {
    showArrow?: boolean;
};
declare function AccordionButton({ className, children, showArrow, ...props }: AccordionButtonProps): React.JSX.Element;
type AccordionPanelProps<TTag extends React.ElementType = typeof motion.div> = DisclosurePanelPrimitiveProps<TTag>;
declare function AccordionPanel<TTag extends React.ElementType = typeof motion.div>({ className, children, ...props }: AccordionPanelProps<TTag>): React.JSX.Element;
export { Accordion, AccordionButton, type AccordionButtonProps, AccordionItem, type AccordionItemProps, AccordionPanel, type AccordionPanelProps, type AccordionProps, };
