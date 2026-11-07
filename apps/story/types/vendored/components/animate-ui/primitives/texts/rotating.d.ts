import { type UseIsInViewOptions } from "@repo/ui/hooks/use-is-in-view";
import { type HTMLMotionProps } from "motion/react";
import * as React from "react";
type RotatingTextContextType = {
    currentText: string;
    y: number;
    isInView: boolean;
};
declare const useRotatingText: () => RotatingTextContextType;
type RotatingTextContainerProps = React.ComponentProps<"div"> & {
    text: string | string[];
    duration?: number;
    y?: number;
    delay?: number;
} & UseIsInViewOptions;
declare function RotatingTextContainer({ ref, text, y, duration, delay, style, inView, inViewMargin, inViewOnce, ...props }: RotatingTextContainerProps): React.JSX.Element;
type RotatingTextProps = Omit<HTMLMotionProps<"div">, "children">;
declare function RotatingText({ transition, ...props }: RotatingTextProps): React.JSX.Element;
export { RotatingText, RotatingTextContainer, type RotatingTextContainerProps, type RotatingTextContextType, type RotatingTextProps, useRotatingText, };
