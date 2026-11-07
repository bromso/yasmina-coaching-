import type { HeatmapLevelStyles } from "./heatmap-colors";
import type { HeatmapBin, HeatmapColumn } from "./heatmap-context";
/** Calendar months shown in default one-year contribution grids. */
export declare const HEATMAP_MONTHS_ONE_YEAR = 12;
/** Half-year contribution grids (gallery card demos). */
export declare const HEATMAP_MONTHS_SIX = 6;
/** Nominal week count for one year (~52). Default data uses calendar-month math instead. */
export declare const HEATMAP_WEEKS_ONE_YEAR = 52;
export declare function getHeatmapCalendarRangeStart(today: Date, months: number): Date;
export declare function getHeatmapYearStartMonth(today: Date): Date;
export declare function getHeatmapWeekStartSunday(date: Date): Date;
export declare function getHeatmapWeekCount(startSunday: Date, endDate: Date): number;
/** Days in a Sun–Sat column on or after `threshold` (for trimming partial lead weeks). */
export declare function countHeatmapWeekDaysOnOrAfter(weekStart: Date, threshold: Date): number;
/**
 * First Sunday week column where enough days fall on/after `rangeStart`.
 * Skips a lead week that is mostly before the range (e.g. late July before Aug 1).
 */
export declare function getHeatmapWeekStartAlignedToRange(rangeStart: Date, minDaysInFirstWeek?: number): Date;
/** Column index for a month label — snaps to separator group start when layout is set. */
export declare function getHeatmapMonthLabelColumnIndex(columnIndex: number, separatorLayout: Pick<HeatmapSeparatorLayout, "atColumns"> | null): number;
export interface HeatmapWeekRange {
    startDate: Date;
    weekCount: number;
    /** First in-range calendar day; bins before this are empty in default year grids. */
    rangeStart: Date | null;
}
/** Default `weeks` uses 12 calendar months; other values use a rolling week window. */
export declare function resolveHeatmapWeekRange(today: Date, weeks?: number): HeatmapWeekRange;
/** Month label anchor for a week column — prefers the 1st, else the 1st of the first bin's month. */
export declare function getHeatmapColumnMonthAnchor(column: HeatmapColumn): Date | null;
export declare function getHeatmapColumnStartDate(column: HeatmapColumn): Date | null;
export declare function getHeatmapColumnEndDate(column: HeatmapColumn): Date | null;
export declare function getHeatmapTimeExtent(columns: HeatmapColumn[]): [Date, Date] | null;
export declare function filterHeatmapColumns(columns: HeatmapColumn[], xDomain?: [Date, Date]): HeatmapColumn[];
/** Tooltip header date — e.g. `January 20th 2026`. */
export declare function formatHeatmapTooltipDate(date: Date): string;
/** Tooltip weekday line — e.g. `Monday`. */
export declare function formatHeatmapTooltipWeekday(date: Date): string;
/** Tooltip contribution line — e.g. `3 contributions`. */
export declare function formatHeatmapContributionLabel(count: number, _date?: Date): string;
/** Sunday-first day labels for heatmap row bins. */
export declare const HEATMAP_DAY_LABELS: readonly ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** First row of the grid — `0` = Sunday (GitHub default). */
export type HeatmapWeekStartDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;
/** Day labels with row 0 aligned to `weekStartDay`. */
export declare function getHeatmapDayLabels(weekStartDay?: HeatmapWeekStartDay): readonly string[];
/** Rotates Sun-first column bins so display row 0 starts on `weekStartDay`. */
export declare function rotateHeatmapColumnBins(columns: HeatmapColumn[], weekStartDay?: HeatmapWeekStartDay): HeatmapColumn[];
/** Which Y-axis row ticks to display. */
export type HeatmapYAxisTickFilter = "all" | "odd" | "even";
/** Y-axis label display — `initial` shows the first letter only (Mon → M). */
export type HeatmapYAxisLabelFormat = "full" | "initial";
export declare function formatHeatmapYAxisLabel(label: string, labelFormat: HeatmapYAxisLabelFormat): string;
export declare function shouldShowHeatmapYAxisTick(row: number, tickFilter: HeatmapYAxisTickFilter): boolean;
/** Layout spacing parsed from {@link HeatmapSeparator}. */
export type HeatmapSeparatorGroupBy = "every" | "quarter";
/** Separator config from props — resolved to column indices once data is known. */
export interface HeatmapSeparatorParsedConfig {
    groupBy: HeatmapSeparatorGroupBy;
    every?: number;
    spacing: number;
}
export interface HeatmapSeparatorGroup {
    startColumnIndex: number;
    quarter: number;
    year: number;
    startDate: Date;
    label: string;
}
/** Resolved separator layout used for column offsets and rendering. */
export interface HeatmapSeparatorLayout {
    spacing: number;
    atColumns: number[];
    groups: HeatmapSeparatorGroup[];
}
/** Separator line style. */
export type HeatmapSeparatorStrokeStyle = "solid" | "dashed";
/** Vertical stroke gradient for separator lines (`from` → optional `via` → `to`). */
export interface HeatmapSeparatorGradient {
    from: string;
    via?: string;
    to: string;
    fromOpacity?: number;
    viaOpacity?: number;
    toOpacity?: number;
}
export interface HeatmapSeparatorGradientStop {
    offset: string;
    color: string;
    opacity: number;
}
/** Builds SVG gradient stops for a vertical separator line. */
export declare function buildHeatmapSeparatorGradientStops(gradient: HeatmapSeparatorGradient, strokeOpacity?: number): HeatmapSeparatorGradientStop[];
export declare function resolveHeatmapSeparatorStrokeDasharray(strokeStyle?: HeatmapSeparatorStrokeStyle, strokeDasharray?: string): string | undefined;
/** Calendar quarter (1–4) for Jan–Mar, Apr–Jun, Jul–Sep, Oct–Dec. */
export declare function getCalendarQuarter(date: Date): number;
/** Jan/Apr/Jul/Oct 1 dates strictly after `gridStart` and on or before `gridEnd`. */
export declare function getCalendarQuarterStartDatesBetween(gridStart: Date, gridEnd: Date): Date[];
/** Week column index whose Sun–Sat span contains `date`. */
export declare function findHeatmapColumnIndexForDate(columns: HeatmapColumn[], date: Date): number | null;
/** Quarter anchor for a week column — prefers the 1st of a quarter month, else the quarter of the first bin. */
export declare function getHeatmapColumnQuarterAnchor(column: HeatmapColumn): {
    quarter: number;
    year: number;
    date: Date;
} | null;
/** Label column snapped to the start of a separator group. */
export declare function getHeatmapSeparatorGroupStartColumn(columnIndex: number, atColumns: number[]): number;
/** Column indices (0-based) where a vertical separator is drawn (fixed interval). */
export declare function getHeatmapSeparatorColumnIndices(columnCount: number, every: number): number[];
/** Matches demo-style calendar grids to their range start (Jan 1, etc.). */
export declare function inferHeatmapCalendarRangeStart(columns: HeatmapColumn[]): Date | null;
export declare function buildHeatmapQuarterSeparatorGroups(columns: HeatmapColumn[]): HeatmapSeparatorGroup[];
export declare function resolveHeatmapSeparatorLayout(config: HeatmapSeparatorParsedConfig | null, columns: HeatmapColumn[]): HeatmapSeparatorLayout | null;
export declare function getHeatmapSeparatorCount(separator: Pick<HeatmapSeparatorLayout, "atColumns"> | null): number;
/** Extra x-offset for a column when separator spacing is enabled. */
export declare function getHeatmapColumnXOffset(columnIndex: number, separator: Pick<HeatmapSeparatorLayout, "spacing" | "atColumns"> | null): number;
export declare function getHeatmapPlotInnerWidth(columnCount: number, binWidth: number, separator: Pick<HeatmapSeparatorLayout, "spacing" | "atColumns"> | null): number;
/** Vertical span for a separator line in plot coordinates. */
export declare function getHeatmapSeparatorLineY({ innerHeight, marginTop, startOffset, paddingY, }: {
    innerHeight: number;
    marginTop: number;
    /** Distance from the chart container top to the line start. Default: plot top. */
    startOffset?: number;
    paddingY?: number;
}): {
    y1: number;
    y2: number;
};
/** X position for a separator line (centered in the gutter when spacing > 0). */
export declare function getHeatmapSeparatorX(columnIndex: number, gap: number, separator: Pick<HeatmapSeparatorLayout, "spacing">, xScale: (columnIndex: number) => number): number;
export interface HeatmapDisplayRange {
    start: Date | null;
    end: Date | null;
}
/** Whether a bin falls outside the contribution display window (not merely inactive). */
export declare function isHeatmapGhostBin(bin: HeatmapBin, range: HeatmapDisplayRange): boolean;
/**
 * Infers GitHub-style display range for calendar-month contribution grids.
 * Custom data that does not match a known grid shape returns null bounds (show all).
 */
export declare function resolveHeatmapDisplayRange(columns: HeatmapColumn[]): HeatmapDisplayRange;
/** Maps a contribution count to the GitHub-style legend level (0–4). */
export declare function getHeatmapContributionLevel(count: number): number;
export interface HeatmapHoverStyleParams {
    inactiveOpacity: number;
    inactiveScale: number;
    activeScale: number;
}
/** Whether hover styling runs (disabled when all scale/opacity props are 1). */
export declare function isHeatmapHoverEffectEnabled(params: HeatmapHoverStyleParams): boolean;
/** Whether inactive hover styling runs (disabled when both props are 1). */
export declare function isHeatmapInactiveEffectEnabled(inactiveOpacity: number, inactiveScale: number): boolean;
/** Opacity and scale for highlighted vs dimmed cells and legend swatches. */
export declare function resolveHeatmapHoverStyle(isHighlighted: boolean, isDimmed: boolean, params: HeatmapHoverStyleParams): {
    opacity: number;
    scale: number;
};
/** Opacity and scale for an inactive cell or legend swatch. */
export declare function resolveHeatmapInactiveStyle(isInactive: boolean, inactiveOpacity: number, inactiveScale: number): {
    opacity: number;
    scale: number;
};
/** Per-row opacity multiplier for display rows (default 1). */
export declare function resolveHeatmapRowOpacity(row: number, rowOpacity?: number | readonly number[]): number;
/**
 * Builds a per-row opacity map for {@link HeatmapCells} and {@link HeatmapYAxis}.
 * Pass explicit row indices (e.g. `[5, 6]` for display Sat/Sun when `weekStartDay={1}`)
 * or a predicate — `(row) => row >= 5` fades the last two rows.
 */
export declare function buildHeatmapRowOpacity(match: readonly number[] | ((row: number) => boolean), fadedOpacity?: number, activeOpacity?: number, rowCount?: number): number[];
/** CSS `linear-gradient` for a continuous legend bar from level styles. */
export declare function buildHeatmapLegendGradient(levelStyles: HeatmapLevelStyles): string;
