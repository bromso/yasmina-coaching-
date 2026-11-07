import { type WithAsChild } from "@repo/ui/components/animate-ui/primitives/animate/slot";
import { type HTMLMotionProps, type SpringOptions } from "motion/react";
import * as React from "react";
type MagneticProps = WithAsChild<{
    children?: React.ReactNode;
    strength?: number;
    range?: number;
    springOptions?: SpringOptions;
    onlyOnHover?: boolean;
    disableOnTouch?: boolean;
    ref?: React.Ref<HTMLElement>;
} & HTMLMotionProps<"div">>;
declare function Magnetic({ ref, strength, range, springOptions, onlyOnHover, disableOnTouch, style, onMouseEnter, onMouseLeave, onMouseMove, asChild, ...props }: MagneticProps): React.JSX.Element;
export { Magnetic, type MagneticProps };
