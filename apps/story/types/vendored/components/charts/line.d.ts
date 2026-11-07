type CurveFactory = any;
import type { LoadingStyle } from "./chart-phase";
import { type FadeEdges } from "./fade-edges";
import { type LineLoadingPulseMode } from "./line-loading-pulse";
import type { SeriesPointMarkerStyle } from "./series-point-marker";
export interface LineProps {
    /** Key in data to use for y values */
    dataKey: string;
    /** Y-scale group id (Recharts `yAxisId`). Default: `"left"`. */
    yAxisId?: string | number;
    /** Stroke color. Default: var(--chart-line-primary) */
    stroke?: string;
    /** Stroke width. Default: 2.5 */
    strokeWidth?: number;
    /** Curve function. Default: curveNatural */
    curve?: CurveFactory;
    /** Whether to animate the line. Default: true */
    animate?: boolean;
    /**
     * Fade the line stroke toward transparent at the chart edges.
     * - `true` fades both edges, `false` disables the fade entirely.
     * - `"left"` / `"right"` fades only that side.
     * Default: true
     */
    fadeEdges?: FadeEdges;
    /** Whether to show highlight segment on hover. Default: true */
    showHighlight?: boolean;
    /** Render scatter-style circle markers at each data point. Default: false */
    showMarkers?: boolean;
    /** Marker styling (same options as Scatter). */
    markers?: SeriesPointMarkerStyle;
    /**
     * Data index from which the line stroke becomes dashed (inclusive).
     * Useful for projecting incomplete periods, e.g. dashed from yesterday through today.
     */
    dashFromIndex?: number;
    /** Dash pattern for the tail segment when `dashFromIndex` is set. Default: "6,4" */
    dashArray?: string;
    /**
     * Show the loading pulse overlay. Default: follows chart loading phase.
     * Set `false` to disable even during loading.
     */
    loading?: boolean;
    /** Stroke color for the loading pulse overlay. Default: var(--foreground) */
    loadingStroke?: string;
    /** Loading pulse stroke opacity. Default: 0.5 */
    loadingStrokeOpacity?: number;
    /** Override pulse animation mode (loop / exit / enter). */
    loadingPulseMode?: LineLoadingPulseMode;
    /** Called when a loop-mode pulse cycle completes. */
    onLoadingPulseCycleComplete?: () => void;
    /**
     * Loading animation while the chart is in loading status: the default
     * traveling `"pulse"`, or a diagonal `"sweep"` shimmer across the skeleton
     * line. Default: `"pulse"`.
     */
    loadingStyle?: LoadingStyle;
}
export declare function Line({ dataKey, yAxisId, stroke, strokeWidth, curve, animate, fadeEdges, showHighlight, showMarkers, markers, dashFromIndex, dashArray, loading, loadingStroke, loadingStrokeOpacity, loadingPulseMode, onLoadingPulseCycleComplete, loadingStyle, }: LineProps): import("react").JSX.Element;
export declare namespace Line {
    var displayName: string;
}
export default Line;
