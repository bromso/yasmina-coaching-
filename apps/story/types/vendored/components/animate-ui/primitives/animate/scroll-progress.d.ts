import { type WithAsChild } from "@repo/ui/components/animate-ui/primitives/animate/slot";
import { type HTMLMotionProps, type MotionValue, type SpringOptions } from "motion/react";
import * as React from "react";
type ScrollProgressDirection = "horizontal" | "vertical";
type ScrollProgressContextType = {
    containerRef: React.RefObject<HTMLDivElement | null>;
    progress: MotionValue<number>;
    scale: MotionValue<number>;
    direction: ScrollProgressDirection;
    global: boolean;
};
declare const useScrollProgress: () => ScrollProgressContextType;
type ScrollProgressProviderProps = {
    children: React.ReactNode;
    global?: boolean;
    transition?: SpringOptions;
    direction?: ScrollProgressDirection;
};
declare function ScrollProgressProvider({ global, transition, direction, ...props }: ScrollProgressProviderProps): React.JSX.Element;
type ScrollProgressMode = "width" | "height" | "scaleY" | "scaleX";
type ScrollProgressProps = WithAsChild<HTMLMotionProps<"div"> & {
    mode?: ScrollProgressMode;
}>;
declare function ScrollProgress({ style, mode, asChild, ...props }: ScrollProgressProps): React.JSX.Element;
type ScrollProgressContainerProps = WithAsChild<HTMLMotionProps<"div">>;
declare function ScrollProgressContainer({ ref, asChild, ...props }: ScrollProgressContainerProps): React.JSX.Element;
export { ScrollProgress, ScrollProgressContainer, type ScrollProgressContainerProps, type ScrollProgressContextType, type ScrollProgressDirection, type ScrollProgressMode, type ScrollProgressProps, ScrollProgressProvider, type ScrollProgressProviderProps, useScrollProgress, };
