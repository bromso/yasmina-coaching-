import type { Transition } from "motion/react";
import { type CSSProperties, type ReactNode } from "react";
export interface FunnelGradientStop {
    offset: string | number;
    color: string;
}
export interface FunnelStage {
    label: string;
    value: number;
    displayValue?: string;
    /** Override the chart-level color for this segment */
    color?: string;
    /**
     * Apply a linear gradient to this segment.
     * Provide an array of color stops, e.g. `[{ offset: "0%", color: "#8B5CF6" }, { offset: "100%", color: "#3B82F6" }]`.
     * When set, this takes priority over the segment and chart-level `color` for the innermost ring.
     * Outer halo rings use the first stop color as their solid color.
     */
    gradient?: FunnelGradientStop[];
}
export interface FunnelChartProps {
    data: FunnelStage[];
    orientation?: "horizontal" | "vertical";
    color?: string;
    layers?: number;
    className?: string;
    style?: CSSProperties;
    showPercentage?: boolean;
    showValues?: boolean;
    showLabels?: boolean;
    /** Controlled hover state — index of the hovered segment */
    hoveredIndex?: number | null;
    /** Callback when hover state changes */
    onHoverChange?: (index: number | null) => void;
    formatPercentage?: (pct: number) => string;
    formatValue?: (value: number) => string;
    /** Stagger delay between segments in seconds. Default 0.12 */
    staggerDelay?: number;
    /** Framer Motion transition for segment enter animation */
    enterTransition?: Transition;
    /** Gap between segments in pixels. Default 4 */
    gap?: number;
    /**
     * Render a visx pattern definition. Receives a unique `id` string per segment
     * and the resolved `color`. Return a `<PatternLines>` (or any visx pattern)
     * inside an SVG `<defs>`. The component will use `fill="url(#id)"` on the
     * innermost ring while keeping outer halo rings as solid color.
     */
    renderPattern?: (id: string, color: string) => ReactNode;
    /** Edge style for the funnel segments. Default "curved" */
    edges?: "curved" | "straight";
    /**
     * Controls how segment labels (value, percentage, stage name) are arranged.
     * - "spread": Value/percentage/label are spread apart (top/center/bottom for horizontal,
     *   left/center/right for vertical). This is the default.
     * - "grouped": All label items stack together in a tight group.
     *
     * When "grouped", use `labelOrientation` and `labelAlign` for full control.
     */
    labelLayout?: "spread" | "grouped";
    /**
     * Stack direction of the label group. Only applies when `labelLayout="grouped"`.
     * - "vertical": Items stack top-to-bottom. Default for horizontal funnels.
     * - "horizontal": Items stack left-to-right. Default for vertical funnels.
     */
    labelOrientation?: "vertical" | "horizontal";
    /**
     * Where the label group sits within the segment cell.
     * - "center" (default), "start", "end"
     * For horizontal funnel: start=top, end=bottom.
     * For vertical funnel: start=left, end=right.
     */
    labelAlign?: "center" | "start" | "end";
    /** Grid configuration. Pass `true` for default bands + lines, or an object for fine control. */
    grid?: boolean | {
        /** Show alternating background bands behind each segment. Default true */
        bands?: boolean;
        /** Color of the background bands. Default "var(--color-muted)" */
        bandColor?: string;
        /** Show grid lines at each gap between segments. Default true */
        lines?: boolean;
        /** Color of the grid lines. Default "var(--chart-grid)" */
        lineColor?: string;
        /** Opacity of the grid lines. Default 1 */
        lineOpacity?: number;
        /** Width of the grid lines in pixels. Default 1 */
        lineWidth?: number;
    };
}
export declare function FunnelChart({ data, orientation, color, layers, className, style, showPercentage, showValues, showLabels, hoveredIndex: hoveredIndexProp, onHoverChange, formatPercentage, formatValue, staggerDelay, enterTransition, gap, renderPattern, edges, labelLayout, labelOrientation, labelAlign, grid: gridProp, }: FunnelChartProps): import("react").JSX.Element | null;
