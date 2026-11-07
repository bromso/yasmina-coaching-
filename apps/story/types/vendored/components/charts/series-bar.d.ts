export interface SeriesBarProps {
    /** Key in data for bar height (y value) */
    dataKey: string;
    /** Fill color. Default: var(--chart-line-primary) */
    fill?: string;
    /** Tooltip dot color when fill is gradient/pattern. Default: fill */
    stroke?: string;
    /** Corner radius for bar top corners. Default: 0 (square tops, similar to Bar lineCap="butt") */
    radius?: number;
    /** Animate grow from baseline. Default: true */
    animate?: boolean;
    /** Opacity for non-hovered bars when another point is hovered (matches BarChart). Default: 0.3 */
    fadedOpacity?: number;
}
export declare function SeriesBar({ dataKey, fill, radius, animate, fadedOpacity, }: SeriesBarProps): import("react").JSX.Element | null;
export declare namespace SeriesBar {
    var displayName: string;
}
export default SeriesBar;
