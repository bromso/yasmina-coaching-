import { type WithAsChild } from "@repo/ui/components/animate-ui/primitives/animate/slot";
import { type HTMLMotionProps } from "motion/react";
import * as React from "react";
type RippleButtonProps = WithAsChild<HTMLMotionProps<"button"> & {
    hoverScale?: number;
    tapScale?: number;
}>;
declare function RippleButton({ ref, onClick, hoverScale, tapScale, asChild, style, ...props }: RippleButtonProps): React.JSX.Element;
type RippleButtonRipplesProps = WithAsChild<HTMLMotionProps<"span"> & {
    color?: string;
    scale?: number;
}>;
declare function RippleButtonRipples({ color, scale, transition, asChild, style, ...props }: RippleButtonRipplesProps): React.JSX.Element[];
export { RippleButton, type RippleButtonProps, RippleButtonRipples, type RippleButtonRipplesProps };
