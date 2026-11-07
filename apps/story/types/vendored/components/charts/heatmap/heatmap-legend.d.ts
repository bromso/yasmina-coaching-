import { type HeatmapLevelStyles } from "./heatmap-colors";
export declare const HEATMAP_LEGEND_LEVELS: readonly [0, 1, 2, 3, 4];
export type HeatmapLegendVariant = "swatches" | "gradient";
export interface HeatmapLegendProps {
    /** Side label before the swatches. Default: "Less" */
    lessLabel?: string;
    /** Side label after the swatches. Default: "More" */
    moreLabel?: string;
    /** Swatch size in pixels. Default: 11 */
    cellSize?: number;
    /** Gap between swatches. Default: 2 */
    gap?: number;
    /** Corner radius for swatches. Default: 2 */
    cornerRadius?: number;
    /** Horizontal alignment within the legend cell. Default: "end" */
    align?: "start" | "center" | "end";
    /** Legend layout — discrete swatches or a continuous gradient bar. Default: `"swatches"` */
    variant?: HeatmapLegendVariant;
    /** Gradient bar width in swatch units when `variant="gradient"`. Default: 5 */
    gradientSpan?: number;
    /** Font size in pixels for side labels. */
    fontSize?: number;
    /** Additional class name for less/more labels. */
    labelClassName?: string;
    /** Shared level styles for cells and legend swatches. */
    levelStyles?: HeatmapLevelStyles;
    /** Override the default color scale (used when `levelStyles` is omitted). */
    colorScale?: (count: number | null | undefined) => string;
    /** Opacity for inactive swatches while interacting. Default: 0.3 */
    inactiveOpacity?: number;
    /** Scale for inactive swatches while interacting. Default: 1 */
    inactiveScale?: number;
    /** Scale for the highlighted swatch while interacting. Default: 1 */
    activeScale?: number;
    /** Sync dimming with chart hover. Default: true when inside HeatmapInteractionProvider */
    interactive?: boolean;
    className?: string;
}
export declare const HeatmapLegend: import("react").NamedExoticComponent<HeatmapLegendProps>;
export default HeatmapLegend;
