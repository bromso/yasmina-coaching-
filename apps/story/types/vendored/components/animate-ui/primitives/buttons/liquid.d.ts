import { type WithAsChild } from "@repo/ui/components/animate-ui/primitives/animate/slot";
import { type HTMLMotionProps } from "motion/react";
import type * as React from "react";
type LiquidButtonProps = WithAsChild<HTMLMotionProps<"button"> & {
    delay?: string;
    fillHeight?: string;
    hoverScale?: number;
    tapScale?: number;
}>;
declare function LiquidButton({ delay, fillHeight, hoverScale, tapScale, asChild, ...props }: LiquidButtonProps): React.JSX.Element;
export { LiquidButton, type LiquidButtonProps };
