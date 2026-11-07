declare const DEFAULT_SKELETON_DATA_KEY = "value";
declare const DEFAULT_SKELETON_POINT_COUNT = 7;
export interface GenerateChartSkeletonDataOptions {
    /** Key used for y values in each row. Default: `"value"`. */
    dataKey?: string;
    /** Number of points. Default: 7. */
    pointCount?: number;
    /** Start date for the x axis. Default: 2025-01-01. */
    baseDate?: Date;
}
/** Placeholder series used while `status="loading"` and data is empty. */
export declare function generateChartSkeletonData(options?: GenerateChartSkeletonDataOptions): Record<string, unknown>[];
/** Skeleton rows that mirror target dates/count with lower magnitudes for Y tween. */
export declare function generateChartSkeletonFromTarget(targetData: Record<string, unknown>[], dataKey: string): Record<string, unknown>[];
export { DEFAULT_SKELETON_DATA_KEY, DEFAULT_SKELETON_POINT_COUNT };
