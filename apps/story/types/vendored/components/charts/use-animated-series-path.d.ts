type CurveFactory = any;
export interface UseAnimatedSeriesPathOptions {
    renderData: Record<string, unknown>[];
    xAccessor: (datum: Record<string, unknown>) => Date;
    xScale: (value: Date) => number | undefined;
    yScale: (value: number) => number | undefined;
    dataKey: string;
    curve: CurveFactory;
    chartPhase: string;
    durationMs: number;
    innerWidth: number;
    enabled: boolean;
}
export declare function useAnimatedSeriesPath({ renderData, xAccessor, xScale, yScale, dataKey, curve, chartPhase, durationMs, innerWidth, enabled, }: UseAnimatedSeriesPathOptions): {
    pathD: string;
    isPathAnimating: boolean;
};
export {};
