import { type HTMLMotionProps } from "motion/react";
import * as React from "react";
type AnyProps = Record<string, unknown>;
type DOMMotionProps<T extends HTMLElement = HTMLElement> = Omit<HTMLMotionProps<keyof HTMLElementTagNameMap>, "ref"> & {
    ref?: React.Ref<T>;
};
type WithAsChild<Base extends object> = (Base & {
    asChild: true;
    children: React.ReactElement;
}) | (Base & {
    asChild?: false | undefined;
});
type SlotProps<T extends HTMLElement = HTMLElement> = {
    children?: any;
} & DOMMotionProps<T>;
declare function Slot<T extends HTMLElement = HTMLElement>({ children, ref, ...props }: SlotProps<T>): React.JSX.Element | null;
export { type AnyProps, type DOMMotionProps, Slot, type SlotProps, type WithAsChild };
