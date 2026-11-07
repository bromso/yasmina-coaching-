import type { Transition } from "motion/react";
import { type ReactNode } from "react";
import { type PieData } from "./pie-context";
/** Default hover offset in pixels */
export declare const DEFAULT_HOVER_OFFSET = 10;
export interface PieChartProps {
    /** Data array - each item represents a slice */
    data: PieData[];
    /** Chart size in pixels. If not provided, uses parent container size */
    size?: number;
    /** Inner radius for donut charts. Default: 0 (solid pie) */
    innerRadius?: number;
    /** Padding angle between slices in radians. Default: 0 */
    padAngle?: number;
    /** Corner radius for rounded slice edges. Default: 0 */
    cornerRadius?: number;
    /** Start angle in radians. Default: -PI/2 (top) */
    startAngle?: number;
    /** End angle in radians. Default: 3*PI/2 (full circle from top) */
    endAngle?: number;
    /** Additional class name for the container */
    className?: string;
    /** Controlled hover state - index of hovered slice */
    hoveredIndex?: number | null;
    /** Callback when hover state changes */
    onHoverChange?: (index: number | null) => void;
    /**
     * Hover offset in pixels for slice hover effects.
     * This also determines the padding around the chart to prevent clipping.
     * Default: 10
     */
    hoverOffset?: number;
    /** Child components (PieSlice, PieCenter, patterns, gradients, etc.) */
    children: ReactNode;
    /** Framer Motion transition for slice enter animation */
    enterTransition?: Transition;
    /** Scales slice stagger delays (1 = default). */
    enterStaggerScale?: number;
    /**
     * High-frequency geometry updates (e.g. studio NumberField scrub).
     * Uses plain SVG paths instead of Motion `d` / spring hover morphing.
     */
    geometryScrubbing?: boolean;
}
export declare function PieChart({ data, size: fixedSize, innerRadius, padAngle, cornerRadius, startAngle, endAngle, className, hoveredIndex, onHoverChange, hoverOffset, enterTransition, enterStaggerScale, geometryScrubbing, children, }: PieChartProps): import("react").JSX.Element;
export declare namespace PieChart {
    var displayName: string;
}
export default PieChart;
