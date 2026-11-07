import type { Transition } from "motion/react";
import type { HeatmapColumn } from "./heatmap-context";
/** Default enter duration when no motion props are passed (ms). */
export declare const HEATMAP_DEFAULT_ENTER_DURATION_MS = 1600;
/** Default cubic-bezier for heatmap cell enter / loading transitions. */
export declare const HEATMAP_DEFAULT_ENTER_EASE: readonly [0.85, 0, 0.916, 0.282];
/** Default enter transition for {@link HeatmapChart}. */
export declare const HEATMAP_DEFAULT_ENTER_TRANSITION: Transition;
/** Chart opacity while `status="loading"`. */
export declare const HEATMAP_LOADING_CHART_OPACITY = 1;
/** Default max per-cell opacity during loading shimmer. */
export declare const HEATMAP_DEFAULT_LOADING_CELL_MAX_OPACITY = 0.85;
/** Default share of cells that participate in loading shimmer (0–1). */
export declare const HEATMAP_DEFAULT_LOADING_CELL_RANDOMNESS = 1;
/** Opacity for loading cells that do not participate in shimmer. */
export declare const HEATMAP_LOADING_BASE_CELL_OPACITY = 0.2;
/** Duration for ready → loading cell conceal before shimmer resumes (ms). */
export declare const HEATMAP_LOADING_CONCEAL_MS = 450;
/** Share of the enter window used for random fade-in delays. */
export declare const HEATMAP_ENTER_STAGGER_SPREAD = 0.6;
export declare function heatmapCellSeed(column: number, row: number): number;
export interface HeatmapLevelRange {
    min: number;
    max: number;
}
/** Min/max contribution levels present in the dataset. */
export declare function computeHeatmapLevelRange(data: HeatmapColumn[]): HeatmapLevelRange;
/** Per-cell fade duration derived from the motion enter transition. */
export declare function resolveHeatmapEnterFadeDurationSec(enterTransition: Transition | undefined, animationDurationMs: number): number;
/** Random delay so all cells finish fading in within `animationDurationMs`. */
export declare function computeHeatmapEnterFadeDelayMs({ column, row, revealEpoch, animationDurationMs, enterStaggerScale, fadeDurationSec, }: {
    column: number;
    row: number;
    revealEpoch: number;
    animationDurationMs: number;
    enterStaggerScale: number;
    fadeDurationSec: number;
}): number;
/** Whether a cell participates in loading shimmer for a given randomness (0–1). */
export declare function heatmapLoadingCellParticipates(column: number, row: number, randomness: number): boolean;
