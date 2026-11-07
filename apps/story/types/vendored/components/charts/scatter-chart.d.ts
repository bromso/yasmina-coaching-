import type { Transition } from "motion/react";
import { type ReactNode } from "react";
import { type Margin } from "./chart-context";
import type { ChartPhase } from "./chart-phase";
export interface ScatterChartProps {
    /** Data array — each item should have a date field and numeric values */
    data: Record<string, unknown>[];
    /** Key in data for the x-axis (date). Default: "date" */
    xDataKey?: string;
    /** Chart margins */
    margin?: Partial<Margin>;
    /** Animation duration in milliseconds. Default: 1100 */
    animationDuration?: number;
    /** CSS easing for clip-reveal. Default: cubic-bezier(0.85, 0, 0.15, 1) */
    animationEasing?: string;
    enterTransition?: Transition;
    revealSignature?: string;
    /** Aspect ratio as "width / height". Default: "2 / 1" */
    aspectRatio?: string;
    /** Additional class name for the container */
    className?: string;
    /** Child components (Scatter, Grid, ChartTooltip, XAxis, etc.) */
    children: ReactNode;
    onPhaseChange?: (phase: ChartPhase) => void;
}
export declare function ScatterChart({ data, xDataKey, margin: marginProp, animationDuration, animationEasing, enterTransition, revealSignature, aspectRatio, className, children, onPhaseChange, }: ScatterChartProps): import("react").JSX.Element;
export declare namespace ScatterChart {
    var displayName: string;
}
export { Scatter, type ScatterProps } from "./scatter";
export default ScatterChart;
