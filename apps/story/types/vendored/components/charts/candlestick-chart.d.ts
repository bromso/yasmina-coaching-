import type { Transition } from "motion/react";
import { type ReactNode } from "react";
import { type Margin } from "./chart-context";
export interface OHLCDataPoint {
    date: Date;
    open: number;
    high: number;
    low: number;
    close: number;
}
export interface CandlestickChartProps {
    /** OHLC data array */
    data: OHLCDataPoint[];
    /** Key in data for the x-axis (date). Default: "date" */
    xDataKey?: string;
    /** Chart margins */
    margin?: Partial<Margin>;
    /** Animation duration in milliseconds. Default: 1500 */
    animationDuration?: number;
    /** Motion enter transition (spring or cubic-bezier tween). */
    enterTransition?: Transition;
    /** Signature of motion URL state — triggers enter replay when it changes. */
    revealSignature?: string;
    /** Aspect ratio as "width / height". Default: "2 / 1" */
    aspectRatio?: string;
    /** Additional class name for the container */
    className?: string;
    /** Inline styles for the container (e.g. { height: 320 }) */
    style?: React.CSSProperties;
    /** Gap between candles as fraction of slot width (0–1). Default: 0.2. Ignored when candleWidth is set. */
    candleGap?: number;
    /** Fixed candle body width in pixels. If set, overrides candleGap. */
    candleWidth?: number;
    /** When set, xScale uses this domain instead of deriving from data. Use with brush so main chart and strip share the same scale. */
    xDomain?: [Date, Date];
    /** When xDomain is set, use this as the number of slots for scale padding (e.g. full data length). */
    xDomainSlotCount?: number;
    /** Child components (Candlestick, Grid, XAxis, YAxis, ChartTooltip, etc.) */
    children: ReactNode;
}
export declare function CandlestickChart({ data, xDataKey, margin: marginProp, animationDuration, enterTransition, revealSignature, aspectRatio, className, style, candleGap, candleWidth, xDomain, xDomainSlotCount, children, }: CandlestickChartProps): import("react").JSX.Element;
export declare namespace CandlestickChart {
    var displayName: string;
}
export default CandlestickChart;
