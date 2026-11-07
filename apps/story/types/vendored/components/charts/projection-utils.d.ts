export type ProjectionMode = "auto" | "target" | "manual";
export type ProjectionAutoMethod = "linearRegression" | "lastSegment";
/** How the projection segment is drawn between anchor and horizon. */
export type ProjectionCurveKind = "linear" | "bezier";
/** @deprecated Stepped density removed — projections always anchor → horizon. */
export type ProjectionPathDensity = "stepped" | "endpoints";
export interface ProjectionPoint {
    date: Date;
    value: number;
}
export interface BuildProjectionPathOptions {
    sourceData: Record<string, unknown>[];
    seriesKey: string;
    xDataKey?: string;
    mode: ProjectionMode;
    autoMethod?: ProjectionAutoMethod;
    /** Auto mode: stepped points per interval, or anchor + end only. Default: stepped */
    pathDensity?: ProjectionPathDensity;
    /** Index in sourceData where projection anchors (default: last point). */
    startIndex?: number;
    /** How many future points to generate (matches source cadence). */
    horizonPoints?: number;
    /** Target Y at the final projected date (target mode). */
    endValue?: number;
    /** Full manual path — anchor + future points (manual mode). */
    points?: ProjectionPoint[];
}
/** Slope (value change per ms) at the projection anchor from the last data segment. */
export declare function computeProjectionAnchorTangentSlope(sourceData: Record<string, unknown>[], seriesKey: string, xDataKey?: string, startIndexProp?: number): number;
/** Cubic bezier with horizontal tangents at start and end (price-target S-curve). */
export declare function buildHorizontalTangentBezierPath(x0: number, y0: number, x1: number, y1: number, 
/** How far control points sit along the x span (0–0.5). Default: 0.45 */
tension?: number): string;
/** Build a projection path from historical chart data or explicit points. */
export declare function buildProjectionPath(options: BuildProjectionPathOptions): ProjectionPoint[];
/** Collect numeric Y extents from projection point arrays. */
export declare function projectionValueExtents(paths: ProjectionPoint[][]): {
    minValue: number;
    maxValue: number;
} | null;
/** Collect date extents from projection point arrays. */
export declare function projectionDateExtents(paths: ProjectionPoint[][]): {
    minTime: number;
    maxTime: number;
} | null;
