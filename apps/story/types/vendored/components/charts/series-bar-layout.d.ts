export declare function computeSeriesBarWidth(input: {
    innerWidth: number;
    dataLength: number;
    columnWidth: number;
    seriesCount: number;
    composedBarSize?: number;
    composedMaxBarSize?: number;
    composedBarGap?: number;
    stacked?: boolean;
}): number;
/** Half-width of the bar group at each x — used to pad reveal clips. */
export declare function computeSeriesBarRevealClipPadding(input: {
    barWidth: number;
    seriesCount: number;
    gap?: number;
    stacked?: boolean;
}): number;
