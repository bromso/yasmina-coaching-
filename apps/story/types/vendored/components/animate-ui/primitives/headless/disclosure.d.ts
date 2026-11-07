import { type DisclosureButtonProps as DisclosureButtonPrimitiveProps, type DisclosurePanelProps as DisclosurePanelPrimitiveProps, type DisclosureProps as DisclosurePrimitiveProps } from "@headlessui/react";
import { type HTMLMotionProps, motion } from "motion/react";
import type * as React from "react";
type DisclosureContextType = {
    isOpen: boolean;
};
declare const useDisclosure: () => DisclosureContextType;
type DisclosureProps<TTag extends React.ElementType = "div"> = DisclosurePrimitiveProps<TTag> & {
    as?: TTag;
    className?: string;
};
declare function Disclosure<TTag extends React.ElementType = "div">({ children, ...props }: DisclosureProps<TTag>): React.JSX.Element;
type DisclosureButtonProps<TTag extends React.ElementType = "button"> = DisclosureButtonPrimitiveProps<TTag> & {
    as?: TTag;
};
declare function DisclosureButton<TTag extends React.ElementType = "button">(props: DisclosureButtonProps<TTag>): React.JSX.Element;
type DisclosurePanelProps<TTag extends React.ElementType = typeof motion.div> = Pick<DisclosurePanelPrimitiveProps<TTag>, "static" | "unmount" | "children"> & Omit<HTMLMotionProps<"div">, "children"> & {
    as?: TTag;
    keepRendered?: boolean;
};
declare function DisclosurePanel<TTag extends React.ElementType = typeof motion.div>(props: DisclosurePanelProps<TTag>): React.JSX.Element;
export { Disclosure, DisclosureButton, type DisclosureButtonProps, DisclosurePanel, type DisclosurePanelProps, type DisclosureProps, useDisclosure, };
