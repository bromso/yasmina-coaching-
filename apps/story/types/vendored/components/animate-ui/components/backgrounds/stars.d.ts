import { type HTMLMotionProps, type SpringOptions, type Transition } from "motion/react";
import * as React from "react";
type StarLayerProps = HTMLMotionProps<"div"> & {
    count: number;
    size: number;
    transition: Transition;
    starColor: string;
};
declare function StarLayer({ count, size, transition, starColor, className, ...props }: StarLayerProps): React.JSX.Element;
type StarsBackgroundProps = React.ComponentProps<"div"> & {
    factor?: number;
    speed?: number;
    transition?: SpringOptions;
    starColor?: string;
    pointerEvents?: boolean;
};
declare function StarsBackground({ children, className, factor, speed, transition, starColor, pointerEvents, ...props }: StarsBackgroundProps): React.JSX.Element;
export { StarLayer, type StarLayerProps, StarsBackground, type StarsBackgroundProps };
