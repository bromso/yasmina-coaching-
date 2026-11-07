import type { Transition } from "motion/react";
import { type ReactNode } from "react";
import { type RingData } from "./ring-context";
export interface RingChartProps {
    /** Data array - each item represents a ring */
    data: RingData[];
    /** Chart size in pixels. If not provided, uses parent container size */
    size?: number;
    /** Stroke width of each ring. Default: 12 */
    strokeWidth?: number;
    /** Gap between rings. Default: 6 */
    ringGap?: number;
    /** Inner radius of the innermost ring. Default: 60 */
    baseInnerRadius?: number;
    /** Animation duration in milliseconds. Default: 1100 */
    animationDuration?: number;
    /** Additional class name for the container */
    className?: string;
    /** Controlled hover state - index of hovered ring */
    hoveredIndex?: number | null;
    /** Callback when hover state changes */
    onHoverChange?: (index: number | null) => void;
    /** Start angle in radians. Default: -PI/2 (top) */
    startAngle?: number;
    /** End angle in radians. Default: 3*PI/2 (full circle) */
    endAngle?: number;
    /** Framer Motion transition for ring enter animation */
    enterTransition?: Transition;
    /** Scales ring stagger delays (1 = default). */
    enterStaggerScale?: number;
    /**
     * High-frequency geometry updates (e.g. studio NumberField scrub).
     * Uses plain SVG paths instead of Motion `d` morphing.
     */
    geometryScrubbing?: boolean;
    /** Child components (Ring, RingCenter, etc.) */
    children: ReactNode;
}
export declare function RingChart({ data, size: fixedSize, strokeWidth, ringGap, baseInnerRadius, className, hoveredIndex, onHoverChange, startAngle, endAngle, enterTransition, enterStaggerScale, geometryScrubbing, children, }: RingChartProps): import("react").JSX.Element;
export default RingChart;
