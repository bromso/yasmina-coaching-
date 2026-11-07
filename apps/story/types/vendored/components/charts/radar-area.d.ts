export interface RadarAreaProps {
    /** Index of this area in the data array */
    index: number;
    /** Optional color override */
    color?: string;
    /** Show data point circles. Default: true */
    showPoints?: boolean;
    /** Show stroke outline on the polygon. Default: true */
    showStroke?: boolean;
    /** Show glow effect on hover. Default: true */
    showGlow?: boolean;
    /** Additional class name */
    className?: string;
}
export declare const RadarArea: import("react").NamedExoticComponent<RadarAreaProps>;
export default RadarArea;
