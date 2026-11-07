/**
 * Shared "sweep" loading visuals. A soft diagonal shimmer band travels across a
 * self-contained skeleton silhouette on a loop, painted via an SVG mask. The
 * silhouette re-randomizes between passes (held steady during a pass, re-rolled
 * once the band clears the right edge) so it reads as live and still loading,
 * without warping mid-sweep. Used as the `loadingStyle="sweep"` alternative to
 * the traveling pulse on `<Line>` and `<Area>`, and as the skeleton for
 * `<BarChart status="loading">`.
 */
type CurveFactory = any;
/** Deterministic heights (percentages of the available height) for a seed. */
export declare function getSkeletonHeights(count: number, seed?: number, min?: number, max?: number): number[];
export interface LineLoadingSweepProps {
    /** Curve factory from the host `<Line>` / `<Area>`, so the silhouette matches
     * the chart's interpolation (step, smooth, linear, …). */
    curve: CurveFactory;
    /** Fill the silhouette as an area (for `<Area>`); otherwise stroke only. */
    withArea?: boolean;
    /** Loading phase: `"loop"` (steady), `"exit"` (loading → ready), or `"enter"`
     * (ready → loading). Exit/enter fade the silhouette and then signal the chart
     * to continue its reveal. Default: `"loop"`. */
    mode?: "loop" | "exit" | "enter";
    /** Fired when an exit/enter transition finishes, to advance the chart phase. */
    onTransitionComplete?: () => void;
    stroke?: string;
    strokeOpacity?: number;
    strokeWidth?: number;
    pointCount?: number;
    durationSeconds?: number;
}
/**
 * Renders a placeholder line/area silhouette (its own, not the chart's skeleton)
 * with the shimmer sweeping across it. The silhouette re-randomizes between
 * passes. Reads inner dimensions from chart context.
 */
export declare function LineLoadingSweep({ curve, withArea, mode, onTransitionComplete, stroke, strokeOpacity, strokeWidth, pointCount, durationSeconds, }: LineLoadingSweepProps): import("react").JSX.Element | null;
export declare namespace LineLoadingSweep {
    var displayName: string;
}
export interface BarLoadingSkeletonProps {
    innerWidth: number;
    innerHeight: number;
    /** Number of skeleton bars. Default: 12 */
    barCount?: number;
    /** Bar fill color. Default: `var(--foreground)` */
    fill?: string;
    /** Bar fill opacity. Default: 0.45 */
    fillOpacity?: number;
    /** Bars rise from the bottom or diverge from the vertical center. Default: `"bottom"` */
    baseline?: "bottom" | "center";
    /** Bar width as a fraction of its band (0–1). Default: 0.7 */
    barFraction?: number;
    /** One shimmer sweep, in seconds. Default: 2 */
    durationSeconds?: number;
}
/**
 * Skeleton bars masked by the shimmer sweep, re-randomizing between passes.
 * Rendered in the chart's inner coordinate space (origin at the inner top-left),
 * so a `BarChart` drops it inside its margin-translated group.
 */
export declare function BarLoadingSkeleton({ innerWidth, innerHeight, barCount, fill, fillOpacity, baseline, barFraction, durationSeconds, }: BarLoadingSkeletonProps): import("react").JSX.Element | null;
export declare namespace BarLoadingSkeleton {
    var displayName: string;
}
export {};
