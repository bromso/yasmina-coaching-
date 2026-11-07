import { type SeriesPointMarkerStyle } from "./series-point-marker";
export interface SeriesMarkersProps extends SeriesPointMarkerStyle {
    dataKey: string;
    /** Marker fill color. Defaults to series stroke or chart palette color. */
    fill?: string;
    /** Whether to animate markers with clip reveal. Default: true */
    animate?: boolean;
}
export declare function SeriesMarkers({ dataKey, fill, stroke, strokeWidth, ringGap, outlineWidth, outlineColor, radius, animate, fadeOnHover, inactiveOpacity, inactiveBlur, enterBlur, showActiveHighlight, }: SeriesMarkersProps): import("react").JSX.Element;
export declare namespace SeriesMarkers {
    var displayName: string;
}
export default SeriesMarkers;
