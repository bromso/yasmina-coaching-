export type ChartStatus = "loading" | "ready";
/** Loading animation style: the default traveling pulse, or a diagonal
 * shimmer that sweeps across the skeleton. */
export type LoadingStyle = "pulse" | "sweep";
/**
 * Internal visual lifecycle phase. Forward and reverse transitions add
 * intermediate phases in later stack branches.
 */
export type ChartPhase = "loading" | "exiting" | "gridTweenReady" | "revealing" | "ready" | "exitingReady" | "gridTweenLoading" | "revealingLoading";
export declare const DEFAULT_CHART_STATUS: ChartStatus;
/** Default Y-domain tween when transitioning loading ↔ ready (ms). */
export declare const DEFAULT_Y_DOMAIN_TWEEN_MS = 500;
/** Relative domain delta below which Y tween may be skipped (see plan). */
export declare const Y_DOMAIN_TWEEN_SKIP_THRESHOLD = 0.02;
/** Resting phase for a given status before transition orchestration runs. */
export declare function resolveRestingChartPhase(status: ChartStatus): ChartPhase;
export declare function isChartInteractionPhase(phase: ChartPhase): boolean;
export declare const DEFAULT_CHART_LIFECYCLE: {
    readonly chartPhase: "ready";
    readonly chartStatus: "ready";
    readonly loadingLabel: undefined;
    readonly yDomainTweenDuration: 500;
    readonly yDomainSkeletonByAxis: {
        readonly left: [number, number];
    };
    readonly yDomainTargetByAxis: {
        readonly left: [number, number];
    };
};
