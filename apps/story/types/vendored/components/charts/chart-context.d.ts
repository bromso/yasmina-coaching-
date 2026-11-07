import type { scaleBand, scaleLinear, scaleTime } from "@visx/scale";
type ScaleLinear<Output, _Input = number> = ReturnType<typeof scaleLinear<Output>>;
type ScaleTime<Output, _Input = Date | number> = ReturnType<typeof scaleTime<Output>>;
type ScaleBand<Domain extends {
    toString(): string;
}> = ReturnType<typeof scaleBand<Domain>>;
import type { Transition } from "motion/react";
import { type Dispatch, type ReactNode, type RefObject, type SetStateAction } from "react";
import type { ChartPhase, ChartStatus } from "./chart-phase";
import type { ReferenceAreaConfig } from "./reference-area-config";
import type { ChartSelection } from "./use-chart-interaction";
import type { YDomain } from "./y-domain-utils";
export declare const chartCssVars: {
    background: string;
    foreground: string;
    foregroundMuted: string;
    label: string;
    linePrimary: string;
    lineSecondary: string;
    crosshair: string;
    grid: string;
    indicatorColor: string;
    indicatorSecondaryColor: string;
    markerBackground: string;
    markerBorder: string;
    markerForeground: string;
    badgeBackground: string;
    badgeForeground: string;
    segmentBackground: string;
    segmentLine: string;
    brushBorder: string;
    tooltipBackground: string;
};
/** Default scatter series colors from the chart palette (`--chart-1` … `--chart-5`). */
export declare const defaultScatterColors: readonly ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
export interface Margin {
    top: number;
    right: number;
    bottom: number;
    left: number;
}
export interface TooltipData {
    /** The data point being hovered */
    point: Record<string, unknown>;
    /** Index in the data array */
    index: number;
    /** X position in pixels (relative to chart area) */
    x: number;
    /** Y positions for each line, keyed by dataKey */
    yPositions: Record<string, number>;
    /** X positions for each series (for grouped bars), keyed by dataKey */
    xPositions?: Record<string, number>;
}
export interface LineConfig {
    dataKey: string;
    stroke: string;
    strokeWidth: number;
    /** Scale group id (Recharts `yAxisId`). Default: `"left"`. */
    yAxisId?: string | number;
}
/**
 * Hover/selection state — every field here changes on mouse movement.
 * Lives in its own context so cold consumers (Grid, YAxis, PatternArea, …)
 * can subscribe to the stable slice and skip re-rendering on every hover.
 */
export interface ChartHoverContextValue {
    tooltipData: TooltipData | null;
    setTooltipData: Dispatch<SetStateAction<TooltipData | null>>;
    /** Current drag/pinch selection range */
    selection?: ChartSelection | null;
    /** Clear the current selection */
    clearSelection?: () => void;
    /** Index of currently hovered bar */
    hoveredBarIndex?: number | null;
    /** Setter for hovered bar index */
    setHoveredBarIndex?: (index: number | null) => void;
    /** Index of currently hovered candle */
    hoveredCandleIndex?: number | null;
    /** Setter for hovered candle index */
    setHoveredCandleIndex?: (index: number | null) => void;
}
export interface ChartContextValue extends ChartHoverContextValue {
    data: Record<string, unknown>[];
    /** Decimated subset for SVG path rendering; equals `data` when no decimation is needed. */
    renderData: Record<string, unknown>[];
    xScale: ScaleTime<number, number>;
    /** Primary (left) y-scale — alias for `yScales[DEFAULT_Y_AXIS_ID]`. */
    yScale: ScaleLinear<number, number>;
    /** Per-axis y-scales keyed by `yAxisId`. */
    yScales: Record<string, ScaleLinear<number, number>>;
    width: number;
    height: number;
    innerWidth: number;
    innerHeight: number;
    margin: Margin;
    columnWidth: number;
    containerRef: RefObject<HTMLDivElement | null>;
    lines: LineConfig[];
    /** {@link ReferenceArea} bands — drives y-axis label colors in range. */
    referenceAreas: ReferenceAreaConfig[];
    chartPhase: ChartPhase;
    chartStatus: ChartStatus;
    /** Centered label while `chartPhase` shows loading chrome. */
    loadingLabel?: string;
    /** Y-domain tween duration when transitioning loading ↔ ready (ms). */
    yDomainTweenDuration: number;
    /** Nice’d y-domains per axis from skeleton data (placeholder). */
    yDomainSkeletonByAxis: Record<string, YDomain>;
    /** Nice’d y-domains per axis from the current target data. */
    yDomainTargetByAxis: Record<string, YDomain>;
    isLoaded: boolean;
    animationDuration: number;
    /** CSS easing for clip-reveal / line draw (cartesian charts). */
    animationEasing?: string;
    /** Motion enter transition (spring or tween) — drives clip reveal when spring. */
    enterTransition?: Transition;
    /** Increments when enter animation should replay. */
    revealEpoch?: number;
    /** Fired when a one-shot loading pulse (exit / enter) completes. */
    notifyLoadingPulseComplete?: () => void;
    xAccessor: (d: Record<string, unknown>) => Date;
    dateLabels: string[];
    /** Active brush zoom range — when set, axis ticks align to visible data rows. */
    xDomain?: [Date, Date];
    /** Full dataset length when brush zoom is enabled (for zoom vs full-range detection). */
    xDomainSlotCount?: number;
    /** Band scale for categorical x-axis (bar charts) */
    barScale?: ScaleBand<string>;
    /** Width of each bar band */
    bandWidth?: number;
    /** X accessor for bar charts (returns string instead of Date) */
    barXAccessor?: (d: Record<string, unknown>) => string;
    /** Bar chart orientation */
    orientation?: "vertical" | "horizontal";
    /** Whether bars are stacked */
    stacked?: boolean;
    /** Stack offsets: Map of data index -> Map of dataKey -> cumulative offset */
    stackOffsets?: Map<number, Map<string, number>>;
    /** Squares variant — snap tooltip to top square and size ring dots. */
    squareSnap?: {
        squareGap: number;
        groupGap?: number;
        fit?: boolean;
    };
    /** `SeriesBar` dataKeys in tree order, for grouped columns at each x */
    composedBarDataKeys?: string[];
    /** Target bar width in px (Recharts `barSize` style). */
    composedBarSize?: number;
    /** Max bar width in px (Recharts `maxBarSize`). */
    composedMaxBarSize?: number;
    /** Gap between grouped `SeriesBar` columns in px. */
    composedBarGap?: number;
    /** When true, `SeriesBar` segments stack in child order at each x. */
    composedStacked?: boolean;
    /** Per-row cumulative offsets for stacked `SeriesBar` (data index → dataKey → offset). */
    composedStackOffsets?: Map<number, Map<string, number>>;
    /** Vertical gap in px between stacked `SeriesBar` segments. Default: 0 */
    composedStackGap?: number;
}
/**
 * Stable slice of the chart context — everything that doesn't change on hover
 * (data, scales, dimensions, animation state, layout config). Consumers that
 * subscribe via `useChartStable()` skip re-renders on every mouse move.
 */
export type ChartStableContextValue = Omit<ChartContextValue, keyof ChartHoverContextValue>;
declare const ChartStableContext: import("react").Context<ChartStableContextValue | null>;
/**
 * Splits the merged `value` into a stable slice and a volatile hover slice,
 * publishing each to its own context. Each slice is memoized on its own
 * field identities, so changing `tooltipData` does not bust the stable
 * slice — consumers of `useChartStable()` skip re-renders on hover.
 */
export declare function ChartProvider({ children, value, }: {
    children: ReactNode;
    value: ChartContextValue;
}): import("react").JSX.Element;
/**
 * Stable slice — data, scales, dimensions, animation state, layout config.
 * Subscribers skip re-renders on hover (the hover slice lives in a separate
 * context). Prefer this in cold consumers like axes, grid, pattern fills.
 */
export declare function useChartStable(): ChartStableContextValue;
/** Y-scale for a series axis (`yAxisId` on Line / Area / YAxis). */
export declare function useYScale(yAxisId?: string | number): ScaleLinear<number, number>;
/**
 * Hover slice — tooltipData, selection, hovered bar / candle indices.
 * Subscribers re-render on every mouse move. Use only when the component
 * actually reads hover state.
 */
export declare function useChartHover(): ChartHoverContextValue;
/**
 * Merged stable + hover context. Convenient for components that need both,
 * but re-renders on every hover (because hover changes). Prefer
 * `useChartStable()` or `useChartHover()` for hot consumers that only need
 * one slice.
 */
export declare function useChart(): ChartContextValue;
export default ChartStableContext;
