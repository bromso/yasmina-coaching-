export interface RadarLabelsProps {
    /** Distance from the chart edge. Default: 24 */
    offset?: number;
    /** Font size for labels. Default: 11 */
    fontSize?: number;
    /** Enable interactive hover on labels. Default: false */
    interactive?: boolean;
    /** Additional class name */
    className?: string;
}
export declare function RadarLabels({ offset, fontSize, interactive, className, }: RadarLabelsProps): import("react").JSX.Element;
export declare namespace RadarLabels {
    var displayName: string;
}
export default RadarLabels;
