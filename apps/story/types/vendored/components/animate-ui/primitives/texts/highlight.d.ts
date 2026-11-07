import { type UseIsInViewOptions } from "@repo/ui/hooks/use-is-in-view";
import { type HTMLMotionProps } from "motion/react";
import type * as React from "react";
type HighlightTextProps = Omit<HTMLMotionProps<"span">, "children"> & {
    text: string;
    delay?: number;
} & UseIsInViewOptions;
declare function HighlightText({ ref, text, style, inView, inViewMargin, inViewOnce, transition, delay, ...props }: HighlightTextProps): React.JSX.Element;
export { HighlightText, type HighlightTextProps };
