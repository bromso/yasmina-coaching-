export interface ProfitLossSegment {
    data: Record<string, unknown>[];
    isPositive: boolean;
}
/** Split a single series into contiguous segments above/below zero. */
export declare function splitProfitLossSegments({ data, dataKey, xDataKey, xAccessor, }: {
    data: Record<string, unknown>[];
    dataKey: string;
    xDataKey?: string;
    xAccessor: (d: Record<string, unknown>) => Date;
}): ProfitLossSegment[];
