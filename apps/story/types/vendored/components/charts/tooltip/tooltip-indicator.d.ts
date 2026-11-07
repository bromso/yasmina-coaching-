import { type SpringConfig } from "../chart-config-context";
import { type IndicatorFadeEdges } from "../indicator-fade";
export type IndicatorWidth = number | "line" | "thin" | "medium" | "thick";
export interface TooltipIndicatorProps {
    /** X position in pixels (center of the indicator) */
    x: number;
    /** Height of the indicator */
    height: number;
    /** Whether the indicator is visible */
    visible: boolean;
    /**
     * Width of the indicator - number (pixels) or preset.
     * Ignored if `span` is provided.
     */
    width?: IndicatorWidth;
    /**
     * Number of columns/days to span, with current point centered.
     * Requires `columnWidth` to be set.
     */
    span?: number;
    /** Width of a single column/day in pixels. Required when using `span`. */
    columnWidth?: number;
    /** Primary color at edges (10% and 90%) */
    colorEdge?: string;
    /** Secondary color at center (50%) */
    colorMid?: string;
    /** Vertical fade: both ends, top, bottom, or none (solid). */
    fadeEdges?: IndicatorFadeEdges | boolean;
    /** Fade zone size as a percentage of indicator height. Default: 10 */
    fadeLength?: number;
    /** Animate position with a spring. Default: true */
    animate?: boolean;
    /** Unique ID for the gradient */
    gradientId?: string;
    /** Per-chart override; falls back to `ChartConfigProvider.tooltipSpring`. */
    springConfig?: SpringConfig;
    /** SVG stroke dash pattern. When set, renders a dashed stroke instead of a solid fill. */
    strokeDasharray?: string;
}
export declare function TooltipIndicator(props: TooltipIndicatorProps): import("react").JSX.Element | null;
export declare namespace TooltipIndicator {
    var displayName: string;
}
export default TooltipIndicator;
