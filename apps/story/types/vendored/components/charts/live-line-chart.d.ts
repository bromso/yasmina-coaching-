import { type ReactNode } from "react";
import { type Margin } from "./chart-context";
export interface LiveLinePoint {
    time: number;
    value: number;
}
export interface LiveLineChartProps {
    /** Streaming data — array of { time: unixSeconds, value } */
    data: LiveLinePoint[];
    /** Latest value (smoothly interpolated to) */
    value: number;
    /** Key used for the value field in context data. Default: "value" */
    dataKey?: string;
    /** Visible time window in seconds. Default: 30 */
    window?: number;
    /** Number of X-axis ticks (used to compute leading offset). Default: 5 */
    numXTicks?: number;
    /** Leading offset in X-tick units (0 = now at right edge). Default: 0 */
    nowOffsetUnits?: number;
    /** Tight Y-axis. Default: false */
    exaggerate?: boolean;
    /** Interpolation speed (0–1). Default: 0.08 */
    lerpSpeed?: number;
    /** Chart margins */
    margin?: Partial<Margin>;
    /** Freeze chart scrolling. Default: false */
    paused?: boolean;
    /** Child components (LiveLine, Grid, ChartTooltip, LiveXAxis, LiveYAxis, etc.) */
    children: ReactNode;
    className?: string;
    style?: React.CSSProperties;
}
export declare function LiveLineChart({ data, value, dataKey, window: windowSecs, numXTicks, nowOffsetUnits, exaggerate, lerpSpeed, margin: marginProp, paused, children, className, style, }: LiveLineChartProps): import("react").JSX.Element;
export default LiveLineChart;
