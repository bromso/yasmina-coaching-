export declare const BAR_DEPTH_MAX_PX = 7;
/** The side parallelogram's back edge lifts by `depth * this ratio`, giving a
 * subtle head-on perspective slope. */
export declare const BAR_DEPTH_PERSPECTIVE_RATIO = 0.45;
/**
 * Maximum side-face depth in px for a chart, clamped so depth never spills past
 * the gap between bars. `stepWidth` is d3-scaleBand's `step()` (bandwidth +
 * gap); `bandWidth` is a single bar's width. Returns 0 for gapless/dense charts.
 */
export declare function barDepthMaxDepth(stepWidth: number, bandWidth: number): number;
/**
 * Per-bar side-face depth + perspective rise.
 *
 * - `absOffset` ∈ [0, 1]: the bar's normalized distance from the chart's
 *   horizontal center. 0 = dead center (no depth); 1 = chart edge (full depth).
 * - `naturalHeight`: the bar's pixel height. Depth is capped by it so a short
 *   bar's side never reads wider than the bar is tall.
 * - `maxDepth`: from `barDepthMaxDepth`.
 */
export declare function barDepthAndRise(absOffset: number, naturalHeight: number, maxDepth: number): {
    depth: number;
    perspectiveRise: number;
};
