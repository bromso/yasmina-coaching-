import { type PopoverBackdropProps as PopoverBackdropPrimitiveProps, type PopoverButtonProps as PopoverButtonPrimitiveProps, type PopoverGroupProps as PopoverGroupPrimitiveProps, type PopoverPanelProps as PopoverPanelPrimitiveProps, type PopoverProps as PopoverPrimitiveProps } from "@headlessui/react";
import { type HTMLMotionProps, type Transition } from "motion/react";
import type * as React from "react";
type PopoverProps<TTag extends React.ElementType = "div"> = PopoverPrimitiveProps<TTag> & {
    as?: TTag;
};
declare function Popover<TTag extends React.ElementType = "div">({ children, ...props }: PopoverProps<TTag>): React.JSX.Element;
type PopoverButtonProps<TTag extends React.ElementType = "button"> = PopoverButtonPrimitiveProps<TTag> & {
    as?: TTag;
};
declare function PopoverButton<TTag extends React.ElementType = "button">(props: PopoverButtonProps<TTag>): React.JSX.Element;
type PopoverBackdropProps<TTag extends React.ElementType = "div"> = PopoverBackdropPrimitiveProps<TTag> & {
    as?: TTag;
};
declare function PopoverBackdrop<TTag extends React.ElementType = "div">(props: PopoverBackdropProps<TTag>): React.JSX.Element;
type PopoverGroupProps<TTag extends React.ElementType = "div"> = PopoverGroupPrimitiveProps<TTag> & {
    as?: TTag;
};
declare function PopoverGroup<TTag extends React.ElementType = "div">(props: PopoverGroupProps<TTag>): React.JSX.Element;
type PopoverPanelProps<TTag extends React.ElementType = "div"> = Omit<PopoverPanelPrimitiveProps<TTag>, "transition"> & Omit<HTMLMotionProps<"div">, "children"> & {
    transition?: Transition;
    as?: TTag;
};
declare function PopoverPanel<TTag extends React.ElementType = "div">(props: PopoverPanelProps<TTag>): React.JSX.Element;
export { Popover, PopoverBackdrop, type PopoverBackdropProps, PopoverButton, type PopoverButtonProps, PopoverGroup, type PopoverGroupProps, PopoverPanel, type PopoverPanelProps, type PopoverProps, };
