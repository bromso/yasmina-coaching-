export declare const Y_AXIS_DEFAULT_TICK_COUNT = 5;
/** Minimum valid `numTicks` for `scale.ticks()` — values ≤ 0 yield no ticks. */
export declare const Y_AXIS_MIN_TICK_COUNT = 1;
/**
 * Upper bound for the tick count hint. D3 may return more "nice" ticks above ~10;
 * keeping the hint in a modest range avoids overcrowded axes.
 */
export declare const Y_AXIS_MAX_TICK_COUNT = 10;
/** Clamps a user `numTicks` value to a valid d3 tick-count hint. */
export declare function resolveYAxisTickCount(numTicks?: number): number;
