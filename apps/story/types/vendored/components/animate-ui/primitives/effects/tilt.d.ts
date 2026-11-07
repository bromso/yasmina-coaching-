import { type WithAsChild } from "@repo/ui/components/animate-ui/primitives/animate/slot";
import { type HTMLMotionProps, type SpringOptions } from "motion/react";
import * as React from "react";
type TiltProps = WithAsChild<HTMLMotionProps<"div"> & {
    maxTilt?: number;
    perspective?: number;
    transition?: SpringOptions;
}>;
declare function Tilt({ maxTilt, perspective, style, transition, onMouseMove, onMouseLeave, asChild, ...props }: TiltProps): React.JSX.Element;
type TiltContentProps = WithAsChild<HTMLMotionProps<"div">>;
declare function TiltContent({ children, style, transition, asChild, ...props }: TiltContentProps): React.JSX.Element;
export { Tilt, TiltContent, type TiltContentProps, type TiltProps };
