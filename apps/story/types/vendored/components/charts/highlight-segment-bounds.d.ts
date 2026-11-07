import type { TooltipData } from "./chart-context";
import type { ChartSelection } from "./use-chart-interaction";
export interface SegmentBounds {
    /** Left edge of the highlight band, in pixels. */
    x: number;
    /** Width of the highlight band, in pixels. */
    width: number;
    isActive: boolean;
}
export declare const INACTIVE_SEGMENT: SegmentBounds;
/**
 * The highlight band `{x, width}` in pixel space, from the data + `xScale` plus
 * the current hover/selection. Hover spans one data point either side of the dot
 * (clamped to the ends); an active drag-selection uses the dragged pixel range
 * directly and takes priority over hover.
 */
export declare function computeSegmentBounds(data: Record<string, unknown>[], xScale: (value: Date) => number | undefined, xAccessor: (d: Record<string, unknown>) => Date, tooltipData: Pick<TooltipData, "index"> | null | undefined, selection: Pick<ChartSelection, "active" | "startX" | "endX"> | null | undefined): SegmentBounds;
