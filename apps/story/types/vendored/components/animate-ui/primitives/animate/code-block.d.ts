import { type UseIsInViewOptions } from "@repo/ui/hooks/use-is-in-view";
import * as React from "react";
type CodeBlockProps = React.ComponentProps<"div"> & {
    code: string;
    lang: string;
    theme?: "light" | "dark";
    themes?: {
        light: string;
        dark: string;
    };
    writing?: boolean;
    duration?: number;
    delay?: number;
    onDone?: () => void;
    onWrite?: (info: {
        index: number;
        length: number;
        done: boolean;
    }) => void;
    scrollContainerRef?: React.RefObject<HTMLElement | null>;
} & UseIsInViewOptions;
declare function CodeBlock({ ref, code, lang, theme, themes, writing, duration, delay, onDone, onWrite, scrollContainerRef, inView, inViewOnce, inViewMargin, ...props }: CodeBlockProps): React.JSX.Element;
export { CodeBlock, type CodeBlockProps };
