import type { Transition } from "motion/react";
import { type ReactNode } from "react";
import { type RadarData, type RadarMetric } from "./radar-context";
export interface RadarChartProps {
    /** Data array - each item represents a data series (polygon) */
    data: RadarData[];
    /** Metrics to display on the radar */
    metrics: RadarMetric[];
    /** Chart size in pixels. If not provided, uses parent container size */
    size?: number;
    /** Number of concentric grid circles. Default: 5 */
    levels?: number;
    /** Margin around the chart. Default: 60 */
    margin?: number;
    /** Enable animations. Default: true */
    animate?: boolean;
    /** Enter animation budget in ms. Default: 1100 */
    enterDurationMs?: number;
    /** Scales stagger timing (1 = default). */
    staggerScale?: number;
    /** Motion enter transition (spring or cubic-bezier tween). */
    enterTransition?: Transition;
    /** Changes when motion settings change — replays enter animations. */
    motionReplayKey?: string;
    /** Controlled hover state - index of hovered area */
    hoveredIndex?: number | null;
    /** Callback when hover state changes */
    onHoverChange?: (index: number | null) => void;
    /** Additional class name for the container */
    className?: string;
    /** Child components (RadarGrid, RadarAxis, RadarLabels, RadarArea) */
    children: ReactNode;
}
export declare function RadarChart({ data, metrics, size: fixedSize, levels, margin, animate, enterDurationMs, staggerScale, enterTransition, motionReplayKey, className, hoveredIndex, onHoverChange, children, }: RadarChartProps): import("react").JSX.Element;
export default RadarChart;
