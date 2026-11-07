import type { Margin } from "./chart-context";
import type { LoadingStyle } from "./chart-phase";
export interface LineChartLoadingProps {
    /** Chart margins */
    margin?: Partial<Margin>;
    /** Stroke color for the animated loading segment. */
    stroke?: string;
    /** Stroke opacity for the animated loading segment. Default: 0.5 */
    strokeOpacity?: number;
    /** Grid line stroke (color and opacity via color-mix or oklch alpha). */
    gridStroke?: string;
    /** Shimmer band stroke (color and opacity via color-mix or oklch alpha). */
    gridShimmerStroke?: string;
    /** Animate a shimmer band across grid lines. Default: true */
    gridShimmer?: boolean;
    /** Shimmer band width in pixels. Default: 140 */
    gridShimmerLength?: number;
    /** Shimmer speed multiplier (higher = faster). Default: 1 */
    gridShimmerSpeed?: number;
    /** Match shimmer loop to the loading line pulse (cycle + inter-loop pause). */
    gridShimmerSync?: boolean;
    /** Loading animation: `"pulse"` (default traveling pulse) or `"sweep"` (a
     * diagonal shimmer across the skeleton line). Default: `"pulse"`. */
    loadingStyle?: LoadingStyle;
    /** Centered shimmer label text. Default: "Loading" */
    label?: string;
    /** Aspect ratio as "width / height". Default: "2 / 1" */
    aspectRatio?: string;
    /** Additional class name for the container */
    className?: string;
}
export declare function LineChartLoading({ margin, stroke, strokeOpacity, gridStroke, gridShimmerStroke, gridShimmer, gridShimmerLength, gridShimmerSpeed, gridShimmerSync, loadingStyle, label, aspectRatio, className, }: LineChartLoadingProps): import("react").JSX.Element;
export default LineChartLoading;
