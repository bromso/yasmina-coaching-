import { type WithAsChild } from "@repo/ui/components/animate-ui/primitives/animate/slot";
import { type UseIsInViewOptions } from "@repo/ui/hooks/use-is-in-view";
import { type HTMLMotionProps } from "motion/react";
import * as React from "react";
type ZoomProps = WithAsChild<{
    children?: React.ReactNode;
    delay?: number;
    initialScale?: number;
    scale?: number;
    ref?: React.Ref<HTMLElement>;
} & UseIsInViewOptions & HTMLMotionProps<"div">>;
declare function Zoom({ ref, transition, delay, inView, inViewMargin, inViewOnce, initialScale, scale, asChild, ...props }: ZoomProps): React.JSX.Element;
type ZoomListProps = Omit<ZoomProps, "children"> & {
    children: React.ReactElement | React.ReactElement[];
    holdDelay?: number;
};
declare function Zooms({ children, delay, holdDelay, ...props }: ZoomListProps): React.JSX.Element;
export { Zoom, type ZoomListProps, type ZoomProps, Zooms };
