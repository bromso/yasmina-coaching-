import { type HTMLMotionProps } from "motion/react";
import { Accordion as AccordionPrimitive } from "radix-ui";
import * as React from "react";
type AccordionContextType = {
    value: string | string[] | undefined;
    setValue: (value: string | string[] | undefined) => void;
};
type AccordionItemContextType = {
    value: string;
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
};
declare const useAccordion: () => AccordionContextType;
declare const useAccordionItem: () => AccordionItemContextType;
type AccordionProps = React.ComponentProps<typeof AccordionPrimitive.Root>;
declare function Accordion(props: AccordionProps): React.JSX.Element;
type AccordionItemProps = React.ComponentProps<typeof AccordionPrimitive.Item>;
declare function AccordionItem(props: AccordionItemProps): React.JSX.Element;
type AccordionHeaderProps = React.ComponentProps<typeof AccordionPrimitive.Header>;
declare function AccordionHeader(props: AccordionHeaderProps): React.JSX.Element;
type AccordionTriggerProps = React.ComponentProps<typeof AccordionPrimitive.Trigger>;
declare function AccordionTrigger(props: AccordionTriggerProps): React.JSX.Element;
type AccordionContentProps = Omit<React.ComponentProps<typeof AccordionPrimitive.Content>, "asChild" | "forceMount"> & HTMLMotionProps<"div"> & {
    keepRendered?: boolean;
};
declare function AccordionContent({ keepRendered, transition, ...props }: AccordionContentProps): React.JSX.Element;
export { Accordion, AccordionContent, type AccordionContentProps, type AccordionContextType, AccordionHeader, type AccordionHeaderProps, AccordionItem, type AccordionItemContextType, type AccordionItemProps, type AccordionProps, AccordionTrigger, type AccordionTriggerProps, useAccordion, useAccordionItem, };
