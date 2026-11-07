export interface UseGridShimmerOptions {
    innerWidth: number;
    shimmer: boolean;
    shimmerLength: number;
    shimmerSpeed: number;
    shimmerSync: boolean;
    /** When false, shimmer animation is paused (e.g. during exit transition). */
    active: boolean;
    /** Run a single synced sweep (loading → ready handoff). */
    oneShot?: boolean;
}
export declare function useGridShimmer({ innerWidth, shimmer, shimmerLength, shimmerSpeed, shimmerSync, active, oneShot, }: UseGridShimmerOptions): {
    shimmerEnabled: boolean;
    shimmerTransform: import("motion/react").MotionValue<string>;
};
