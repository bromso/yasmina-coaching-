import type { YAxisOrientation } from "./y-axis-scales";
export interface YAxisProps {
    /** Scale group id (Recharts `yAxisId`). Default: `"left"`. */
    yAxisId?: string | number;
    /** Which side of the chart to render labels. Default: `"left"`. */
    orientation?: YAxisOrientation;
    /**
     * Approximate tick count hint for `scale.ticks()` (d3). Actual label count may differ.
     * Clamped to {@link Y_AXIS_MIN_TICK_COUNT}–{@link Y_AXIS_MAX_TICK_COUNT}. Default: 5.
     */
    numTicks?: number;
    /** Format large numbers (e.g. 1000 as "1k"). Default: true */
    formatLargeNumbers?: boolean;
    /** Custom formatter for tick labels (e.g. USD). Overrides formatLargeNumbers when set. */
    formatValue?: (value: number) => string;
}
export declare function YAxis(props: YAxisProps): import("react").JSX.Element | null;
export declare namespace YAxis {
    var displayName: string;
}
export default YAxis;
