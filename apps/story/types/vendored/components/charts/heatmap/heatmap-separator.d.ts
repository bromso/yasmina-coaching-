import { type HeatmapSeparatorGradient, type HeatmapSeparatorStrokeStyle } from "./heatmap-utils";
/** Marker for reliably identifying {@link HeatmapSeparator} in chart child trees. */
export declare const HEATMAP_SEPARATOR_MARKER: "__isHeatmapSeparator";
export interface HeatmapSeparatorProps {
    /**
     * Insert a separator before every Nth column (e.g. 4 = divide every four weeks).
     * Used when `groupBy="every"`. When omitted, uses `columnSeparators` from
     * {@link HeatmapChart} or a sibling {@link HeatmapSeparator} parsed for layout.
     */
    every?: number;
    /**
     * Group columns by fixed interval (`every`) or calendar quarter (`quarter`).
     * Default: `"every"`.
     */
    groupBy?: "every" | "quarter";
    /** Additional class name for each separator group. */
    className?: string;
    /**
     * Extra horizontal gap between column groups in pixels (shifts cells apart).
     * Parsed from this component by {@link HeatmapChart} for layout. Default: 0
     */
    spacing?: number;
    /** Half-width of the line band in pixels (line is centered). Default: 0 */
    paddingX?: number;
    /** Inset from the bottom of the plot in pixels. Default: 0 */
    paddingY?: number;
    /**
     * Distance from the chart container top to the line start, in pixels.
     * Use to align with {@link HeatmapXAxis} labels (e.g. `14`). The line always
     * extends to the plot bottom. Default: plot top (`margin.top`).
     */
    startOffset?: number;
    /**
     * Distance below the separator line top to place quarter labels.
     * `0` aligns labels with the line top. Default: 0.
     */
    labelOffset?: number;
    /** Draw Q1–Q4 labels at the start of each quarter group. Default: false */
    showLabels?: boolean;
    /** Format quarter group labels. Default: `Q{n}` */
    labelFormat?: (quarter: number, startDate: Date) => string;
    /** Additional class name for quarter labels */
    labelClassName?: string;
    /** Solid or dashed separator line. Default: `"solid"` */
    strokeStyle?: HeatmapSeparatorStrokeStyle;
    /** Dash pattern when `strokeStyle="dashed"`. Default: `"4,4"` */
    strokeDasharray?: string;
    /** Line stroke color when `gradient` is omitted. Default: `var(--border)` */
    stroke?: string;
    /**
     * Vertical stroke gradient aligned to each line's span.
     * Use matching `from`/`via`/`to` colors with fading opacities to soften the
     * top and bottom (e.g. `{ fromOpacity: 0, viaOpacity: 1, toOpacity: 0 }`).
     */
    gradient?: HeatmapSeparatorGradient;
    /** Line stroke width in pixels. Default: 1 */
    strokeWidth?: number;
    /** Multiplier applied to solid strokes or gradient stop opacities. Default: 1 */
    strokeOpacity?: number;
}
export declare const HeatmapSeparator: import("react").NamedExoticComponent<HeatmapSeparatorProps>;
export default HeatmapSeparator;
