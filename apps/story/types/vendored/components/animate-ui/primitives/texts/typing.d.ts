import { type UseIsInViewOptions } from "@repo/ui/hooks/use-is-in-view";
import { type HTMLMotionProps } from "motion/react";
import * as React from "react";
type TypingTextProps = React.ComponentProps<"span"> & {
    duration?: number;
    delay?: number;
    loop?: boolean;
    holdDelay?: number;
    text: string | string[];
} & UseIsInViewOptions;
declare function TypingText({ ref, children, duration, delay, inView, inViewMargin, inViewOnce, loop, holdDelay, text, ...props }: TypingTextProps): React.JSX.Element;
type TypingTextCursorProps = Omit<HTMLMotionProps<"span">, "children">;
declare function TypingTextCursor({ style, variants, ...props }: TypingTextCursorProps): React.JSX.Element;
export { TypingText, TypingTextCursor, type TypingTextCursorProps, type TypingTextProps };
