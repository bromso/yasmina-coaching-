import { type Transition } from "motion/react";
/** Drives 0→1 enter progress using the studio motion transition (spring or tween). */
export declare function useMountProgress(enterTransition: Transition | undefined, delaySeconds: number, replayKey: number | string): import("motion/react").MotionValue<number>;
