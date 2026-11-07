import { type PatternPresetId, type PatternPresetOptions } from "./pattern-preset";
export type BackgroundPatternPreset = PatternPresetId;
export interface BackgroundProps extends PatternPresetOptions {
    /** Pattern preset. `"none"` renders nothing. */
    pattern?: BackgroundPatternPreset;
    /** Pattern stroke color. Default: `var(--chart-grid)` */
    color?: string;
    /** Apply the pattern texture to the plot area. Default: true */
    showFill?: boolean;
    /** Pattern fill opacity. Default: 1 */
    opacity?: number;
    /** Fade pattern at the left and right chart edges. Default: true */
    fadeHorizontal?: boolean;
    /** Fade pattern at the top and bottom chart edges. Default: true */
    fadeVertical?: boolean;
    /** Horizontal fade zone as % of plot width per edge. Default: 10 */
    fadeHorizontalLength?: number;
    /** Vertical fade zone as % of plot height per edge. Default: 10 */
    fadeVerticalLength?: number;
}
/** Plot-area pattern fill for charts without a grid. Renders behind series layers. */
export declare function Background({ pattern, color, scale, strokeWidth, radius, complement, fill, dotFill, tileBackground, showFill, opacity, fadeHorizontal, fadeVertical, fadeHorizontalLength, fadeVerticalLength, }: BackgroundProps): import("react").JSX.Element | null;
export declare namespace Background {
    var displayName: string;
}
export default Background;
