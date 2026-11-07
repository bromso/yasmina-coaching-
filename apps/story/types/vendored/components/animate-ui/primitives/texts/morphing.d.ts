import { type UseIsInViewOptions } from "@repo/ui/hooks/use-is-in-view";
import { type HTMLMotionProps } from "motion/react";
import * as React from "react";
type MorphingTextProps = Omit<HTMLMotionProps<"span">, "children"> & {
    delay?: number;
    loop?: boolean;
    holdDelay?: number;
    text: string | string[];
} & UseIsInViewOptions;
declare function MorphingText({ ref, text, initial, animate, exit, variants, transition, delay, inView, inViewMargin, inViewOnce, loop, holdDelay, ...props }: MorphingTextProps): React.JSX.Element;
export { MorphingText, type MorphingTextProps };
