import { type UseIsInViewOptions } from "@repo/ui/hooks/use-is-in-view";
import { type HTMLMotionProps, type TargetAndTransition, type Transition } from "motion/react";
import * as React from "react";
type DefaultSplittingTextProps = Omit<HTMLMotionProps<"div">, "children" | "initial" | "animate" | "transition"> & {
    initial?: TargetAndTransition;
    animate?: TargetAndTransition;
    transition?: Transition;
    stagger?: number;
    delay?: number;
    disableAnimation?: boolean;
} & UseIsInViewOptions;
type CharsOrWordsSplittingTextProps = DefaultSplittingTextProps & {
    type?: "chars" | "words";
    text: string;
};
type LinesSplittingTextProps = DefaultSplittingTextProps & {
    type?: "lines";
    text: string[];
};
type SplittingTextProps = CharsOrWordsSplittingTextProps | LinesSplittingTextProps;
declare const SplittingText: React.FC<SplittingTextProps>;
export { SplittingText, type SplittingTextProps };
