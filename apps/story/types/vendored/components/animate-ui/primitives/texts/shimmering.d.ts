import { type HTMLMotionProps } from "motion/react";
import type * as React from "react";
type ShimmeringTextProps = Omit<HTMLMotionProps<"span">, "children"> & {
    text: string;
    duration?: number;
    wave?: boolean;
    color?: string;
    shimmeringColor?: string;
};
declare function ShimmeringText({ text, duration, transition, wave, color, shimmeringColor, ...props }: ShimmeringTextProps): React.JSX.Element;
export { ShimmeringText, type ShimmeringTextProps };
