import type { Transition } from "motion/react";
import { type ReactNode } from "react";
import type { Margin } from "../chart-context";
import { type ChartStatus } from "../chart-phase";
import type { HeatmapLevelColors, HeatmapLevelStyles } from "./heatmap-colors";
import { type HeatmapColumn } from "./heatmap-context";
import { type HeatmapSeparatorParsedConfig, type HeatmapWeekStartDay } from "./heatmap-utils";
export type HeatmapLayout = "fluid" | "fill";
export interface HeatmapChartProps {
    /** Column data — one entry per week (or category) with row bins inside. */
    data: HeatmapColumn[];
    /** Visible time range — filters week columns that overlap the domain. */
    xDomain?: [Date, Date];
    /**
     * Week columns used for cell sizing when `xDomain` is set. Keeps bin height
     * stable while scrubbing (filtered columns can vary by ±1 at boundaries).
     */
    sizingColumnCount?: number;
    /**
     * `fluid` — width drives square cells; chart height hugs the grid (GitHub-style).
     * `fill` — expands cells to fill the parent.
     */
    layout?: HeatmapLayout;
    /** Chart margins */
    margin?: Partial<Margin>;
    /** Fixed cell size in pixels. When 0, cells are square and sized to fit the plot. Default: 0 */
    binSize?: number;
    /** Gap between cells in pixels. Default: 2 */
    gap?: number;
    /** Override the default color scale. */
    colorScale?: (count: number | null | undefined) => string;
    /** Per-level colors for the Less → More scale (5 entries). */
    levelColors?: HeatmapLevelColors;
    /** Per-level fill styles (color and optional pattern). Takes precedence over `levelColors`. */
    levelStyles?: HeatmapLevelStyles;
    /** Optional outer aspect ratio (e.g. "2 / 1"). Omit to fill the parent. */
    aspectRatio?: string;
    /** Additional class name for the container */
    className?: string;
    /** Fetch / display status. Default: `"ready"`. */
    status?: ChartStatus;
    /** Centered label while loading. */
    loadingLabel?: string;
    /** Enter animation duration in milliseconds. Default: 1600 */
    animationDuration?: number;
    /** Motion enter transition (spring or cubic-bezier tween). */
    enterTransition?: Transition;
    /** Signature of motion URL state — triggers enter replay when it changes. */
    revealSignature?: string;
    /** Scales wave stagger delays (1 = default). */
    enterStaggerScale?: number;
    /** Play enter fade-in / loading shimmer animations. Default: true */
    animate?: boolean;
    /** Chart opacity while loading. Default: 0.5 */
    loadingOpacity?: number;
    /** Show loading cell shimmer while loading. Default: true */
    showLoadingCells?: boolean;
    /** Max opacity loading cells animate toward (0–1). Default: 0.5 */
    loadingCellMaxOpacity?: number;
    /** Share of cells that participate in loading shimmer (0–1). Default: 0.65 */
    loadingCellRandomness?: number;
    /**
     * Inserts horizontal gaps between column groups. Overridden when a
     * {@link HeatmapSeparator} child sets `every` / `spacing`.
     */
    columnSeparators?: HeatmapSeparatorParsedConfig;
    /**
     * First row of the grid — `0` = Sunday (GitHub default), `1` = Monday, etc.
     * Rotates column bins for display without reshaping source data.
     */
    weekStartDay?: HeatmapWeekStartDay;
    /** Child components (HeatmapCells, HeatmapXAxis, HeatmapYAxis) */
    children: ReactNode;
}
export declare function HeatmapChart({ data, xDomain, sizingColumnCount, layout, margin: marginProp, binSize, gap, colorScale: colorScaleProp, levelColors, levelStyles: levelStylesProp, aspectRatio, className, status, loadingLabel, animationDuration, enterTransition, revealSignature, enterStaggerScale, animate, loadingOpacity, showLoadingCells, loadingCellMaxOpacity, loadingCellRandomness, columnSeparators, weekStartDay, children, }: HeatmapChartProps): import("react").JSX.Element;
export declare namespace HeatmapChart {
    var displayName: string;
}
export default HeatmapChart;
