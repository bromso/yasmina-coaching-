import { type AccordionContentProps as AccordionContentPrimitiveProps, type AccordionItemProps as AccordionItemPrimitiveProps, type AccordionProps as AccordionPrimitiveProps, type AccordionTriggerProps as AccordionTriggerPrimitiveProps } from "@repo/ui/components/animate-ui/primitives/radix/accordion";
type AccordionProps = AccordionPrimitiveProps;
declare function Accordion(props: AccordionProps): import("react").JSX.Element;
type AccordionItemProps = AccordionItemPrimitiveProps;
declare function AccordionItem({ className, ...props }: AccordionItemProps): import("react").JSX.Element;
type AccordionTriggerProps = AccordionTriggerPrimitiveProps & {
    showArrow?: boolean;
};
declare function AccordionTrigger({ className, children, showArrow, ...props }: AccordionTriggerProps): import("react").JSX.Element;
type AccordionContentProps = AccordionContentPrimitiveProps;
declare function AccordionContent({ className, children, ...props }: AccordionContentProps): import("react").JSX.Element;
export { Accordion, AccordionContent, type AccordionContentProps, AccordionItem, type AccordionItemProps, type AccordionProps, AccordionTrigger, type AccordionTriggerProps, };
