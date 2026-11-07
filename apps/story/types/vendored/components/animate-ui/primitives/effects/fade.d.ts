import { type WithAsChild } from "@repo/ui/components/animate-ui/primitives/animate/slot";
import { type UseIsInViewOptions } from "@repo/ui/hooks/use-is-in-view";
import { type HTMLMotionProps } from "motion/react";
import * as React from "react";
type FadeProps = WithAsChild<{
    children?: React.ReactNode;
    delay?: number;
    initialOpacity?: number;
    opacity?: number;
    ref?: React.Ref<HTMLElement>;
} & UseIsInViewOptions & HTMLMotionProps<"div">>;
declare function Fade({ ref, transition, delay, inView, inViewMargin, inViewOnce, initialOpacity, opacity, asChild, ...props }: FadeProps): React.JSX.Element;
type FadeListProps = Omit<FadeProps, "children"> & {
    children: React.ReactElement | React.ReactElement[];
    holdDelay?: number;
};
declare function Fades({ children, delay, holdDelay, ...props }: FadeListProps): React.JSX.Element;
export { Fade, type FadeListProps, type FadeProps, Fades };
