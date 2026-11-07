export interface GridProps {
    /** Show horizontal grid lines. Default: true */
    horizontal?: boolean;
    /** Show vertical grid lines. Default: false */
    vertical?: boolean;
    /** Number of horizontal grid lines. Default: 5 */
    numTicksRows?: number;
    /** Number of vertical grid lines. Default: 10 */
    numTicksColumns?: number;
    /** Explicit tick values for horizontal grid lines. Overrides numTicksRows. */
    rowTickValues?: number[];
    /** Grid line stroke color. Default: var(--chart-grid) */
    stroke?: string;
    /** Grid stroke while loading chrome is active. Falls back to `stroke`. */
    loadingStroke?: string;
    /** Grid line stroke opacity. Default: 1 */
    strokeOpacity?: number;
    /** Grid line stroke width. Default: 1 */
    strokeWidth?: number;
    /** Grid line dash array. Default: "4,4" for dashed lines */
    strokeDasharray?: string;
    /** Horizontal row values rendered with alternate styling (e.g. zero baseline). */
    highlightRowValues?: number[];
    /** Stroke for highlighted rows. Default: var(--chart-foreground-muted) */
    highlightRowStroke?: string;
    /** Stroke opacity for highlighted rows. Default: 1 */
    highlightRowStrokeOpacity?: number;
    /** Stroke width for highlighted rows. Default: 1 */
    highlightRowStrokeWidth?: number;
    /** Dash array for highlighted rows. Default: solid line */
    highlightRowStrokeDasharray?: string;
    /** Enable horizontal fade effect on grid rows (fades at left/right). Default: true */
    fadeHorizontal?: boolean;
    /** Enable vertical fade effect on grid columns (fades at top/bottom). Default: false */
    fadeVertical?: boolean;
    /** Omit the first and last horizontal grid lines. Default: false */
    hideHorizontalEdgeLines?: boolean;
    /** Omit the first and last vertical grid lines. Default: false */
    hideVerticalEdgeLines?: boolean;
    /** Y-scale for horizontal grid lines. Default: primary (`"left"`) axis. */
    yAxisId?: string | number;
    /** Animate a shimmer band across horizontal grid lines. Default: false */
    shimmer?: boolean;
    /** Shimmer band stroke (color and opacity via color-mix or oklch alpha). */
    shimmerStroke?: string;
    /** Shimmer band width in pixels. Default: 140 */
    shimmerLength?: number;
    /** Shimmer speed multiplier (higher = faster). Default: 1 */
    shimmerSpeed?: number;
    /** Match loop timing to the loading line pulse (cycle + inter-loop pause). */
    shimmerSync?: boolean;
}
export declare function Grid({ horizontal, vertical, numTicksRows, numTicksColumns, rowTickValues, stroke, loadingStroke, strokeOpacity, strokeWidth, strokeDasharray, highlightRowValues, highlightRowStroke, highlightRowStrokeOpacity, highlightRowStrokeWidth, highlightRowStrokeDasharray, fadeHorizontal, fadeVertical, hideHorizontalEdgeLines, hideVerticalEdgeLines, yAxisId, shimmer, shimmerStroke, shimmerLength, shimmerSpeed, shimmerSync, }: GridProps): import("react").JSX.Element;
export declare namespace Grid {
    var displayName: string;
}
export default Grid;
