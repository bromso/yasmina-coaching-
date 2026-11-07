import { type Transition } from "motion/react";
import type * as React from "react";
type GradientTextProps = Omit<React.ComponentProps<"span">, "children"> & {
    text: string;
    gradient?: string;
    neon?: boolean;
    transition?: Transition;
};
declare function GradientText({ text, style, gradient, neon, transition, ...props }: GradientTextProps): React.JSX.Element;
export { GradientText, type GradientTextProps };
