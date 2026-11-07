import { type WithAsChild } from "@repo/ui/components/animate-ui/primitives/animate/slot";
import { type HTMLMotionProps } from "motion/react";
type ButtonProps = WithAsChild<HTMLMotionProps<"button"> & {
    hoverScale?: number;
    tapScale?: number;
}>;
declare function Button({ hoverScale, tapScale, asChild, ...props }: ButtonProps): import("react").JSX.Element;
export { Button, type ButtonProps };
