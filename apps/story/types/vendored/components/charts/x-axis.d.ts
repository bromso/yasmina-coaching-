export interface XAxisProps {
    /** Number of ticks to show (including first and last). Default: 5. */
    numTicks?: number;
    /** Width of the date ticker box for fade calculation. Default: 50 */
    tickerHalfWidth?: number;
    /**
     * `"data"` — tick labels snap to data rows so crosshair and tooltip stay aligned (default).
     * `"domain"` — evenly spaced ticks across the time domain (may not align with hover).
     */
    tickMode?: "domain" | "data";
}
/**
 * Picks tick indices with the most even on-screen spacing. Tries
 * `targetCount ± 1` and evaluates every gap layout when feasible.
 */
export declare function selectEvenlySpacedIndices(length: number, targetCount: number, options?: {
    data?: Record<string, unknown>[];
    dateLabels?: string[];
    xAccessor?: (d: Record<string, unknown>) => Date;
    resolveXPx?: (index: number) => number;
}): number[];
export declare function XAxis(props: XAxisProps): import("react").JSX.Element | null;
export declare namespace XAxis {
    var displayName: string;
}
export default XAxis;
