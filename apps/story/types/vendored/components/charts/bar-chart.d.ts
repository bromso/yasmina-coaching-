import type { Transition } from "motion/react";
import { type ReactNode } from "react";
import { type Margin } from "./chart-context";
import { type ChartPhase, type ChartStatus } from "./chart-phase";
export type BarOrientation = "vertical" | "horizontal";
export interface BarChartProps {
    /** Data array - each item should have an x-axis key and numeric values */
    data: Record<string, unknown>[];
    /** Key in data for the categorical axis. Default: "name" */
    xDataKey?: string;
    /** Chart margins */
    margin?: Partial<Margin>;
    /** Animation duration in milliseconds. Default: 1100 */
    animationDuration?: number;
    /** CSS easing for bar grow transitions. */
    animationEasing?: string;
    /** Motion enter transition (spring or cubic-bezier tween). */
    enterTransition?: Transition;
    /** Signature of motion URL state — triggers enter replay when it changes. */
    revealSignature?: string;
    /** Aspect ratio as "width / height". Default: "2 / 1" */
    aspectRatio?: string;
    /** Additional class name for the container */
    className?: string;
    /** Gap between bar groups as a fraction of band width (0-1). Default: 0.2 */
    barGap?: number;
    /** Fixed bar width in pixels. If not set, bars auto-size to fill the band. */
    barWidth?: number;
    /** Bar chart orientation. Default: "vertical" */
    orientation?: BarOrientation;
    /** Whether to stack bars instead of grouping them. Default: false */
    stacked?: boolean;
    /** Gap between stacked bar segments in pixels. Default: 0 */
    stackGap?: number;
    /** When set, tooltip Y positions snap to the top square center (shape variant). */
    squareSnap?: {
        squareGap: number;
        groupGap?: number;
        fit?: boolean;
    };
    /** Child components (Bar, Grid, ChartTooltip, etc.). Optional — omit for a
     * pure `status="loading"` skeleton. */
    children?: ReactNode;
    /** Reports reveal lifecycle for OG screenshots and loading orchestration. */
    onPhaseChange?: (phase: ChartPhase) => void;
    /** Fetch / display status. When `"loading"`, a shimmer skeleton replaces the
     * bars (no chart data required). Default: `"ready"`. */
    status?: ChartStatus;
}
export declare function BarChart({ data, xDataKey, margin: marginProp, animationDuration, animationEasing, enterTransition, revealSignature, aspectRatio, className, barGap, barWidth, orientation, stacked, stackGap, squareSnap, children, onPhaseChange, status, }: BarChartProps): import("react").JSX.Element;
export declare namespace BarChart {
    var displayName: string;
}
export default BarChart;
