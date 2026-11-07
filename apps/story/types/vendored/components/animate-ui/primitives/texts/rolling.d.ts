import { type UseIsInViewOptions } from "@repo/ui/hooks/use-is-in-view";
import { type Transition } from "motion/react";
import * as React from "react";
type RollingTextProps = Omit<React.ComponentProps<"span">, "children"> & {
    text: string;
    transition?: Transition;
    delay?: number;
} & UseIsInViewOptions;
declare function RollingText({ ref, text, inView, inViewMargin, inViewOnce, transition, delay, ...props }: RollingTextProps): React.JSX.Element;
export { RollingText, type RollingTextProps };
