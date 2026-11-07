import { type ComponentPropsWithoutRef } from "react";
export interface AnimatedGridPatternProps extends ComponentPropsWithoutRef<"svg"> {
    width?: number;
    height?: number;
    x?: number;
    y?: number;
    strokeDasharray?: number;
    numSquares?: number;
    maxOpacity?: number;
    duration?: number;
    repeatDelay?: number;
}
export declare function AnimatedGridPattern({ width, height, x, y, strokeDasharray, numSquares, className, maxOpacity, duration, repeatDelay, ...props }: AnimatedGridPatternProps): import("react").JSX.Element;
