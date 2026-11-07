type CurveFactory = any;
export interface SeriesPathPoint {
    x: number;
    y: number;
    key: string;
}
export declare function computeSeriesPathPoints(data: Record<string, unknown>[], xAccessor: (datum: Record<string, unknown>) => Date, xScale: (value: Date) => number | undefined, yScale: (value: number) => number | undefined, dataKey: string): SeriesPathPoint[];
export declare function interpolateSeriesPathPoints(from: SeriesPathPoint[], to: SeriesPathPoint[], progress: number): SeriesPathPoint[];
export declare function seriesPathFromPoints(points: SeriesPathPoint[], curve: CurveFactory): string;
export declare function seriesPathTransitionSignature({ renderData, xAccessor, dataKey, innerWidth, xDomainMin, xDomainMax, }: {
    renderData: Record<string, unknown>[];
    xAccessor: (datum: Record<string, unknown>) => Date;
    dataKey: string;
    innerWidth: number;
    xDomainMin: number;
    xDomainMax: number;
}): string;
export {};
