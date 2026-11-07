import type { Transition } from "motion/react";
import { type ReactNode } from "react";
import type { Margin } from "./chart-context";
import type { ChartPhase } from "./chart-phase";
export interface ComposedChartProps {
    /** Data array — each row typically has a date and multiple numeric series */
    data: Record<string, unknown>[];
    /** Key for the x-axis (time). Default: "date" */
    xDataKey?: string;
    margin?: Partial<Margin>;
    animationDuration?: number;
    animationEasing?: string;
    enterTransition?: Transition;
    /** Signature of motion URL state — triggers reveal replay when it changes. */
    revealSignature?: string;
    aspectRatio?: string;
    className?: string;
    children: ReactNode;
    /** Target bar width in px (Recharts-style `barSize`). */
    barSize?: number;
    /** Maximum bar width in px (`maxBarSize`). */
    maxBarSize?: number;
    /** Gap between grouped `SeriesBar` series in px. Default: 4 */
    barGap?: number;
    /** Stack `SeriesBar` segments in child order at each x (line/area are not stacked). */
    stacked?: boolean;
    /** Gap in px between stacked segments. Default: 0 */
    stackGap?: number;
    onPhaseChange?: (phase: ChartPhase) => void;
}
export declare function ComposedChart({ data, xDataKey, margin: marginProp, animationDuration, animationEasing, enterTransition, revealSignature, aspectRatio, className, children, barSize, maxBarSize, barGap, stacked, stackGap, onPhaseChange, }: ComposedChartProps): import("react").JSX.Element;
export declare namespace ComposedChart {
    var displayName: string;
}
export default ComposedChart;
