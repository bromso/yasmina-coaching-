export type BarLineCap = "round" | "butt" | number;
export type BarAnimationType = "grow" | "fade";
export interface BarProps {
    /** Key in data to use for y values */
    dataKey: string;
    /** Y-scale group id for vertical bars (Recharts `yAxisId`). Default: `"left"`. */
    yAxisId?: string | number;
    /** Fill color for the bar. Can be a color, gradient url, or pattern url. Default: var(--chart-line-primary) */
    fill?: string;
    /** Color for tooltip dot. Use when fill is a gradient/pattern. Default: uses fill value */
    stroke?: string;
    /** Line cap style for bar ends: "round", "butt", or a number for custom radius. Default: "round" */
    lineCap?: BarLineCap;
    /** Whether to animate the bars. Default: true */
    animate?: boolean;
    /** Animation type: "grow" (height) or "fade" (opacity + blur). Default: "grow" */
    animationType?: BarAnimationType;
    /** Opacity when not hovered (when another bar is hovered). Default: 0.3 */
    fadedOpacity?: number;
    /** Stagger delay between bars in seconds. Auto-calculated if not provided. */
    staggerDelay?: number;
    /** Gap between stacked bars in pixels. Default: 0 */
    stackGap?: number;
    /** Gap between grouped bars in pixels. Default: 4 */
    groupGap?: number;
    /** Shrink each positive bar's top by its perspective rise so the front face
     * lines up with `<BarDepthBack>`'s lid (instead of the lid sitting above the
     * front face). Pass `true` whenever the chart also renders the bar-depth 3D
     * surfaces. Default: false */
    perspective?: boolean;
    /** Minimum rendered bar height in px (non-stacked, vertical). Floors short or
     * zero-value bars so they stay visible. Pair with the same value on
     * `<BarDepthProvider minBarHeight>` when using the 3D surfaces. Default: 0 */
    minBarHeight?: number;
}
export declare function Bar(props: BarProps): import("react").JSX.Element | null;
export declare namespace Bar {
    var displayName: string;
}
export default Bar;
