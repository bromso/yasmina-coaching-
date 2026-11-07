import React, { type ComponentPropsWithoutRef } from "react";
interface RippleProps extends ComponentPropsWithoutRef<"div"> {
    mainCircleSize?: number;
    mainCircleOpacity?: number;
    numCircles?: number;
}
export declare const Ripple: React.NamedExoticComponent<RippleProps>;
export {};
