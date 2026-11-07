import { type WithAsChild } from "@repo/ui/components/animate-ui/primitives/animate/slot";
import { type UseIsInViewOptions } from "@repo/ui/hooks/use-is-in-view";
import { type HTMLMotionProps } from "motion/react";
import * as React from "react";
type SlideDirection = "up" | "down" | "left" | "right";
type SlideProps = WithAsChild<{
    children?: React.ReactNode;
    delay?: number;
    direction?: SlideDirection;
    offset?: number;
    ref?: React.Ref<HTMLElement>;
} & UseIsInViewOptions & HTMLMotionProps<"div">>;
declare function Slide({ ref, transition, delay, inView, inViewMargin, inViewOnce, direction, offset, asChild, ...props }: SlideProps): React.JSX.Element;
type SlideListProps = Omit<SlideProps, "children"> & {
    children: React.ReactElement | React.ReactElement[];
    holdDelay?: number;
};
declare function Slides({ children, delay, holdDelay, ...props }: SlideListProps): React.JSX.Element;
export { Slide, type SlideDirection, type SlideListProps, type SlideProps, Slides };
