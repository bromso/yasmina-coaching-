import { type WithAsChild } from "@repo/ui/components/animate-ui/primitives/animate/slot";
import { type HTMLMotionProps, type MotionValue, type SpringOptions } from "motion/react";
import * as React from "react";
type SpringPathConfig = {
    coilCount?: number;
    amplitudeMin?: number;
    amplitudeMax?: number;
    curveRatioMin?: number;
    curveRatioMax?: number;
    bezierOffset?: number;
};
type SpringContextType = {
    dragElastic?: number;
    childRef: React.RefObject<HTMLDivElement | null>;
    springX: MotionValue<number>;
    springY: MotionValue<number>;
    x: MotionValue<number>;
    y: MotionValue<number>;
    isDragging: boolean;
    setIsDragging: (isDragging: boolean) => void;
    path: string;
};
declare const useSpring: () => SpringContextType;
type SpringProviderProps = {
    children: React.ReactNode;
    dragElastic?: number;
    pathConfig?: SpringPathConfig;
    transition?: SpringOptions;
};
declare function SpringProvider({ dragElastic, transition, pathConfig, ...props }: SpringProviderProps): React.JSX.Element;
type SpringProps = React.SVGProps<SVGSVGElement>;
declare function Spring({ style, ...props }: SpringProps): React.JSX.Element;
type SpringElementProps = WithAsChild<Omit<HTMLMotionProps<"div">, "children"> & {
    children: React.ReactElement;
}>;
declare function SpringElement({ ref, asChild, style, ...props }: SpringElementProps): React.JSX.Element;
export { Spring, type SpringContextType, SpringElement, type SpringElementProps, type SpringPathConfig, type SpringProps, SpringProvider, type SpringProviderProps, useSpring, };
