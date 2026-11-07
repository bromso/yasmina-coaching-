import type { Margin } from "../chart-context";
import type { HeatmapColumn } from "./heatmap-context";
export interface HeatmapChartLoadingProps {
    /** Target column data used to size the skeleton grid. */
    data: HeatmapColumn[];
    /** Visible time range — filters week columns that overlap the domain. */
    xDomain?: [Date, Date];
    /** Chart margins */
    margin?: Partial<Margin>;
    /** Gap between cells in pixels. Default: 2 */
    gap?: number;
    /** Corner radius for each cell. Default: 2 */
    cornerRadius?: number;
    /** Centered shimmer label text. Default: "Loading" */
    label?: string;
    /** Additional class name for the container */
    className?: string;
}
export declare function HeatmapChartLoading({ data, xDomain, margin, gap, cornerRadius, label, className, }: HeatmapChartLoadingProps): import("react").JSX.Element;
export default HeatmapChartLoading;
