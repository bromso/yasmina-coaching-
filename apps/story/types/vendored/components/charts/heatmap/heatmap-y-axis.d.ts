import { type HeatmapYAxisLabelFormat, type HeatmapYAxisTickFilter } from "./heatmap-utils";
export interface HeatmapYAxisProps {
    /** Additional class name for labels */
    className?: string;
    /** Which row ticks to display. Default: `"odd"` (Mon / Wed / Fri). */
    tickFilter?: HeatmapYAxisTickFilter;
    /** Label format — `"initial"` shows the first letter only (Mon → M). Default: `"full"`. */
    labelFormat?: HeatmapYAxisLabelFormat;
    /** Per-row label opacity — mirrors {@link HeatmapCells} `rowOpacity`. */
    rowOpacity?: number | readonly number[];
}
export declare const HeatmapYAxis: import("react").NamedExoticComponent<HeatmapYAxisProps>;
export default HeatmapYAxis;
