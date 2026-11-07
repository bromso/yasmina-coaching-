type CurveFactory = any;
import type { LoadingStyle } from "./chart-phase";
import { type FadeEdges } from "./fade-edges";
import { type LineLoadingPulseMode } from "./line-loading-pulse";
import type { SeriesPointMarkerStyle } from "./series-point-marker";
export interface AreaProps {
    /** Key in data to use for y values */
    dataKey: string;
    /** Y-scale group id (Recharts `yAxisId`). Default: `"left"`. */
    yAxisId?: string | number;
    /** Fill color for the area gradient start. Default: var(--chart-line-primary) */
    fill?: string;
    /** Fill opacity at the top of the area. Default: 0.4 */
    fillOpacity?: number;
    /** Stroke color for the line. Default: same as fill */
    stroke?: string;
    /** Stroke width. Default: 2 */
    strokeWidth?: number;
    /** Curve function. Default: curveMonotoneX */
    curve?: CurveFactory;
    /** Whether to animate the area. Default: true */
    animate?: boolean;
    /** Whether to show the stroke line. Default: true */
    showLine?: boolean;
    /** Whether to show highlight segment on hover. Default: true */
    showHighlight?: boolean;
    /** Gradient opacity at bottom (0 = fully transparent). Default: 0 */
    gradientToOpacity?: number;
    /**
     * Vertical extent of the fill gradient (0–1). `1` fades across the full
     * height; lower values compress the gradient toward the top.
     */
    gradientSpan?: number;
    /**
     * Fade the area fill (and stroke) toward transparent at the chart edges.
     * - `true` fades both edges, `false` disables the fade entirely.
     * - `"left"` / `"right"` fades only that side — useful when the opposite
     *   edge butts up against another element you don't want to fade into.
     * Default: false
     */
    fadeEdges?: FadeEdges;
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
    /** Pulse stroke color while chart is loading. Default: var(--foreground) */
    loadingStroke?: string;
    /** Pulse stroke opacity while chart is loading. Default: 0.5 */
    loadingStrokeOpacity?: number;
    /**
     * Show the loading pulse overlay. Default: follows chart loading phase.
     * Set `false` to disable even during loading.
     */
    loading?: boolean;
    /** Override pulse animation mode (loop / exit / enter). */
    loadingPulseMode?: LineLoadingPulseMode;
    /**
     * Loading animation while the chart is in loading status: the default
     * traveling `"pulse"`, or a diagonal `"sweep"` shimmer across the skeleton
     * area. Default: `"pulse"`.
     */
    loadingStyle?: LoadingStyle;
}
export declare function Area({ dataKey, yAxisId, fill, fillOpacity, stroke, strokeWidth, curve, animate, showLine, showHighlight, gradientToOpacity, gradientSpan, fadeEdges, showMarkers, markers, dashFromIndex, dashArray, loading, loadingStroke, loadingStrokeOpacity, loadingPulseMode, loadingStyle, }: AreaProps): import("react").JSX.Element;
export declare namespace Area {
    var displayName: string;
}
export default Area;
