import type { MotionValue } from "motion/react";
/**
 * Returns true once a mount-progress MotionValue reaches 1.
 * Use to swap animated MotionValue-driven props for static values after
 * enter completes — drops per-frame subscriptions during pan/hover.
 */
export declare function useEnterComplete(mountProgress: MotionValue<number>): boolean;
