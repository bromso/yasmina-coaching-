import { type WithAsChild } from "@repo/ui/components/animate-ui/primitives/animate/slot";
import { type UseIsInViewOptions } from "@repo/ui/hooks/use-is-in-view";
import { type HTMLMotionProps } from "motion/react";
import * as React from "react";
type BlurProps = WithAsChild<{
    children?: React.ReactNode;
    delay?: number;
    initialBlur?: number;
    blur?: number;
    ref?: React.Ref<HTMLElement>;
} & UseIsInViewOptions & HTMLMotionProps<"div">>;
declare function Blur({ ref, transition, delay, inView, inViewMargin, inViewOnce, initialBlur, blur, asChild, ...props }: BlurProps): React.JSX.Element;
type BlurListProps = Omit<BlurProps, "children"> & {
    children: React.ReactElement | React.ReactElement[];
    holdDelay?: number;
};
declare function Blurs({ children, delay, holdDelay, ...props }: BlurListProps): React.JSX.Element;
export { Blur, type BlurListProps, type BlurProps, Blurs };
