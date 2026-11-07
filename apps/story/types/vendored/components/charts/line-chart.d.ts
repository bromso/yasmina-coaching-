import type { Transition } from "motion/react";
import { type CSSProperties, type ReactNode } from "react";
import type { Margin } from "./chart-context";
import { type ChartPhase, type ChartStatus } from "./chart-phase";
export interface LineChartProps {
    /** Data array - each item should have a date field and numeric values */
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
    /** Aspect ratio as "width / height". Default: "2 / 1". Omit to fill a sized parent. */
    aspectRatio?: string;
    /** Additional class name for the container */
    className?: string;
    /** Loading vs ready — drives chart phase and loading chrome. Default: `"ready"`. */
    status?: ChartStatus;
    /** Centered shimmer label while loading. */
    loadingLabel?: string;
    /** Animate y-domain over this duration (ms) on status transitions. Default: 500. */
    yDomainTweenDuration?: number;
    /** Animate y-domain when status or target domain changes. Default: true */
    yDomainTween?: boolean;
    /** Visible x-domain for brush zoom. */
    xDomain?: [Date, Date];
    /** Full dataset length for x-scale padding when `xDomain` is set. */
    xDomainSlotCount?: number;
    /** Tween y-domain when brush changes the visible x-range. Default: false */
    tweenYDomainOnXDomainChange?: boolean;
    /** Inline container styles (e.g. fixed height for brush strip). */
    style?: CSSProperties;
    /** Fires when the internal chart phase changes (e.g. OG capture readiness). */
    onPhaseChange?: (phase: ChartPhase) => void;
    /** Child components (Line, Grid, ChartTooltip, etc.) */
    children: ReactNode;
}
export declare function LineChart({ data, xDataKey, margin: marginProp, animationDuration, animationEasing, enterTransition, revealSignature, aspectRatio, className, status, loadingLabel, yDomainTweenDuration, yDomainTween, xDomain, xDomainSlotCount, tweenYDomainOnXDomainChange, style, onPhaseChange, children, }: LineChartProps): import("react").JSX.Element;
export { Line, type LineProps } from "./line";
export default LineChart;
