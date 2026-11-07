import * as React from "react";
type ShineProps = React.ComponentProps<"div"> & {
    color?: string;
    opacity?: number;
    delay?: number;
    duration?: number;
    loop?: boolean;
    loopDelay?: number;
    deg?: number;
    enable?: boolean;
    enableOnHover?: boolean;
    enableOnTap?: boolean;
    asChild?: boolean;
    children?: React.ReactNode;
};
declare const Shine: ({ color, opacity, delay, duration, loop, loopDelay, deg, enable, enableOnHover, enableOnTap, asChild, style, children, onMouseEnter, onMouseLeave, onPointerDown, ...props }: ShineProps) => React.JSX.Element | null;
export { Shine, type ShineProps };
