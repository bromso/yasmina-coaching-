export interface SeriesPointMarkerStyle {
    /** Fill color for the inner circle */
    fill?: string;
    /** Outer ring stroke color. Default: same as `fill` */
    stroke?: string;
    /** Outer ring stroke width in px. Default: 2. Set to 0 to disable. */
    strokeWidth?: number;
    /** Gap between the inner fill and outer ring in px. Default: 2 */
    ringGap?: number;
    /** Optional outer outline beyond the ring. Default: 0 */
    outlineWidth?: number;
    /** Outer outline color. Default: same as `stroke` */
    outlineColor?: string;
    /** Point radius in px. Default: 5 */
    radius?: number;
    /** Dim non-active points while hovering. Default: true */
    fadeOnHover?: boolean;
    /** Opacity for non-hovered points when `fadeOnHover` is true. Default: 0.5 */
    inactiveOpacity?: number;
    /**
     * Blur in px for non-hovered points when `fadeOnHover` is true.
     * Applied once on the dimmed layer (not per dot) for performance. Default: 2
     */
    inactiveBlur?: number;
    /** Initial blur in px during enter animation. Default: 2 */
    enterBlur?: number;
    /** Enlarge the active point while hovering. Default: true */
    showActiveHighlight?: boolean;
}
export interface StaticSeriesPointMarkerProps extends SeriesPointMarkerStyle {
    cx: number;
    cy: number;
    scale?: number;
}
export declare const StaticSeriesPointMarker: import("react").NamedExoticComponent<StaticSeriesPointMarkerProps>;
export interface SeriesPointMarkerProps extends SeriesPointMarkerStyle {
    dataKey: string;
    index: number;
    cx: number;
    cy: number;
    revealDelay: number;
    revealEpoch: number;
    enterDuration: number;
}
/** Motion enter marker — used only while the chart reveal is running. */
export declare function SeriesPointMarker({ dataKey, index, cx, cy, enterBlur, revealDelay, revealEpoch, enterDuration, fill, stroke, strokeWidth, ringGap, outlineWidth, outlineColor, radius, }: SeriesPointMarkerProps): import("react").JSX.Element;
export declare function getSeriesMarkerVisualExtent(style: Pick<SeriesPointMarkerStyle, "radius" | "strokeWidth" | "ringGap" | "outlineWidth" | "showActiveHighlight">): number;
