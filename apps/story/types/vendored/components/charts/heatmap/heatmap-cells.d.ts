export interface HeatmapCellsProps {
    /** Corner radius for each cell. Default: 2 */
    cornerRadius?: number;
    /** Override the default GitHub-style green color scale. */
    colorScale?: (count: number | null | undefined) => string;
    /** Opacity for inactive cells while hovering. Default: 0.3 */
    inactiveOpacity?: number;
    /** Scale for inactive cells while hovering. Default: 1 */
    inactiveScale?: number;
    /** Scale for the highlighted cell while hovering. Default: 1 */
    activeScale?: number;
    /** Per-row opacity multiplier (display row index). Default: 1 */
    rowOpacity?: number | readonly number[];
    /** Pointer hover + dimming. Default: true */
    interactive?: boolean;
    /** Hide out-of-range bins (GitHub-style ghost cells). Default: true */
    hideGhostCells?: boolean;
}
export declare const HeatmapCells: import("react").NamedExoticComponent<HeatmapCellsProps>;
export default HeatmapCells;
