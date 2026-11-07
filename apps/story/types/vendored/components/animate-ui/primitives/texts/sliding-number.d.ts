import { type UseIsInViewOptions } from "@repo/ui/hooks/use-is-in-view";
import { type HTMLMotionProps, type SpringOptions } from "motion/react";
import * as React from "react";
type SlidingNumberProps = Omit<HTMLMotionProps<"span">, "children"> & {
    number: number;
    fromNumber?: number;
    onNumberChange?: (number: number) => void;
    padStart?: boolean;
    decimalSeparator?: string;
    decimalPlaces?: number;
    thousandSeparator?: string;
    transition?: SpringOptions;
    delay?: number;
    initiallyStable?: boolean;
} & UseIsInViewOptions;
declare function SlidingNumber({ ref, number, fromNumber, onNumberChange, inView, inViewMargin, inViewOnce, padStart, decimalSeparator, decimalPlaces, thousandSeparator, transition, delay, initiallyStable, ...props }: SlidingNumberProps): React.JSX.Element;
export { SlidingNumber, type SlidingNumberProps };
