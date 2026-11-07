export interface LiveXAxisProps {
    /** Number of time labels. Default: 5 */
    numTicks?: number;
    /** Time formatter. Default: HH:MM:SS */
    formatTime?: (t: number) => string;
}
export declare function LiveXAxis(props: LiveXAxisProps): import("react").JSX.Element | null;
export declare namespace LiveXAxis {
    var displayName: string;
}
export default LiveXAxis;
