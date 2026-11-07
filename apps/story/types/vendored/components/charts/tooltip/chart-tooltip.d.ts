import { type SpringConfig } from "../chart-config-context";
import { type LineConfig } from "../chart-context";
import type { IndicatorFadeEdges } from "../indicator-fade";
import { type TooltipRow } from "./tooltip-content";
export interface ChartTooltipProps {
    /** Whether to show the date pill at bottom. Default: true */
    showDatePill?: boolean;
    /** Whether to show the vertical crosshair line. Default: true */
    showCrosshair?: boolean;
    /** Whether to show dots on the lines. Default: true */
    showDots?: boolean;
    /** Dot style: filled circle or transparent ring. Default: "dot" */
    dotVariant?: "dot" | "ring";
    /** Dot / ring radius in pixels. Default: 5 */
    dotSize?: number;
    /** Ring corner radius as a fraction of side length (0 = square, 0.5 = circle). */
    dotRadiusFraction?: number;
    /** Multiplier applied to the computed dot / ring pixel radius. Default: 1 */
    dotScale?: number;
    /** Ring stroke width in pixels. Default: 1.5 for ring variant */
    dotStrokeWidth?: number;
    /**
     * Color for the crosshair/indicator line. When a function, receives the hovered point
     * (e.g. for candlestick: match candle color from close vs open). Default: --chart-crosshair.
     */
    indicatorColor?: string | ((point: Record<string, unknown>) => string);
    /** Custom content renderer for the tooltip box */
    content?: (props: {
        point: Record<string, unknown>;
        index: number;
    }) => React.ReactNode;
    /** Custom row renderer - return array of TooltipRow */
    rows?: (point: Record<string, unknown>) => TooltipRow[];
    /**
     * Override tooltip dot fill. When omitted and `rows` is set, dot colors match row colors.
     * When a function, receives the hovered point and line config.
     */
    dotColor?: string | ((point: Record<string, unknown>, line: LineConfig) => string);
    /** Additional content to show below rows (e.g., markers) */
    children?: React.ReactNode;
    /** Custom class name */
    className?: string;
    /** Per-chart override for the crosshair / dot / date-pill spring. */
    springConfig?: SpringConfig;
    /**
     * When `true`, the floating panel uses the crosshair spring and stays in sync.
     * Default `false` — panel follow uses `damping` (`20`).
     */
    matchCrosshair?: boolean;
    /**
     * Spring damping for the floating tooltip panel when `matchCrosshair` is `false`.
     * `0` disables spring motion (instant). Default: `20`.
     */
    damping?: number;
    /** SVG stroke dash pattern for the crosshair. Omit for solid. */
    indicatorDasharray?: string;
    /** Vertical crosshair fade: `both`, `top`, `bottom`, or `none` (solid). Default: `both`. */
    indicatorFadeEdges?: IndicatorFadeEdges;
    /** Crosshair fade zone size (% of height). Default: `10`. */
    indicatorFadeLength?: number;
    /** Per-chart override for the floating-panel spring. */
    boxSpringConfig?: SpringConfig;
    /** Inline styles for the tooltip panel (background, blur, etc.). */
    panelStyle?: React.CSSProperties;
    /**
     * Tooltip panel background color (CSS variable or color value).
     * Default: `var(--chart-tooltip-background)`.
     */
    backgroundColor?: string;
}
export declare function ChartTooltip(props: ChartTooltipProps): import("react").JSX.Element | null;
export declare namespace ChartTooltip {
    var displayName: string;
}
export default ChartTooltip;
