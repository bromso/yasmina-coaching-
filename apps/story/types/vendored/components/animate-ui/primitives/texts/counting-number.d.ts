import { type UseIsInViewOptions } from "@repo/ui/hooks/use-is-in-view";
import { type SpringOptions } from "motion/react";
import * as React from "react";
type CountingNumberProps = Omit<React.ComponentProps<"span">, "children"> & {
    number: number;
    fromNumber?: number;
    padStart?: boolean;
    decimalSeparator?: string;
    decimalPlaces?: number;
    transition?: SpringOptions;
    delay?: number;
    initiallyStable?: boolean;
} & UseIsInViewOptions;
declare function CountingNumber({ ref, number, fromNumber, padStart, inView, inViewMargin, inViewOnce, decimalSeparator, transition, decimalPlaces, delay, initiallyStable, ...props }: CountingNumberProps): React.JSX.Element;
export { CountingNumber, type CountingNumberProps };
