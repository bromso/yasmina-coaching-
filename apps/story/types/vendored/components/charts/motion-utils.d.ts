import type { Transition } from "motion/react";
export declare function transitionWithDelay(transition: Transition | undefined, delaySeconds: number, fallback?: Transition): Transition;
export interface SpringOptions {
    stiffness: number;
    damping: number;
    mass?: number;
}
export declare function springOptionsFromTransition(transition?: Transition, fallback?: SpringOptions): SpringOptions;
