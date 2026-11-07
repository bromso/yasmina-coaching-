import { type WithAsChild } from "@repo/ui/components/animate-ui/primitives/animate/slot";
import { type HTMLMotionProps, type LegacyAnimationControls, type TargetAndTransition, type Transition } from "motion/react";
import type * as React from "react";
type AutoHeightProps = WithAsChild<{
    children: React.ReactNode;
    deps?: React.DependencyList;
    animate?: TargetAndTransition | LegacyAnimationControls;
    transition?: Transition;
} & Omit<HTMLMotionProps<"div">, "animate">>;
declare function AutoHeight({ children, deps, transition, style, animate, asChild, ...props }: AutoHeightProps): React.JSX.Element;
export { AutoHeight, type AutoHeightProps };
