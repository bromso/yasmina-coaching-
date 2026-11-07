import type { Margin } from "./chart-context";
export interface BarChartLoadingProps {
    /** Chart margins. */
    margin?: Partial<Margin>;
    /** Aspect ratio as "width / height". Default: "2 / 1" */
    aspectRatio?: string;
    /** Additional class name for the container. */
    className?: string;
}
/**
 * Turnkey loading skeleton for bar charts, a thin shortcut for
 * `<BarChart status="loading" />`. Renders shimmer-swept placeholder bars while
 * data is fetching; swap in a real `<BarChart>` once it resolves.
 */
export declare function BarChartLoading({ margin, aspectRatio, className, }: BarChartLoadingProps): import("react").JSX.Element;
export default BarChartLoading;
