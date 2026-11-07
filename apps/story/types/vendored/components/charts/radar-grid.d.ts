export interface RadarGridProps {
    /** Show level value labels. Default: true */
    showLabels?: boolean;
    /** Grid line stroke color. Default: var(--border) */
    stroke?: string;
    /** Grid line stroke opacity. Default: 0.6 */
    strokeOpacity?: number;
    /** Additional class name */
    className?: string;
}
export declare function RadarGrid({ showLabels, stroke, strokeOpacity, className, }: RadarGridProps): import("react").JSX.Element;
export declare namespace RadarGrid {
    var displayName: string;
}
export default RadarGrid;
