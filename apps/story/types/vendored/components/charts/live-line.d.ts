type CurveFactory = any;
export type Momentum = "up" | "down" | "flat";
export interface MomentumColors {
    up: string;
    down: string;
    flat: string;
}
export declare function detectMomentum(data: Record<string, unknown>[], dataKey: string, lookback?: number): Momentum;
export interface LiveLineProps {
    /** Key in data to use for y values */
    dataKey: string;
    /** Stroke color. Default: var(--chart-line-primary) */
    stroke?: string;
    /** Stroke width. Default: 2 */
    strokeWidth?: number;
    /** Curve function. Default: curveMonotoneX */
    curve?: CurveFactory;
    /** Show gradient fill under the curve. Default: true */
    fill?: boolean;
    /** Show pulsing live dot at the right edge. Default: true */
    pulse?: boolean;
    /** Radius of the live dot. Default: 4 */
    dotSize?: number;
    /** Show value badge pill at the live tip. Default: true */
    badge?: boolean;
    /** Value label formatter for the badge */
    formatValue?: (v: number) => string;
    /**
     * When set, the line/fill color changes based on momentum direction.
     * Overrides `stroke` for the line and fill (dot always uses momentum colors).
     */
    momentumColors?: MomentumColors;
}
export declare function LiveLine({ dataKey, stroke, strokeWidth, curve, fill, pulse, dotSize, badge, formatValue, momentumColors, }: LiveLineProps): import("react").JSX.Element;
export declare namespace LiveLine {
    var displayName: string;
}
export default LiveLine;
