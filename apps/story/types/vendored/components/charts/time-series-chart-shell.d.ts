import type { Transition } from "motion/react";
import { type ReactNode } from "react";
import { type LineConfig, type Margin } from "./chart-context";
import { type ChartPhase, type ChartStatus } from "./chart-phase";
export interface TimeSeriesChartInnerProps {
    width: number;
    height: number;
    data: Record<string, unknown>[];
    xDataKey: string;
    margin: Margin;
    animationDuration: number;
    animationEasing?: string;
    enterTransition?: Transition;
    /** Signature of motion URL state — triggers reveal replay when it changes. */
    revealSignature?: string;
    children: ReactNode;
    containerRef: React.RefObject<HTMLDivElement | null>;
    /** Series keys driving y-domain and tooltip (Line / Area / SeriesBar configs). */
    lines: LineConfig[];
    /**
     * Base SVG clipPath id for grow animation. Uniquified per chart instance so
     * multiple charts on one page do not share a clipPath (#226).
     */
    clipPathId: string;
    /** Optional ComposedChart bar layout (forwarded into context). */
    composedBarDataKeys?: string[];
    composedBarSize?: number;
    composedMaxBarSize?: number;
    composedBarGap?: number;
    composedStacked?: boolean;
    composedStackOffsets?: Map<number, Map<string, number>>;
    composedStackGap?: number;
    /** When set, drives the y-axis max instead of scanning `lines` (e.g. stacked bar totals). */
    yScaleDomainMax?: number;
    /** Loading vs ready — drives chart phase until transition orchestration lands. */
    chartStatus?: ChartStatus;
    loadingLabel?: string;
    /** Animate y-domain on status / data transitions. Default: true */
    yDomainTween?: boolean;
    yDomainTweenDuration?: number;
    /** Visible x-domain for brush zoom. When set, y-domain and series use data in this range. */
    xDomain?: [Date, Date];
    /** Full dataset length for x-scale padding when `xDomain` is set. */
    xDomainSlotCount?: number;
    /** Tween y-domain when the visible x-range changes during the ready phase. */
    tweenYDomainOnXDomainChange?: boolean;
    onPhaseChange?: (phase: ChartPhase) => void;
}
export declare function TimeSeriesChartInner(props: TimeSeriesChartInnerProps): import("react").JSX.Element | null;
