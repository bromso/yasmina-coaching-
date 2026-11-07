import type { scaleLinear, scaleTime } from "@visx/scale";
import type { Transition } from "motion/react";
import { type Dispatch, type ReactNode, type RefObject, type SetStateAction } from "react";
import type { Margin } from "../chart-context";
import type { ChartPhase, ChartStatus } from "../chart-phase";
import { type HeatmapLevelStyles } from "./heatmap-colors";
import type { HeatmapSeparatorLayout, HeatmapWeekStartDay } from "./heatmap-utils";
type HeatmapTimeScale = ReturnType<typeof scaleTime<number>>;
type HeatmapLinearScale = ReturnType<typeof scaleLinear<number>>;
export interface HeatmapBin {
    count: number;
    bin: number;
    date: Date;
}
export interface HeatmapColumn {
    bin: number;
    bins: HeatmapBin[];
}
export interface HeatmapTooltipData {
    column: number;
    row: number;
    count: number;
    date: Date;
    x: number;
    y: number;
}
export interface HeatmapInteractionContextValue {
    hoveredCell: {
        column: number;
        row: number;
    } | null;
    hoveredLegendLevel: number | null;
    tooltipData: HeatmapTooltipData | null;
    setHoveredCell: (cell: {
        column: number;
        row: number;
    } | null) => void;
    setHoveredLegendLevel: (level: number | null) => void;
    setTooltipData: Dispatch<SetStateAction<HeatmapTooltipData | null>>;
    clearInteraction: () => void;
}
export interface HeatmapContextValue {
    data: HeatmapColumn[];
    width: number;
    height: number;
    innerWidth: number;
    innerHeight: number;
    margin: Margin;
    binWidth: number;
    binHeight: number;
    gap: number;
    weekStartDay: HeatmapWeekStartDay;
    xScale: (columnIndex: number) => number;
    yScale: (rowIndex: number) => number;
    separatorLayout: HeatmapSeparatorLayout | null;
    timeXScale: HeatmapTimeScale;
    brushYScale: HeatmapLinearScale;
    isReady: boolean;
    colorScale: (count: number | null | undefined) => string;
    fillScale: (count: number | null | undefined) => string;
    levelStyles: HeatmapLevelStyles;
    containerRef: RefObject<HTMLDivElement | null>;
    chartStatus: ChartStatus;
    chartPhase: ChartPhase;
    isLoaded: boolean;
    revealEpoch: number;
    animationDuration: number;
    enterTransition?: Transition;
    enterStaggerScale: number;
    animateCells: boolean;
    loadingOpacity: number;
    showLoadingCells: boolean;
    loadingCellMaxOpacity: number;
    loadingCellRandomness: number;
    revealMode: HeatmapRevealMode;
    loadingLabel?: string;
    showLoadingLabel: boolean;
}
/** How cells transition into view after loading or on first mount. */
export type HeatmapRevealMode = "enter" | "fromLoading" | null;
export declare function HeatmapInteractionProvider({ children }: {
    children: ReactNode;
}): import("react").JSX.Element;
export declare function HeatmapProvider({ children, value, }: {
    children: ReactNode;
    value: HeatmapContextValue;
}): import("react").JSX.Element;
export declare function useHeatmap(): HeatmapContextValue;
export declare function useHeatmapInteraction(): HeatmapInteractionContextValue;
export declare function useHeatmapInteractionOptional(): HeatmapInteractionContextValue | null;
/** Clears hover state when the pointer leaves chart + legend. */
export declare function HeatmapInteractionBoundary({ children, className, }: {
    children: ReactNode;
    className?: string;
}): import("react").JSX.Element;
/** Nests a provider only when one is not already present upstream. */
export declare function HeatmapInteractionRoot({ children }: {
    children: ReactNode;
}): string | number | bigint | boolean | Iterable<ReactNode> | Promise<string | number | bigint | boolean | import("react").ReactPortal | import("react").ReactElement<unknown, string | import("react").JSXElementConstructor<any>> | Iterable<ReactNode> | null | undefined> | import("react").JSX.Element | null | undefined;
/** @deprecated Use {@link HEATMAP_DEFAULT_LEVEL_COLORS} */
export declare const heatmapCssVars: {
    readonly empty: "var(--chart-scale-01)";
    readonly level1: "var(--chart-scale-02)";
    readonly level2: "var(--chart-scale-03)";
    readonly level3: "var(--chart-scale-04)";
    readonly level4: "var(--chart-scale-05)";
};
export {};
