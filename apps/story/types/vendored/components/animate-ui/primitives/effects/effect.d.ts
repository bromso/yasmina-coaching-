import { type WithAsChild } from "@repo/ui/components/animate-ui/primitives/animate/slot";
import { type UseIsInViewOptions } from "@repo/ui/hooks/use-is-in-view";
import { type HTMLMotionProps } from "motion/react";
import * as React from "react";
type SlideDirection = "up" | "down" | "left" | "right";
type Slide = {
    direction?: SlideDirection;
    offset?: number;
};
type Fade = {
    initialOpacity?: number;
    opacity?: number;
};
type Zoom = {
    initialScale?: number;
    scale?: number;
};
type Blur = {
    initialBlur?: number;
    blur?: number;
};
type EffectProps = WithAsChild<{
    children?: React.ReactNode;
    delay?: number;
    blur?: Blur | boolean;
    slide?: Slide | boolean;
    fade?: Fade | boolean;
    zoom?: Zoom | boolean;
    ref?: React.Ref<HTMLElement>;
} & UseIsInViewOptions & HTMLMotionProps<"div">>;
declare function Effect({ ref, transition, delay, inView, inViewMargin, inViewOnce, blur, slide, fade, zoom, asChild, ...props }: EffectProps): React.JSX.Element;
type EffectsProps = Omit<EffectProps, "children"> & {
    children: React.ReactElement | React.ReactElement[];
    holdDelay?: number;
};
declare function Effects({ children, delay, holdDelay, ...props }: EffectsProps): React.JSX.Element;
export { Effect, type EffectProps, Effects, type EffectsProps, type Fade, type Slide, type SlideDirection, type Zoom, };
