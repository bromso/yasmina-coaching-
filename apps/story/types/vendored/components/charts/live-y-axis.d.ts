export interface LiveYAxisProps {
    /** Minimum pixel gap between labels. Default: 36 */
    minGap?: number;
    /** Position. Default: "left" */
    position?: "left" | "right";
    /** Value formatter */
    formatValue?: (v: number) => string;
    /** Allow decimal tick values. Default: true */
    allowDecimals?: boolean;
}
export declare function LiveYAxis(props: LiveYAxisProps): import("react").JSX.Element | null;
export declare namespace LiveYAxis {
    var displayName: string;
}
export default LiveYAxis;
