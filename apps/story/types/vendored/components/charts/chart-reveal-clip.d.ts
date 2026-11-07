import type { Transition } from "motion/react";
export type ChartRevealClipMode = "reveal" | "conceal";
export interface ChartRevealClipProps {
    clipPathId: string;
    height: number;
    targetWidth: number;
    enterTransition?: Transition;
    /** Bumps when motion settings change to replay the reveal. */
    revealEpoch: number;
    /** Extra inset around the clip rect so edge glyphs are not cut off. */
    padding?: number;
    /** When false, clip stays at full width (no grow animation). */
    animating?: boolean;
    /** Reveal grows 0 → full; conceal shrinks full → 0 (ready → loading). */
    mode?: ChartRevealClipMode;
    /** Called when a conceal animation finishes. */
    onComplete?: () => void;
}
/**
 * Left-to-right clip reveal for cartesian series.
 * Grows clip rect width from 0 → full (true LTR; scaleX is avoided — it reveals from center).
 */
export declare function ChartRevealClip({ clipPathId, height, targetWidth, enterTransition, revealEpoch, padding, animating, mode, onComplete, }: ChartRevealClipProps): import("react").JSX.Element;
