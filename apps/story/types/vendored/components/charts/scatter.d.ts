import { type SeriesMarkersProps } from "./series-markers";
export interface ScatterProps extends Omit<SeriesMarkersProps, "animate"> {
    /** Y-scale group id (Recharts `yAxisId`). Default: `"left"`. */
    yAxisId?: string | number;
    /** Whether to animate points with clip reveal. Default: true */
    animate?: boolean;
    /**
     * Color each dot by its vertical position using a chart-space linear gradient.
     * Lower values use `from`; higher values use `to`. Default stops: red (bottom) → green (top).
     */
    yGradient?: boolean | {
        from?: string;
        to?: string;
    };
}
export declare function Scatter({ dataKey, fill, stroke, strokeWidth, ringGap, outlineWidth, outlineColor, radius, animate, fadeOnHover, inactiveOpacity, inactiveBlur, enterBlur, showActiveHighlight, yGradient, }: ScatterProps): import("react").JSX.Element;
export declare namespace Scatter {
    var displayName: string;
}
export default Scatter;
