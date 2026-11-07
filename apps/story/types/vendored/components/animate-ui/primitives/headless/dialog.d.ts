import { type CloseButtonProps, type DialogBackdropProps as DialogBackdropPrimitiveProps, Description as DialogDescriptionPrimitive, type DialogPanelProps as DialogPanelPrimitiveProps, type DialogProps as DialogPrimitiveProps, type DialogTitleProps as DialogTitlePrimitiveProps } from "@headlessui/react";
import { type HTMLMotionProps, motion, type Transition } from "motion/react";
import type * as React from "react";
type DialogProps<TTag extends React.ElementType = "div"> = Omit<DialogPrimitiveProps<TTag>, "static"> & {
    className?: string;
    as?: TTag;
};
declare function Dialog<TTag extends React.ElementType = "div">({ className, ...props }: DialogProps<TTag>): React.JSX.Element;
type DialogBackdropProps<TTag extends React.ElementType = typeof motion.div> = Omit<DialogBackdropPrimitiveProps<TTag>, "transition"> & HTMLMotionProps<"div"> & {
    as?: TTag;
};
declare function DialogBackdrop<TTag extends React.ElementType = typeof motion.div>(props: DialogBackdropProps<TTag>): React.JSX.Element;
type DialogFlipDirection = "top" | "bottom" | "left" | "right";
type DialogPanelProps<TTag extends React.ElementType = typeof motion.div> = Omit<DialogPanelPrimitiveProps<TTag>, "transition"> & Omit<HTMLMotionProps<"div">, "children"> & {
    from?: DialogFlipDirection;
    transition?: Transition;
    as?: TTag;
};
declare function DialogPanel<TTag extends React.ElementType = typeof motion.div>(props: DialogPanelProps<TTag>): React.JSX.Element;
type DialogCloseProps<TTag extends React.ElementType = "div"> = CloseButtonProps<TTag> & {
    as?: TTag;
};
declare function DialogClose<TTag extends React.ElementType = "button">(props: DialogCloseProps<TTag>): React.JSX.Element;
type DialogHeaderProps<TTag extends React.ElementType = "div"> = React.ComponentProps<TTag> & {
    as?: TTag;
};
declare function DialogHeader<TTag extends React.ElementType = "div">({ as: Component, ...props }: DialogHeaderProps<TTag>): React.JSX.Element;
type DialogFooterProps<TTag extends React.ElementType = "div"> = React.ComponentProps<TTag> & {
    as?: TTag;
};
declare function DialogFooter({ as: Component, ...props }: DialogFooterProps): React.JSX.Element;
type DialogTitleProps<TTag extends React.ElementType = "h2"> = DialogTitlePrimitiveProps<TTag> & {
    as?: TTag;
    className?: string;
};
declare function DialogTitle<TTag extends React.ElementType = "h2">(props: DialogTitleProps<TTag>): React.JSX.Element;
type DialogDescriptionProps<TTag extends React.ElementType = "div"> = React.ComponentProps<typeof DialogDescriptionPrimitive<TTag>> & {
    as?: TTag;
    className?: string;
};
declare function DialogDescription<TTag extends React.ElementType = "div">(props: DialogDescriptionProps<TTag>): React.JSX.Element;
export { Dialog, DialogBackdrop, type DialogBackdropProps, DialogClose, type DialogCloseProps, DialogDescription, type DialogDescriptionProps, type DialogFlipDirection, DialogFooter, type DialogFooterProps, DialogHeader, type DialogHeaderProps, DialogPanel, type DialogPanelProps, type DialogProps, DialogTitle, type DialogTitleProps, };
