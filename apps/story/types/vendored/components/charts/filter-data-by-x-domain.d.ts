export declare function filterDataByXDomain(data: Record<string, unknown>[], xDomain: [Date, Date], xAccessor: (d: Record<string, unknown>) => Date): Record<string, unknown>[];
export declare function resolveDataXExtent(data: Record<string, unknown>[], xAccessor: (d: Record<string, unknown>) => Date): [Date, Date] | null;
/** Brush track extent — optionally extends past the last data row (e.g. projections). */
export declare function resolveBrushTrackXExtent(data: Record<string, unknown>[], xAccessor: (d: Record<string, unknown>) => Date, xExtentMax?: Date): [Date, Date] | null;
