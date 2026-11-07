export interface RadarAxisProps {
    /** Axis line stroke color. Default: var(--border) */
    stroke?: string;
    /** Axis line stroke opacity. Default: 0.6 */
    strokeOpacity?: number;
    /** Additional class name */
    className?: string;
}
export declare function RadarAxis({ stroke, strokeOpacity, className, }: RadarAxisProps): import("react").JSX.Element;
export declare namespace RadarAxis {
    var displayName: string;
}
export default RadarAxis;
