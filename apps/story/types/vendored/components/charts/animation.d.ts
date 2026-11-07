import type { Transition } from "motion/react";
/** Default clip-reveal easing for cartesian charts. */
export declare const DEFAULT_ANIMATION_EASING = "cubic-bezier(0.85, 0, 0.15, 1)";
export declare const DEFAULT_ANIMATION_DURATION_MS = 1100;
/** Default enter transition — matches the original line chart reveal. */
export declare const DEFAULT_CHART_ENTER_TRANSITION: Transition;
/**
 * Clip-path width reveal must use tween — spring does not reliably animate SVG width.
 */
export declare function clipRevealTransition(enterTransition?: Transition): Transition;
