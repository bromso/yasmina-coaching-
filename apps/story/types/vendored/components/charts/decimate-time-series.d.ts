export declare function decimateTimeSeries<T extends Record<string, unknown>>(data: T[], maxPoints: number, valueKeys?: string[]): T[];
/** ~1.5 points per pixel — enough for crisp curves without over-drawing. */
export declare function maxRenderPointsForWidth(innerWidth: number): number;
/** Bucket OHLC rows into fewer candles while preserving high/low extremes. */
export declare function decimateOhlcData<T extends Record<string, unknown>>(data: T[], maxPoints: number): T[];
