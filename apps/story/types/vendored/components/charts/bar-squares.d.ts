import { type PatternPresetId } from "./pattern-preset";
export interface GradientStop {
    offset: number;
    color: string;
}
export interface BarSquaresProps {
    dataKey: string;
    yAxisId?: string | number;
    /** Fill color, gradient url, or pattern url. Default: var(--chart-line-primary) */
    fill?: string;
    /** Tooltip dot / ring stroke color when fill is gradient/pattern */
    stroke?: string;
    /** Gap between stacked squares in pixels. Default: 3 */
    squareGap?: number;
    /** Corner radius as a fraction of square size (0 = flat, 0.5 = circle). Default: 0.25 */
    squareRadius?: number;
    /** Redistribute gap so columns fit bar height exactly */
    squareFit?: boolean;
    /** Apply bar-spanning gradient from gradientStops */
    useGradient?: boolean;
    gradientStops?: GradientStop[];
    /** Pattern preset when fill is a pattern (for gradient tinting) */
    patternPreset?: PatternPresetId;
    animate?: boolean;
    fadedOpacity?: number;
    staggerDelay?: number;
    groupGap?: number;
}
export interface BarColumnTrackProps {
    /** Fill color or pattern url. Default: var(--chart-grid) */
    fill?: string;
    opacity?: number;
    squareGap?: number;
    /** Corner radius fraction (matches squares). Default: 0.25 */
    squareRadius?: number;
    groupGap?: number;
    squareFit?: boolean;
    staggerDelay?: number;
}
export declare function BarSquares(props: BarSquaresProps): import("react").JSX.Element | null;
export declare namespace BarSquares {
    var displayName: string;
}
export declare function BarColumnTrack(props: BarColumnTrackProps): import("react").JSX.Element | null;
export declare namespace BarColumnTrack {
    var displayName: string;
}
export default BarSquares;
