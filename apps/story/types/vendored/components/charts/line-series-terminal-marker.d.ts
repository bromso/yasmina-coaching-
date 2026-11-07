export interface LineSeriesTerminalMarkerProps {
    dataKey: string;
    yAxisId?: string | number;
    fill?: string;
    stroke?: string;
    radius?: number;
    ringGap?: number;
    strokeWidth?: number;
}
/** Hollow ring at the last data point — shared anchor for projection lines. */
export declare function LineSeriesTerminalMarker({ dataKey, yAxisId, fill, stroke, radius, ringGap, strokeWidth, }: LineSeriesTerminalMarkerProps): import("react").JSX.Element | null;
export declare namespace LineSeriesTerminalMarker {
    var displayName: string;
}
export default LineSeriesTerminalMarker;
